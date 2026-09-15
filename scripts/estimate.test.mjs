/**
 * Exercises the real quick-estimate function.
 *
 * `supabase/functions/quick-estimate/index.ts` runs on Deno against Supabase, so it is not covered
 * by `tsc` and cannot be reached by the browser audit. This harness loads the actual source with
 * the Deno globals and the database client stubbed out, then calls the handler the same way the
 * Apps Script mailer does.
 *
 * It is the only automated check on two things that matter: that the arithmetic is right, and that
 * the endpoint cannot be reached without the shared secret. The second is what keeps the per-kW
 * price and the battery cost from being recovered by sampling two bills.
 *
 * Requires Node's TypeScript type stripping (`--experimental-strip-types`, see package.json).
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Mirrors the column defaults in supabase/migrations/202609060001_quick_estimate_settings.sql. */
const defaultSettings = {
  residential_rate_per_kwh: 13.59,
  commercial_rate_per_kwh: 12.44,
  industrial_rate_per_kwh: 10.98,
  peak_sun_hours: 4,
  days_per_month: 30,
  panel_watts: 620,
  price_per_kw: 41000,
  battery_cost: 90000,
  rounding_step: 1000,
};

let settingsRow = { ...defaultSettings };
let settingsError = null;

globalThis.__createClient = () => ({
  from: () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: settingsError ? null : settingsRow, error: settingsError }),
    };
    return builder;
  },
});

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  ESTIMATE_SHARED_SECRET: 'a-secret-long-enough',
};

globalThis.Deno = {
  serve: (handler) => {
    globalThis.__handler = handler;
  },
  env: { get: (key) => env[key] },
};

const source = await readFile(
  path.join(root, 'supabase/functions/quick-estimate/index.ts'),
  'utf8',
);
const patched = source.replace(
  /^import \{ createClient \} from 'npm:@supabase\/supabase-js@[^']+';$/m,
  'const createClient = globalThis.__createClient;',
);
assert.notEqual(patched, source, 'the createClient import should have been replaced');

const scratch = await mkdtemp(path.join(tmpdir(), 'sssb-estimate-'));
const modulePath = path.join(scratch, 'handler.ts');
await writeFile(modulePath, patched, 'utf8');
await import(pathToFileURL(modulePath).href);

const handler = globalThis.__handler;
assert.ok(handler, 'the edge function should register a request handler');

