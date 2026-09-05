/**
 * Runs the Google Apps Script mailer with the Google services stubbed.
 *
 * The script is pasted into Apps Script by hand, so nothing else in the toolchain ever loads it:
 * it is not typechecked, not bundled and not linted for correctness against the Apps Script API.
 * Evaluating it here in a sandbox is what stops a delivery bug reaching the sales inbox — the
 * first version of this file swallowed the real error from `MailApp.sendEmail`, which left a
 * failure that nobody could diagnose from the website.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'google-apps-script/quote-inquiry.gs'), 'utf8');

/** A reply shaped like the one the quick-estimate function sends back. */
const estimateReply = JSON.stringify({
  estimate: {
    propertyType: 'residential',
    propertyTypeLabel: 'Residential',
    monthlyBill: 8000,
    monthlyKwh: 589,
    systemSizeKw: 4.91,
    panelCount: 8,
    estimatedTotal: 291000,
  },
});

/** Builds a fresh sandbox with the Apps Script services this script uses. */
function load({
  recipient = 'sales@example.com',
  failRich = false,
  failPlain = false,
  quotaThrows = false,
  estimateEndpoint = 'https://example.supabase.co/functions/v1/quick-estimate',
  estimateSecret = 'a-secret-long-enough',
  estimateStatus = 200,
  estimateBody = estimateReply,
  fetchThrows = false,
} = {}) {
  const sent = [];
  const logs = [];
  const fetched = [];
  const cache = new Map();

  const sandbox = {
    sent,
    logs,
    fetched,
    console: { log: (message) => logs.push(String(message)) },
    Logger: { log: (message) => logs.push(String(message)) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) =>
          ({
            RECIPIENT_EMAIL: recipient,
            ESTIMATE_ENDPOINT: estimateEndpoint,
            ESTIMATE_SHARED_SECRET: estimateSecret,
          })[key] ?? null,
      }),
    },
    UrlFetchApp: {
      fetch: (url, options) => {
        fetched.push({ url, options });
        if (fetchThrows) throw new Error('DNS lookup failed');
        return {
          getResponseCode: () => estimateStatus,
          getContentText: () => estimateBody,
        };
      },
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    CacheService: {
      getScriptCache: () => ({
        get: (key) => cache.get(key) ?? null,
        put: (key, value) => cache.set(key, value),
      }),
    },
    Utilities: { base64EncodeWebSafe: (value) => Buffer.from(value).toString('base64url') },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (text) => ({ setMimeType: () => ({ text }) }),
    },
    MailApp: {
      getRemainingDailyQuota: () => {
        if (quotaThrows) throw new Error('permission denied');
        return 97;
      },
      sendEmail: (...args) => {
        const rich = args.length === 1;
        if (rich && failRich) throw new Error('Invalid argument: name');
        if (!rich && failPlain) throw new Error('Service unavailable: Mail');
        sent.push(
          rich ? { mode: 'rich', ...args[0] } : { mode: 'plain', to: args[0], subject: args[1] },
        );
      },
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox;
}

const inquiry = (overrides = {}) => ({
  fullName: 'Juan dela Cruz',
  email: 'juan@example.com',
  phone: '0997-688-4865',
  installationDate: '2026-09-05',
  propertyType: 'residential',
  roofType: 'metal',
  floors: '2',
  address: '12 Rizal Street, Barangay San Jose, Pili',
  monthlyBill: '8000',
  website: '',
  elapsedMs: 9000,
  ...overrides,
});

const post = (box, payload) =>
  JSON.parse(box.doPost({ postData: { contents: JSON.stringify(payload) } }).text);

test('a valid inquiry is emailed to the configured mailbox', () => {
  const box = load();
  assert.equal(post(box, inquiry()).ok, true);
  assert.equal(box.sent.length, 1);
  assert.equal(box.sent[0].to, 'sales@example.com');
  assert.equal(box.sent[0].replyTo, 'juan@example.com', 'replying should reach the customer');
  assert.match(box.sent[0].body, /8,000/);
});

test('a refused formatted send falls back rather than losing the lead', () => {
  const box = load({ failRich: true });
  assert.equal(post(box, inquiry()).ok, true);
  assert.equal(box.sent[0].mode, 'plain');
  assert.ok(box.logs.some((line) => line.includes('Formatted send failed')));
});

test('a send that fails outright reports why instead of swallowing it', () => {
  const box = load({ failRich: true, failPlain: true });
  const result = post(box, inquiry());

  assert.equal(result.ok, false);
  // The visitor sees something calm; the operator gets the actual reason.
  assert.equal(result.error, 'The inquiry could not be emailed. Please try again.');
  assert.match(result.detail, /Service unavailable/);
  assert.ok(box.logs.some((line) => line.includes('Send failed')));
});

test('a misconfigured recipient is named rather than surfacing as a send failure', () => {
  const padded = load({ recipient: ' sales@example.com ' });
  assert.equal(post(padded, inquiry()).ok, true);
  assert.equal(padded.sent[0].to, 'sales@example.com', 'the address should be trimmed');

  const notAnAddress = load({ recipient: 'Sales Team' });
  assert.match(post(notAnAddress, inquiry()).error, /not a valid email address/);

  const unset = load({ recipient: '' });
  assert.equal(post(unset, inquiry()).ok, true);
  assert.equal(unset.sent[0].to, 'owner@example.com', 'it should fall back to the owner');
});

