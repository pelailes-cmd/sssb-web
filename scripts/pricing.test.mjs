/**
 * Exercises the real quotation pricing engine.
 *
 * `supabase/functions/quotation-estimate/index.ts` runs on Deno against Supabase, so it is not
 * covered by `tsc` and cannot be reached by the browser audit. This harness loads the actual
 * source with the Deno globals and the database client stubbed out, then calls the handler the
 * same way the website does. It is the only automated check that the arithmetic is right, so the
 * assertions below cover the money rather than the plumbing.
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

const defaultSettings = {
  currency_code: 'PHP',
  currency_symbol: '₱',
  validity_days: 30,
  rounding_step: 100,
  minimum_total: 0,
  residential_multiplier: 1,
  commercial_multiplier: 1,
  complexity_multipliers: { standard: 1, moderate: 1.15, complex: 1.35 },
  location_multipliers: { pili: 1, lipa: 1.05, other: 1.12 },
  sizing_assumptions: {
    tariff_per_kwh: 12,
    peak_sun_hours: 4.5,
    performance_ratio: 0.8,
    offset_target: 0.7,
    battery_day_fraction: 0.35,
  },
  client_notes: ['Note one.'],
  disclaimer: 'Disclaimer text.',
};

/** Mirrors the seed block in supabase/migrations/202608160001_quotation_system.sql. */
const seededCategories = [
  ['pv_modules', 'PV Modules', 'both', 'per_kw', 14000, null, 'with_pv', 10],
  ['hybrid_inverter', 'Hybrid Inverter', 'both', 'per_kw', 11000, null, 'with_pv', 20],
  ['battery_storage', 'Battery Energy Storage', 'both', 'per_kwh', 18000, null, 'with_battery', 30],
  ['mounting_system', 'Mounting System', 'both', 'per_kw', 4500, null, 'with_pv', 40],
  ['protection_devices', 'Protection and Breakers', 'both', 'per_kw', 2800, 6000, 'always', 50],
  ['cables_wiring', 'Cables and Wiring', 'both', 'per_kw', 3200, 6000, 'always', 60],
  ['consumables', 'Materials and Consumables', 'both', 'per_kw', 1800, 4000, 'always', 70],
  ['installation_labor', 'Installation / Labor', 'both', 'per_kw', 8500, 15000, 'always', 80],
  [
    'backup_changeover',
    'Backup and Changeover Provision',
    'both',
    'fixed',
    18000,
    null,
    'with_backup',
    90,
  ],
  [
    'testing_commissioning',
    'Testing and Commissioning',
    'both',
    'fixed',
    6000,
    null,
    'always',
    100,
  ],
  ['transport_logistics', 'Transportation / Logistics', 'both', 'fixed', 5000, null, 'always', 110],
  [
    'site_preparation',
    'Site Preparation and Civil Works',
    'commercial',
    'per_sqm',
    45,
    null,
    'commercial_only',
    120,
  ],
  [
    'distribution_upgrade',
    'Distribution and Riser Provision',
    'commercial',
    'per_floor',
    12000,
    null,
    'commercial_only',
    130,
  ],
  [
    'design_documentation',
    'Design and Documentation',
    'commercial',
    'percent_of_subtotal',
    2.5,
    12000,
    'commercial_only',
    140,
  ],
  ['engineering_fee', 'Engineering Fee', 'both', 'percent_of_subtotal', 3.5, 8000, 'always', 150],
  [
    'project_management',
    'Administration / Project Management',
    'both',
    'percent_of_subtotal',
    4,
    8000,
    'always',
    160,
  ],
].map(([key, label, sector, basis, rate, minAmount, appliesWhen, position]) => ({
  key,
  label,
  sector,
  basis,
  rate,
  min_amount: minAmount,
  max_amount: null,
  applies_when: appliesWhen,
  position,
}));

let categories = seededCategories;
let settingsOverride = null;

function makeQuery(table) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({
      data: table === 'quote_settings' ? { ...defaultSettings, ...(settingsOverride ?? {}) } : null,
      error: null,
    }),
    insert: async () => ({ data: null, error: null }),
  };
  builder.then = (resolve) => {
    if (table === 'quote_categories') resolve({ data: categories, error: null, count: null });
    else resolve({ data: [], error: null, count: 0 });
  };
  return builder;
}

let issued = 0;

globalThis.__createClient = () => ({
  from: (table) => makeQuery(table),
  rpc: async () => {
    issued += 1;
    return { data: `SSS-2026-${String(issued).padStart(4, '0')}`, error: null };
  },
});