/** Calls the handler the way the mailer does, unless the test overrides the headers. */
async function call(body, { secret = 'a-secret-long-enough', origin = null } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (secret !== null) headers['x-estimate-secret'] = secret;
  if (origin) headers.Origin = origin;

  const response = await handler(
    new Request('https://functions.example/quick-estimate', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, payload: await response.json(), response };
}

test.beforeEach(() => {
  settingsRow = { ...defaultSettings };
  settingsError = null;
  env.ESTIMATE_SHARED_SECRET = 'a-secret-long-enough';
});

test('the figures follow the administrator settings', async () => {
  // 8000 / 13.59 = 588.67 kWh a month, 19.62 a day, over 4 peak hours = 4.91 kW.
  // 4.906 x 41,000 + 90,000 = 291,128, rounded to the nearest 1,000.
  const residential = await call({ propertyType: 'residential', monthlyBill: 8000 });
  assert.equal(residential.status, 200);
  assert.deepEqual(residential.payload.estimate, {
    propertyType: 'residential',
    propertyTypeLabel: 'Residential',
    monthlyBill: 8000,
    monthlyKwh: 589,
    systemSizeKw: 4.91,
    panelCount: 8,
    estimatedTotal: 291000,
  });

  // A lower tariff means the same bill buys more electricity, so the system has to be bigger.
  const commercial = await call({ propertyType: 'commercial', monthlyBill: 8000 });
  assert.equal(commercial.payload.estimate.systemSizeKw, 5.36);
  assert.equal(commercial.payload.estimate.panelCount, 9);
  assert.equal(commercial.payload.estimate.estimatedTotal, 310000);

  const industrial = await call({ propertyType: 'industrial', monthlyBill: 8000 });
  assert.equal(industrial.payload.estimate.systemSizeKw, 6.07);
  assert.equal(industrial.payload.estimate.panelCount, 10);
  assert.equal(industrial.payload.estimate.estimatedTotal, 339000);
});

test('an administrator change takes effect without a redeployment', async () => {
  const before = await call({ propertyType: 'residential', monthlyBill: 8000 });

  settingsRow = { ...defaultSettings, price_per_kw: 45000, battery_cost: 0, panel_watts: 550 };
  const after = await call({ propertyType: 'residential', monthlyBill: 8000 });

  // 4.906 x 45,000 with no battery.
  assert.equal(after.payload.estimate.estimatedTotal, 221000);
  assert.notEqual(after.payload.estimate.estimatedTotal, before.payload.estimate.estimatedTotal);
  // Smaller panels, so more of them are needed for the same system.
  assert.equal(after.payload.estimate.panelCount, 9);
});

test('the shared secret is the only way in', async () => {
  assert.equal(
    (await call({ propertyType: 'residential', monthlyBill: 8000 }, { secret: null })).status,
    401,
  );
  assert.equal(
    (
      await call(
        { propertyType: 'residential', monthlyBill: 8000 },
        { secret: 'wrong-but-same-len' },
      )
    ).status,
    401,
  );

  // Fails closed. An unset or trivially short secret must not leave pricing open to anyone.
  env.ESTIMATE_SHARED_SECRET = undefined;
  assert.equal((await call({ propertyType: 'residential', monthlyBill: 8000 })).status, 503);

  env.ESTIMATE_SHARED_SECRET = 'short';
  const weak = await call({ propertyType: 'residential', monthlyBill: 8000 }, { secret: 'short' });
  assert.equal(weak.status, 503);
});

test('a browser cannot reach the pricing endpoint', async () => {
  const fromBrowser = await call(
    { propertyType: 'residential', monthlyBill: 8000 },
    { origin: 'https://smartsavesolar.lifestyle' },
  );
  assert.equal(fromBrowser.status, 403);
  assert.equal(fromBrowser.payload.estimate, undefined);

  // Nothing is allowed through CORS either, so a fetch from a page cannot read a reply.
  const allowed = await call({ propertyType: 'residential', monthlyBill: 8000 });
  assert.equal(allowed.response.headers.get('Access-Control-Allow-Origin'), null);
});

test('the reply carries the finished figures and nothing behind them', async () => {
  const { payload } = await call({ propertyType: 'residential', monthlyBill: 8000 });

  // Adding a rate, a multiplier or a cost to this response would put the rate card in the email
  // and, from there, one relay away from the browser.
  assert.deepEqual(Object.keys(payload.estimate).sort(), [
    'estimatedTotal',
    'monthlyBill',
    'monthlyKwh',
    'panelCount',
    'propertyType',
    'propertyTypeLabel',
    'systemSizeKw',
  ]);
});

test('inputs are checked rather than trusted', async () => {
  assert.equal((await call({ propertyType: 'agricultural', monthlyBill: 8000 })).status, 400);
  assert.equal((await call({ monthlyBill: 8000 })).status, 400);
  assert.equal((await call({ propertyType: 'residential', monthlyBill: 0 })).status, 400);
  assert.equal((await call({ propertyType: 'residential', monthlyBill: -500 })).status, 400);
  assert.equal((await call({ propertyType: 'residential', monthlyBill: 'lots' })).status, 400);

  // Declined rather than quietly capped: a truncated figure would understate the system needed.
  const enormous = await call({ propertyType: 'residential', monthlyBill: 9_000_000 });
  assert.equal(enormous.status, 422);
  assert.equal(enormous.payload.estimate, undefined);
});

test('a settings problem is reported rather than guessed around', async () => {
  settingsError = { message: 'permission denied' };
  assert.equal((await call({ propertyType: 'residential', monthlyBill: 8000 })).status, 500);

  // A zero would divide by nothing or price the work at nothing; neither may reach a customer.
  settingsError = null;
  settingsRow = { ...defaultSettings, peak_sun_hours: 0 };
  assert.equal((await call({ propertyType: 'residential', monthlyBill: 8000 })).status, 500);

  settingsRow = { ...defaultSettings, residential_rate_per_kwh: 0 };
  assert.equal((await call({ propertyType: 'residential', monthlyBill: 8000 })).status, 500);
});