test('the health check separates the setup mistakes', () => {
  const healthy = JSON.parse(load().doGet().text);
  assert.equal(healthy.recipientConfigured, true);
  assert.equal(healthy.mailAuthorised, true);
  assert.equal(healthy.estimateConfigured, true);
  // The page is public, so the probe may report that pricing works but never what it costs.
  assert.equal(JSON.stringify(healthy).includes('291'), false);

  // Reading the quota needs the same permission as sending, so this is the authorisation signal.
  const unauthorised = JSON.parse(load({ quotaThrows: true }).doGet().text);
  assert.equal(unauthorised.mailAuthorised, false);

  const badMailbox = JSON.parse(load({ recipient: 'Sales Team' }).doGet().text);
  assert.equal(badMailbox.recipientConfigured, false);
  assert.ok(badMailbox.recipientProblem);

  const noPricing = JSON.parse(load({ estimateSecret: null }).doGet().text);
  assert.equal(noPricing.estimateConfigured, false);
  // Naming the property is the whole of the fix, so the reason says which one is missing.
  assert.equal(noPricing.estimateProblem, 'not configured (add ESTIMATE_SHARED_SECRET)');
});

test('the estimate is fetched server-side and carried into the email', () => {
  const box = load();
  const result = post(box, inquiry());

  assert.equal(result.ok, true);
  // The browser is told the figure only after the inquiry is safely in the inbox, and only as it
  // came back from the pricing service.
  assert.equal(result.estimate.estimatedTotal, 291000);

  const [call] = box.fetched;
  assert.equal(call.options.headers['x-estimate-secret'], 'a-secret-long-enough');
  assert.deepEqual(JSON.parse(call.options.payload), {
    propertyType: 'residential',
    monthlyBill: 8000,
  });

  // Sales sees the same number the customer saw, plus the working behind it.
  assert.match(box.sent[0].body, /Estimated cost shown to the customer: ₱291,000/);
  assert.match(box.sent[0].body, /Estimated system size: 4\.91 kW/);
  assert.match(box.sent[0].body, /Solar panels: 8/);
  assert.match(box.sent[0].subject, /New estimate request/);
});

test('a pricing failure never costs the inquiry', () => {
  const unreachable = load({ fetchThrows: true });
  const result = post(unreachable, inquiry());

  assert.equal(result.ok, true, 'the lead must still be delivered');
  assert.equal(result.estimate, null);
  assert.equal(unreachable.sent.length, 1);
  // Sales needs to know the customer was shown nothing, so the follow-up does not assume a figure.
  assert.match(unreachable.sent[0].body, /Estimate shown to the customer: None - unreachable/);
  assert.ok(unreachable.logs.some((line) => line.includes('Estimate unavailable')));

  const refused = load({
    estimateStatus: 401,
    estimateBody: JSON.stringify({ error: 'Not authorised.' }),
  });
  assert.equal(post(refused, inquiry()).ok, true);
  assert.match(refused.sent[0].body, /None - refused/);

  const unset = load({ estimateEndpoint: null, estimateSecret: null });
  assert.equal(post(unset, inquiry()).ok, true);
  assert.match(
    unset.sent[0].body,
    /None - not configured \(add ESTIMATE_ENDPOINT and ESTIMATE_SHARED_SECRET\)/,
  );
});

test('the property type is required and decides the tariff', () => {
  const box = load();
  assert.equal(post(box, inquiry({ propertyType: '' })).ok, false);
  assert.equal(post(box, inquiry({ propertyType: 'agricultural' })).ok, false);
  assert.equal(box.sent.length, 0, 'nothing should be priced or sent for an unknown type');

  const commercial = load();
  post(commercial, inquiry({ propertyType: 'commercial' }));
  assert.equal(JSON.parse(commercial.fetched[0].options.payload).propertyType, 'commercial');
  assert.match(commercial.sent[0].body, /Property type: Commercial/);
});

test('automated submissions are dropped and real ones are not', () => {
  const trapped = load();
  // Answered as a success so an automated caller learns nothing, but nothing is sent.
  assert.equal(post(trapped, inquiry({ website: 'http://spam' })).ok, true);
  assert.equal(trapped.sent.length, 0);

  const instant = load();
  assert.equal(post(instant, inquiry({ elapsedMs: 200 })).ok, true);
  assert.equal(instant.sent.length, 0);

  // A person using browser autofill can finish this quickly; that must still get through.
  const quickHuman = load();
  post(quickHuman, inquiry({ elapsedMs: 2600 }));
  assert.equal(quickHuman.sent.length, 1);
});

test('fields are validated again on the server', () => {
  const box = load();
  assert.equal(post(box, inquiry({ email: 'nope' })).ok, false);
  assert.equal(post(box, inquiry({ address: '' })).ok, false);
  assert.equal(post(box, inquiry({ roofType: 'thatch' })).ok, false);
  assert.equal(post(box, inquiry({ floors: '0' })).ok, false);
  assert.equal(box.sent.length, 0);
});

test('one address cannot flood the daily send quota', () => {
  const box = load();
  const outcomes = [1, 2, 3, 4].map(() => post(box, inquiry()).ok);
  assert.deepEqual(outcomes, [true, true, true, false]);
});

test('testMailer reports the problem by throwing', () => {
  assert.throws(() => load({ recipient: 'Sales Team' }).testMailer(), /not a valid email address/);

  const box = load();
  assert.match(box.testMailer(), /Sent to sales@example\.com/);
  assert.equal(box.sent.length, 1);
});
