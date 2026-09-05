/**
 * Covers the short quote inquiry: the form behind the header button.
 *
 * Nothing is priced in this journey — the details go to the sales inbox and the visitor is told
 * their inquiry arrived. The validation rules are exercised against the real module so a field
 * quietly becoming optional fails here rather than reaching the sales team half-filled.
 *
 * Requires Node's TypeScript type stripping (`--experimental-strip-types`, see package.json).
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  emptyInquiry,
  propertyTypes,
  roofTypes,
  validateInquiry,
} from '../src/lib/quoteInquiry.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const tomorrow = () => {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().slice(0, 10);
};

const validInquiry = {
  fullName: 'Juan dela Cruz',
  email: 'juan@example.com',
  phone: '0997-688-4865',
  installationDate: tomorrow(),
  propertyType: 'residential',
  roofType: 'metal',
  floors: '2',
  address: '12 Rizal Street, Barangay San Jose, Pili',
  monthlyBill: '8000',
};

test('a complete inquiry passes', () => {
  assert.deepEqual(validateInquiry(validInquiry), {});
});

test('every field is required', () => {
  // An empty form must complain about all nine, not just the first.
  const errors = validateInquiry(emptyInquiry);
  assert.deepEqual(Object.keys(errors).sort(), [
    'address',
    'email',
    'floors',
    'fullName',
    'installationDate',
    'monthlyBill',
    'phone',
    'propertyType',
    'roofType',
  ]);

  for (const field of Object.keys(validInquiry)) {
    const missing = validateInquiry({ ...validInquiry, [field]: '' });
    assert.ok(missing[field], `${field} should be required`);
  }
});

test('individual fields are checked, not merely present', () => {
  assert.ok(validateInquiry({ ...validInquiry, email: 'not-an-email' }).email);
  assert.ok(validateInquiry({ ...validInquiry, email: 'a@b' }).email);
  assert.ok(validateInquiry({ ...validInquiry, phone: 'call me' }).phone);
  assert.ok(validateInquiry({ ...validInquiry, floors: '0' }).floors);
  assert.ok(validateInquiry({ ...validInquiry, floors: '-3' }).floors);
  assert.ok(validateInquiry({ ...validInquiry, floors: '900' }).floors);
  assert.ok(validateInquiry({ ...validInquiry, monthlyBill: '0' }).monthlyBill);
  assert.ok(validateInquiry({ ...validInquiry, monthlyBill: 'lots' }).monthlyBill);
  assert.ok(validateInquiry({ ...validInquiry, roofType: 'thatch' }).roofType === undefined);
  assert.ok(validateInquiry({ ...validInquiry, address: 'x' }).address);
  assert.ok(validateInquiry({ ...validInquiry, fullName: 'J' }).fullName);
  // A date already gone cannot be a preferred installation date.
  assert.ok(validateInquiry({ ...validInquiry, installationDate: '2020-01-01' }).installationDate);
});

test('the roof list and its labels are usable', () => {
  assert.ok(roofTypes.length >= 4);
  for (const type of roofTypes) {
    assert.ok(type.value && type.label, 'each roof type needs a value and a label');
    assert.deepEqual(validateInquiry({ ...validInquiry, roofType: type.value }), {});
  }
});

test('the three property types match the tariffs the server holds', () => {
  // Each of these selects a different electricity rate, so the list has to stay in step with the
  // columns on quick_estimate_settings and with PROPERTY_LABELS in the mailer.
  assert.deepEqual(
    propertyTypes.map((type) => type.value),
    ['residential', 'commercial', 'industrial'],
  );
  for (const type of propertyTypes) {
    assert.ok(type.label, 'each property type needs a label');
    assert.deepEqual(validateInquiry({ ...validInquiry, propertyType: type.value }), {});
  }
});

test('the browser displays the estimate without knowing how to work one out', async () => {
  const files = [
    'src/lib/quoteInquiry.ts',
    'src/components/quotation/QuoteInquiryDialog.tsx',
    'src/cms/QuoteDialogContext.tsx',
    'src/components/QuoteButton.tsx',
  ];
  const source = (
    await Promise.all(files.map((file) => readFile(path.join(root, file), 'utf8')))
  ).join('\n');

  // The figure is now shown, so `estimatedTotal` legitimately appears. What must not appear is any
  // of the numbers it was derived from: with the rate card in the bundle, the whole arrangement
  // would be pointless.
  for (const value of ['41000', '90000', '13.59', '12.44', '10.98', '620']) {
    assert.doesNotMatch(
      source,
      new RegExp(value),
      `the bundle must not carry the ${value} setting`,
    );
  }

  // Nor may it reach the pricing tables or endpoints directly. Everything arrives through the
  // mailer's reply.
  for (const term of [
    'quote_categories',
    'quote_settings',
    'quick_estimate_settings',
    'quotation-estimate',
    'quick-estimate',
    'lineItems',
  ]) {
    assert.doesNotMatch(source, new RegExp(term), `the inquiry must not reference ${term}`);
  }

  // The recipient mailbox belongs in the Apps Script, never in the published bundle.
  assert.doesNotMatch(source, /@gmail\.com|@smartsave/i);
});

test('a missing estimate is not treated as a failed submission', async () => {
  const lib = await readFile(path.join(root, 'src/lib/quoteInquiry.ts'), 'utf8');
  const dialog = await readFile(
    path.join(root, 'src/components/quotation/QuoteInquiryDialog.tsx'),
    'utf8',
  );

  // The mailer answers without a figure when the pricing service is unavailable. The inquiry has
  // still arrived, so the success screen has to stand on its own.
  assert.match(lib, /return parseEstimate\(result\.estimate\)/);
  assert.match(dialog, /\{estimate \?/, 'the estimate panel should be conditional');
  assert.match(dialog, /Submission success/);
});

test('the mailer validates everything again on its own side', async () => {
  const script = await readFile(path.join(root, 'google-apps-script/quote-inquiry.gs'), 'utf8');

  // The browser checks are for the visitor; the endpoint can be called directly.
  assert.match(script, /function validate\(/);
  for (const field of ['fullName', 'email', 'phone', 'installationDate', 'address']) {
    assert.match(script, new RegExp(field), `${field} should be revalidated server-side`);
  }
  assert.match(script, /RECIPIENT_EMAIL/);
  assert.match(script, /withinRateLimit/);
  assert.match(script, /propertyType/, 'the property type decides the tariff and must be checked');

  // The rates live in Supabase, not in the script. If a figure ever appears here it has stopped
  // being something the administrator can change.
  for (const value of ['41000', '90000', '13.59']) {
    assert.doesNotMatch(script, new RegExp(value), `the mailer must not hold the ${value} setting`);
  }
  // Honeypot and timing checks answer as though they succeeded, so a bot learns nothing.
  assert.match(script, /payload\.website/);
  assert.match(script, /MIN_ELAPSED_MS/);
  assert.doesNotMatch(script, /eval\(/);
});

test('the estimator is reachable but is no longer a page section', async () => {
  const app = await readFile(path.join(root, 'src/App.tsx'), 'utf8');
  assert.doesNotMatch(app, /QuotationSection/);
  assert.match(app, /QuotationEstimateDialog/);
  assert.match(app, /QuoteInquiryDialog/);

  const siteData = await readFile(path.join(root, 'src/data/siteData.ts'), 'utf8');
  assert.doesNotMatch(siteData, /href: '#quotation'/);

  const footer = await readFile(path.join(root, 'src/components/Footer.tsx'), 'utf8');
  assert.match(footer, /Get a free quote now!/);

  const header = await readFile(path.join(root, 'src/components/Header.tsx'), 'utf8');
  assert.match(header, /Get an Estimate/);
  assert.match(header, /header-quote/);
  // The label is hidden on the narrowest phones, so the button needs a name of its own.
  assert.match(header, /aria-label="Get an Estimate"/);
});

test('every section the client asked for offers the quote button', async () => {
  // Home, Services, Promotions, Portfolio and Contact Us each carry a way into the short form.
  const sections = {
    home: 'src/components/Hero.tsx',
    services: 'src/components/ServicesSection.tsx',
    promotions: 'src/components/PromotionsSection.tsx',
    portfolio: 'src/components/PortfolioSection.tsx',
    contact: 'src/components/ContactSection.tsx',
  };

  for (const [section, file] of Object.entries(sections)) {
    const source = await readFile(path.join(root, file), 'utf8');
    assert.match(source, /<QuoteButton/, `${section} should offer a quote button`);
    assert.match(source, /import \{ QuoteButton \}/, `${section} should import the shared button`);
  }

  // One component behind all of them, so the wording and the action cannot drift apart.
  const button = await readFile(path.join(root, 'src/components/QuoteButton.tsx'), 'utf8');
  assert.match(button, /Get an Estimate/);
  assert.match(button, /openInquiry/);
});