globalThis.Deno = {
  serve: (handler) => {
    globalThis.__handler = handler;
  },
  env: {
    get: (key) =>
      ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-key' })[key],
  },
};

const source = await readFile(
  path.join(root, 'supabase/functions/quotation-estimate/index.ts'),
  'utf8',
);
const patched = source.replace(
  /^import \{ createClient \} from 'npm:@supabase\/supabase-js@[^']+';$/m,
  'const createClient = globalThis.__createClient;',
);
assert.notEqual(patched, source, 'the createClient import should have been replaced');

const scratch = await mkdtemp(path.join(tmpdir(), 'sssb-pricing-'));
const modulePath = path.join(scratch, 'handler.ts');
await writeFile(modulePath, patched, 'utf8');
await import(pathToFileURL(modulePath).href);

const handler = globalThis.__handler;
assert.ok(handler, 'the edge function should register a request handler');

const baseInput = {
  location: 'Pili',
  serviceArea: 'pili',
  electricalService: 'single_phase_230',
  clientName: 'Test Client',
  clientContact: '09170000000',
};

async function post(body, headers = {}) {
  return handler(
    new Request('https://example.com/quotation-estimate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://pelailes-cmd.github.io',
        'x-forwarded-for': '203.0.113.7',
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

async function estimate(sector, input, overrides = null) {
  settingsOverride = overrides;
  const response = await post({ action: 'estimate', sector, input });
  const payload = await response.json();
  settingsOverride = null;
  assert.equal(response.status, 200, `expected a priced estimate, got ${JSON.stringify(payload)}`);
  return payload.quotation;
}

const sumOf = (quotation) => quotation.lineItems.reduce((total, item) => total + item.amount, 0);

test('the printed lines always add up to the printed total', async () => {
  const residential = await estimate('residential', {
    ...baseInput,
    projectType: 'new_installation',
    systemType: 'grid_tied',
    monthlyBill: 8000,
    pvRequired: true,
    batteryRequired: false,
  });
  assert.equal(sumOf(residential), residential.estimatedTotal);

  const commercial = await estimate('commercial', {
    ...baseInput,
    projectType: 'warehouse_or_industrial',
    systemType: 'hybrid',
    floorArea: 2000,
    floors: 4,
    estimatedLoadKw: 120,
    complexity: 'complex',
    monthlyBill: 400000,
    pvRequired: true,
    batteryRequired: true,
    backupRequired: true,
  });
  assert.equal(sumOf(commercial), commercial.estimatedTotal);
  assert.ok(commercial.lineItems.some((item) => /Site Preparation/.test(item.label)));
  assert.ok(commercial.lineItems.some((item) => /Backup/.test(item.label)));
});

test('a stated capacity is honoured and the service-area multiplier is applied', async () => {
  const quotation = await estimate('residential', {
    ...baseInput,
    serviceArea: 'lipa',
    projectType: 'new_installation',
    systemType: 'hybrid',
    monthlyBill: 12000,
    pvRequired: true,
    pvCapacityKwp: 10,
    batteryRequired: true,
    batteryKwh: 15,
  });
  assert.equal(quotation.systemSizeKwp, 10);
  assert.equal(quotation.batteryKwh, 15);
  // 14,000 per kWp x 10 kWp x 1.05 for Lipa.
  const modules = quotation.lineItems.find((item) => item.label === 'PV Modules');
  assert.equal(modules.amount, 147000);
});

test('a battery-only project is still charged for the work it needs', async () => {
  const quotation = await estimate('residential', {
    ...baseInput,
    projectType: 'backup_only',
    systemType: 'hybrid',
    monthlyBill: 6000,
    pvRequired: false,
    batteryRequired: true,
    batteryKwh: 15,
  });

  // Labour, cabling, protection and consumables are all rated per kW of PV. With no array they
  // compute to zero, and without the configured minimum they would be quoted at nothing.
  const labour = quotation.lineItems.find((item) => item.label === 'Installation / Labor');
  assert.ok(labour && labour.amount > 0, 'installation labour must be charged');
  assert.ok(quotation.lineItems.some((item) => item.label === 'Cables and Wiring'));
  assert.ok(!quotation.lineItems.some((item) => item.label === 'PV Modules'));
  assert.equal(sumOf(quotation), quotation.estimatedTotal);
});

test('roof area caps the system size instead of inflating it', async () => {
  const quotation = await estimate('residential', {
    ...baseInput,
    projectType: 'new_installation',
    systemType: 'grid_tied',
    monthlyBill: 1500,
    floorArea: 400,
    pvRequired: true,
    batteryRequired: false,
  });
  assert.ok(
    quotation.systemSizeKwp <= 3.5,
    `a small bill must not be sized up to the roof: ${quotation.systemSizeKwp} kWp`,
  );
});

test('the configured electricity tariff changes the sizing', async () => {
  const input = {
    ...baseInput,
    projectType: 'new_installation',
    systemType: 'grid_tied',
    monthlyBill: 13500,
    pvRequired: true,
    batteryRequired: false,
  };
  const atDefault = await estimate('residential', input);
  const atHigherTariff = await estimate('residential', input, {
    sizing_assumptions: { ...defaultSettings.sizing_assumptions, tariff_per_kwh: 13.5 },
  });
  assert.notEqual(
    atDefault.systemSizeKwp,
    atHigherTariff.systemSizeKwp,
    'a tariff above 10 must not be discarded',
  );
});

test('a configured cap holds after the multipliers are applied', async () => {
  categories = seededCategories.map((category) =>
    category.key === 'transport_logistics' ? { ...category, max_amount: 5000 } : category,
  );
  try {
    const quotation = await estimate('commercial', {
      ...baseInput,
      serviceArea: 'other',
      projectType: 'warehouse_or_industrial',
      systemType: 'hybrid',
      floorArea: 1000,
      floors: 2,
      complexity: 'complex',
      monthlyBill: 100000,
      pvRequired: true,
      batteryRequired: false,
    });
    const line = quotation.lineItems.find((item) => /Transportation/.test(item.label));
    assert.ok(line.amount <= 5000, `cap exceeded: ${line.amount}`);
  } finally {
    categories = seededCategories;
  }
});

test('the minimum project total is never undershot', async () => {
  const quotation = await estimate(
    'residential',
    {
      ...baseInput,
      projectType: 'new_installation',
      systemType: 'grid_tied',
      monthlyBill: 3000,
      pvRequired: true,
      batteryRequired: false,
    },
    { minimum_total: 250040 },
  );
  assert.ok(quotation.estimatedTotal >= 250040, `below the minimum: ${quotation.estimatedTotal}`);
  assert.equal(sumOf(quotation), quotation.estimatedTotal);
});

test('hostile and stale inputs cannot steer the estimate', async () => {
  // An unbounded quantity would let a caller divide a line by it and recover the rate.
  const oversized = await estimate('residential', {
    ...baseInput,
    projectType: 'new_installation',
    systemType: 'grid_tied',
    monthlyBill: 8000,
    pvRequired: true,
    pvCapacityKwp: 20000,
    batteryRequired: false,
  });
  assert.ok(oversized.systemSizeKwp <= 30, 'residential capacity must be bounded');

  // Connected load is a commercial answer; a stale value must not resize a residential system.
  const stale = await estimate('residential', {
    ...baseInput,
    projectType: 'new_installation',
    systemType: 'grid_tied',
    monthlyBill: 8000,
    estimatedLoadKw: 120,
    pvRequired: true,
    batteryRequired: false,
  });
  assert.ok(stale.systemSizeKwp <= 8, `stale commercial load leaked: ${stale.systemSizeKwp} kWp`);
});

test('malformed requests fail closed with JSON and CORS intact', async () => {
  const nullBody = await post('null');
  assert.equal(nullBody.status, 400);
  assert.equal(
    nullBody.headers.get('Access-Control-Allow-Origin'),
    'https://pelailes-cmd.github.io',
  );
  assert.ok((await nullBody.json()).error);

  const notJson = await post('{');
  assert.equal(notJson.status, 400);

  const unknownAction = await post({ action: 'delete-everything' });
  assert.equal(unknownAction.status, 400);

  const oversized = await post('x'.repeat(20000));
  assert.equal(oversized.status, 413);

  const badOrigin = await post({ action: 'estimate' }, { Origin: 'https://evil.example' });
  assert.equal(badOrigin.status, 403);
});

test('the response discloses category labels and amounts only', async () => {
  const quotation = await estimate('residential', {
    ...baseInput,
    projectType: 'new_installation',
    systemType: 'hybrid',
    monthlyBill: 8000,
    pvRequired: true,
    batteryRequired: true,
  });

  for (const item of quotation.lineItems) {
    assert.deepEqual(Object.keys(item).sort(), ['amount', 'label']);
  }

  const serialized = JSON.stringify(quotation).toLowerCase();
  for (const word of ['rate', 'basis', 'multiplier', 'min_amount', 'max_amount', 'margin']) {
    assert.ok(!serialized.includes(word), `the response must not mention ${word}`);
  }
});
