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
  estimateRecipient = null,
  orderRecipient = null,
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
            ESTIMATE_RECIPIENT_EMAIL: estimateRecipient,
            ORDER_RECIPIENT_EMAIL: orderRecipient,
            ESTIMATE_ENDPOINT: estimateEndpoint,
            ESTIMATE_SHARED_SECRET: estimateSecret,
          })[key] ?? null,
      }),
    },
    UrlFetchApp: {
      fetch: (url, options) => {
        fetched.push({ url, options });
        if (fetchThrows) {
          throw new Error(typeof fetchThrows === 'string' ? fetchThrows : 'DNS lookup failed');
        }
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

test('a missing fetch permission is not reported as a network problem', () => {
  // Fetching an external URL is a permission the project did not need until the estimate was
  // added, so a deployment authorised before then fails every attempt. Calling that "unreachable"
  // sends the operator hunting a URL that was right all along.
  const denied =
    'Exception: You do not have permission to call UrlFetchApp.fetch. Required permissions: ' +
    'https://www.googleapis.com/auth/script.external_request';

  const box = load({ fetchThrows: denied });
  assert.equal(post(box, inquiry()).ok, true, 'the lead must still be delivered');
  assert.match(box.sent[0].body, /None - not authorised to fetch/);
  // The email is internal, so it carries the exact reason rather than only the category.
  assert.match(box.sent[0].body, /script\.external_request/);

  const health = JSON.parse(load({ fetchThrows: denied }).doGet().text);
  assert.equal(health.estimateProblem, 'not authorised to fetch');
  // The health check page is public, so the detail stays out of it.
  assert.equal(JSON.stringify(health).includes('external_request'), false);
});

test('testEstimate lets an authorisation error escape rather than reporting it', () => {
  // The whole point of running it from the editor is to be offered the consent screen. Apps Script
  // only offers it when the authorisation error goes unhandled, so this one call must not be
  // wrapped the way the submission path wraps it.
  const denied = 'Exception: You do not have permission to call UrlFetchApp.fetch.';
  assert.throws(() => load({ fetchThrows: denied }).testEstimate(), /do not have permission/);

  assert.throws(
    () => load({ estimateEndpoint: null }).testEstimate(),
    /ESTIMATE_ENDPOINT is not set/,
  );

  // Anything the service itself refuses is still reported plainly, since no prompt would help.
  const refused = load({
    estimateStatus: 401,
    estimateBody: JSON.stringify({ error: 'Not authorised.' }),
  });
  assert.throws(() => refused.testEstimate(), /refused/);

  const box = load();
  assert.match(box.testEstimate(), /reachable/);
  // The unguarded probe, then the real request.
  assert.equal(box.fetched.length, 2);
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
  // The lenient number parse strips currency symbols and separators; it must not strip the sign
  // as well, or a negative would arrive as its own positive.
  assert.equal(post(box, inquiry({ floors: '-2' })).ok, false);
  assert.equal(post(box, inquiry({ monthlyBill: '-8000' })).ok, false);
  assert.equal(box.sent.length, 0);
});

const order = (overrides = {}) => ({
  type: 'order',
  fullName: 'Juan dela Cruz',
  email: 'juan@example.com',
  phone: '0997-688-4865',
  address: '12 Rizal Street, Barangay San Jose, Pili',
  landmark: 'Beside the covered court',
  paymentMethod: 'gcash',
  voucher: '',
  lines: [
    {
      productId: 'panel',
      name: '620W Panel',
      category: 'Solar Panels',
      branch: 'pili',
      unitPrice: 12000,
      quantity: 2,
    },
    {
      productId: 'inverter',
      name: '8kW Inverter',
      category: 'Inverters',
      branch: 'lipa',
      unitPrice: 55000,
      quantity: 1,
    },
  ],
  website: '',
  elapsedMs: 9000,
  ...overrides,
});

test('a checked-out cart is emailed with a reference sales can quote back', () => {
  const box = load();
  const result = post(box, order());

  assert.equal(result.ok, true);
  assert.match(result.receipt.reference, /^SSS-\d{6}-[0-9A-Z]{3}$/);
  assert.equal(result.receipt.itemCount, 3);
  assert.equal(result.receipt.total, 79000);

  const [sent] = box.sent;
  assert.match(sent.subject, /^New order SSS-/);
  assert.equal(sent.replyTo, 'juan@example.com', 'replying should reach the customer');
  assert.match(sent.body, /2 x 620W Panel \(Pili, Camarines Sur\)/);
  assert.match(sent.body, /1 x 8kW Inverter \(Lipa City, Batangas\)/);
  assert.match(sent.body, /Total for 3 item\(s\): ₱79,000/);
  assert.match(sent.body, /Mode of payment: GCash/);
  assert.match(sent.body, /Landmark: Beside the covered court/);
  assert.match(sent.body, /Voucher code: None given/);
  // Sales must not be left wondering whether money already moved.
  assert.match(sent.body, /No payment has been taken/);

  // Orders never reach the pricing service; that is only for the bill-based estimate.
  assert.equal(box.fetched.length, 0);
});

test('the order total is recomputed rather than taken from the browser', () => {
  const box = load();
  // A tampered cart claiming a total of one peso still gets priced from its own lines.
  const result = post(box, order({ total: 1, itemCount: 999 }));

  assert.equal(result.receipt.total, 79000);
  assert.equal(result.receipt.itemCount, 3);
  assert.match(box.sent[0].body, /₱79,000/);
});

test('a voucher is carried to sales rather than discounted here', () => {
  const box = load();
  assert.equal(post(box, order({ voucher: 'SAVE-2026' })).ok, true);
  assert.match(box.sent[0].body, /Voucher code: SAVE-2026/);
  // The figure sales reads is the undiscounted one; they apply the code themselves.
  assert.match(box.sent[0].body, /₱79,000/);

  const bad = load();
  assert.equal(post(bad, order({ voucher: 'not a code' })).ok, false);
  assert.equal(bad.sent.length, 0);
});

test('an order is checked line by line before anything is sent', () => {
  const box = load();
  const lineWith = (changes) => order({ lines: [{ ...order().lines[0], ...changes }] });

  assert.equal(post(box, order({ lines: [] })).ok, false);
  assert.equal(post(box, order({ paymentMethod: 'crypto' })).ok, false);
  assert.equal(post(box, order({ landmark: '' })).ok, false);
  assert.equal(post(box, order({ address: 'too short' })).ok, false);
  assert.equal(post(box, lineWith({ branch: 'mars' })).ok, false);
  assert.equal(post(box, lineWith({ quantity: 0 })).ok, false);
  assert.equal(post(box, lineWith({ quantity: 2.5 })).ok, false);
  assert.equal(post(box, lineWith({ quantity: 1000 })).ok, false);
  assert.equal(post(box, lineWith({ unitPrice: -5 })).ok, false);
  assert.equal(post(box, lineWith({ name: '' })).ok, false);
  assert.equal(box.sent.length, 0, 'nothing invalid should reach the inbox');
});

test('several sales addresses can share one notification', () => {
  const box = load({ recipient: 'sales@example.com, admin@example.com' });
  assert.equal(post(box, inquiry()).ok, true);
  assert.equal(box.sent[0].to, 'sales@example.com,admin@example.com');

  // Commas, semicolons, spaces and line breaks all separate, because people type these by hand.
  const mixed = load({
    recipient: 'one@example.com;two@example.com\nthree@example.com four@example.com',
  });
  post(mixed, inquiry());
  assert.equal(
    mixed.sent[0].to,
    'one@example.com,two@example.com,three@example.com,four@example.com',
  );

  // The same mailbox listed twice would deliver two copies and cost two of the day's recipients.
  const duplicated = load({ recipient: 'sales@example.com, SALES@example.com' });
  post(duplicated, inquiry());
  assert.equal(duplicated.sent[0].to, 'sales@example.com');
});

test('orders and estimate requests can go to different desks', () => {
  const box = load({
    recipient: 'fallback@example.com',
    estimateRecipient: 'estimates@example.com',
    orderRecipient: 'orders@example.com, warehouse@example.com',
  });

  post(box, inquiry());
  assert.equal(box.sent[0].to, 'estimates@example.com');

  post(box, order({ email: 'someone-else@example.com' }));
  assert.equal(box.sent[1].to, 'orders@example.com,warehouse@example.com');

  // With neither routed, both kinds fall back to the one property.
  const shared = load({ recipient: 'fallback@example.com' });
  post(shared, inquiry());
  post(shared, order({ email: 'another@example.com' }));
  assert.equal(shared.sent[0].to, 'fallback@example.com');
  assert.equal(shared.sent[1].to, 'fallback@example.com');
});

test('a bad address in the list stops the send without naming it publicly', () => {
  const box = load({ recipient: 'sales@example.com, not-an-address' });
  const result = post(box, inquiry());

  assert.equal(result.ok, false);
  assert.match(result.error, /not a valid email address/);
  assert.equal(box.sent.length, 0, 'one bad address must not half-send to the good ones');
  // The reply reaches a visitor's browser, so the offending value belongs in the log instead.
  assert.equal(JSON.stringify(result).includes('not-an-address'), false);
  assert.ok(box.logs.some((line) => line.includes('not-an-address')));

  // The health check is a public page: it reports how many are configured, never who they are.
  const health = JSON.parse(load({ recipient: 'a@example.com, b@example.com' }).doGet().text);
  assert.equal(health.estimateRecipients, 2);
  assert.equal(health.orderRecipients, 2);
  assert.equal(JSON.stringify(health).includes('a@example.com'), false);
});

test('too many recipients is refused rather than quietly draining the quota', () => {
  const many = Array.from({ length: 7 }, (_, index) => `person${index}@example.com`).join(',');
  const box = load({ recipient: many });
  const result = post(box, inquiry());

  assert.equal(result.ok, false);
  assert.match(result.error, /Too many recipients/);
  assert.equal(box.sent.length, 0);
});

test('orders pass the same spam checks as estimate requests', () => {
  const trapped = load();
  assert.equal(post(trapped, order({ website: 'http://spam' })).ok, true);
  assert.equal(trapped.sent.length, 0);

  const instant = load();
  assert.equal(post(instant, order({ elapsedMs: 200 })).ok, true);
  assert.equal(instant.sent.length, 0);
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
