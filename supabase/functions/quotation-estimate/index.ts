import { createClient } from 'npm:@supabase/supabase-js@2.110.8';

// Public quotation endpoint. Deploy this function with JWT verification DISABLED: website
// visitors are not signed in, and supabase-js omits the Authorization header entirely when a
// publishable key is used without a session.
//
// Everything that could reveal the company's pricing structure stays inside this function.
// Rates, multipliers, fee percentages, minimum charges and the per-category basis are read with
// the service role and never leave the server. The response carries only the generic category
// labels an administrator configured, their rounded amounts, and the total.

const allowedOrigins = new Set([
  'https://pelailes-cmd.github.io',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]);

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function jsonResponse(origin: string | null, payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

type SettingsRow = {
  currency_code: string;
  currency_symbol: string;
  validity_days: number;
  rounding_step: number;
  minimum_total: number;
  residential_multiplier: number;
  commercial_multiplier: number;
  complexity_multipliers: Record<string, unknown>;
  location_multipliers: Record<string, unknown>;
  sizing_assumptions: Record<string, unknown>;
  client_notes: string[];
  disclaimer: string;
};

type CategoryRow = {
  key: string;
  label: string;
  sector: 'residential' | 'commercial' | 'both';
  basis:
    | 'fixed'
    | 'per_kw'
    | 'per_kwh'
    | 'per_sqm'
    | 'per_floor'
    | 'per_kw_load'
    | 'percent_of_subtotal';
  rate: number;
  min_amount: number | null;
  max_amount: number | null;
  applies_when: 'always' | 'with_pv' | 'with_battery' | 'with_backup' | 'commercial_only';
  position: number;
};

type Sector = 'residential' | 'commercial';
type ServiceArea = 'pili' | 'lipa' | 'other';

type EstimateInput = {
  sector: Sector;
  projectType: string;
  location: string;
  serviceArea: ServiceArea;
  floorArea: number;
  floors: number;
  electricalService: string;
  monthlyBill: number;
  estimatedLoadKw: number;
  pvRequired: boolean;
  systemType: string;
  pvCapacityKwp: number;
  batteryRequired: boolean;
  batteryKwh: number;
  backupRequired: boolean;
  complexity: string;
  existingSystem: string;
  additionalRequirements: string;
  clientName: string;
  clientContact: string;
  clientEmail: string;
  projectName: string;
};

const sectors = new Set(['residential', 'commercial']);
const serviceAreas = new Set(['pili', 'lipa', 'other']);
const systemTypes = new Set(['grid_tied', 'hybrid', 'off_grid']);
const complexities = new Set(['standard', 'moderate', 'complex']);
const electricalServices = new Set([
  'single_phase_230',
  'three_phase_230',
  'three_phase_400',
  'unknown',
]);
const existingSystems = new Set(['none', 'existing_pv', 'generator', 'unknown']);
const residentialProjectTypes = new Set([
  'new_installation',
  'system_expansion',
  'system_replacement',
  'backup_only',
]);
const commercialProjectTypes = new Set([
  'commercial_building',
  'retail_or_office',
  'warehouse_or_industrial',
  'agricultural',
  'institutional',
  'hospitality',
]);

/**
 * Realistic ceilings for each sector. These are not cosmetic: because the quotation itemises a
 * generic category per line, an unbounded quantity would let anyone divide a line by the quantity
 * they supplied and recover the underlying rate. Holding the calculator to project sizes the
 * business actually serves keeps that out of reach.
 */
const limits = {
  residential: { pvKwp: 30, batteryKwh: 120, floorArea: 2000, floors: 6, loadKw: 100 },
  commercial: { pvKwp: 2000, batteryKwh: 5000, floorArea: 100000, floors: 60, loadKw: 5000 },
} as const;

const MAX_BODY_BYTES = 16 * 1024;

/**
 * Requests per caller per hour. The contact detail is supplied by the caller and can be varied at
 * will, so the network address is counted as well; it is stored only as a salted digest.
 */
const MAX_PER_CONTACT_PER_HOUR = 8;
const MAX_PER_ADDRESS_PER_HOUR = 24;

/** Salted so the stored digest cannot be reversed into a visitor's address by dictionary search. */
async function fingerprint(request: Request, salt: string): Promise<string> {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const address = forwarded.split(',')[0]?.trim() || 'unknown';
  const data = new TextEncoder().encode(`${salt}:${address}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Trims, bounds, and strips characters Postgres text columns reject (NUL) or XML cannot carry. */
const text = (value: unknown, limit: number) => {
  if (typeof value !== 'string') return '';
  let cleaned = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x09 || code === 0x0a || (code >= 0x20 && code !== 0x7f)) cleaned += char;
  }
  return cleaned.trim().slice(0, limit);
};

const bool = (value: unknown) => value === true;

/** Coerces to a finite number inside [min, max]; anything else becomes the fallback. */
function num(value: unknown, min: number, max: number, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Reads a configured factor. `max` has to be generous enough for the setting being read: the
 * electricity tariff is a peso amount well above 10, and silently rejecting it would make the
 * administrator's saved value have no effect on any estimate.
 */
function lookupFactor(
  source: Record<string, unknown>,
  key: string,
  fallback: number,
  max = 10,
): number {
  const raw = source?.[key];
  const parsed = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''));
  return Number.isFinite(parsed) && parsed > 0 && parsed <= max ? parsed : fallback;
}

function parseInput(body: Record<string, unknown>): { input?: EstimateInput; error?: string } {
  const raw = (body.input ?? {}) as Record<string, unknown>;
  const sector = text(body.sector, 20) as Sector;
  if (!sectors.has(sector)) {
    return { error: 'Select either a residential or a commercial project.' };
  }

  const projectType = text(raw.projectType, 48);
  const allowedProjectTypes =
    sector === 'residential' ? residentialProjectTypes : commercialProjectTypes;
  if (!allowedProjectTypes.has(projectType)) {
    return { error: 'Select a valid project type.' };
  }

  const clientName = text(raw.clientName, 160);
  if (clientName.length < 2) {
    return { error: 'Enter the client name.' };
  }

  const clientContact = text(raw.clientContact, 160);
  if (clientContact.length < 5) {
    return { error: 'Enter a contact number or email address.' };
  }

  const location = text(raw.location, 200);
  if (location.length < 2) {
    return { error: 'Enter the project location.' };
  }

  const serviceArea = text(raw.serviceArea, 20) as ServiceArea;
  if (!serviceAreas.has(serviceArea)) {
    return { error: 'Select the nearest service area.' };
  }

  const systemType = text(raw.systemType, 20);
  if (!systemTypes.has(systemType)) {
    return { error: 'Select a valid system type.' };
  }

  const electricalService = text(raw.electricalService, 24);
  if (!electricalServices.has(electricalService)) {
    return { error: 'Select a valid electrical service.' };
  }

  const complexity = sector === 'commercial' ? text(raw.complexity, 20) : 'standard';
  if (!complexities.has(complexity)) {
    return { error: 'Select a valid project complexity.' };
  }

  const existingSystem = text(raw.existingSystem, 24) || 'unknown';
  if (!existingSystems.has(existingSystem)) {
    return { error: 'Select a valid existing-system option.' };
  }

  const pvRequired = bool(raw.pvRequired);
  const batteryRequired = bool(raw.batteryRequired);
  if (!pvRequired && !batteryRequired) {
    return { error: 'Select a solar photovoltaic system, battery storage, or both.' };
  }

  const bounds = limits[sector];

  return {
    input: {
      sector,
      projectType,
      location,
      serviceArea,
      floorArea: num(raw.floorArea, 0, bounds.floorArea),
      floors: Math.round(num(raw.floors, 1, bounds.floors, 1)),
      electricalService,
      monthlyBill: num(raw.monthlyBill, 0, 5000000),
      // Connected load is a commercial question only. Residential wizards can still carry a stale
      // value if the visitor switched sector part-way, and honouring it would size the system from
      // a number the visitor never intended to give for this project.
      estimatedLoadKw: sector === 'commercial' ? num(raw.estimatedLoadKw, 0, bounds.loadKw) : 0,
      pvRequired,
      systemType,
      pvCapacityKwp: num(raw.pvCapacityKwp, 0, bounds.pvKwp),
      batteryRequired,
      batteryKwh: num(raw.batteryKwh, 0, bounds.batteryKwh),
      backupRequired: bool(raw.backupRequired),
      complexity,
      existingSystem,
      additionalRequirements: text(raw.additionalRequirements, 1000),
      clientName,
      clientContact,
      clientEmail: text(raw.clientEmail, 160),
      projectName: text(raw.projectName, 160),
    },
  };
}

/**
 * Derives the system size when the client did not state one.
 *
 * Consumption leads. Floor area and connected load are only consulted when there is no bill to
 * work from, and roof area then acts as a ceiling rather than a floor — sizing a small household
 * up to whatever its roof could hold would quote them many times the system they need.
 */
function resolveSizing(input: EstimateInput, assumptions: Record<string, unknown>) {
  const bounds = limits[input.sector];
  const tariff = lookupFactor(assumptions, 'tariff_per_kwh', 12, 100);
  const peakSunHours = lookupFactor(assumptions, 'peak_sun_hours', 4.5, 12);
  const performanceRatio = lookupFactor(assumptions, 'performance_ratio', 0.8, 1);
  const offsetTarget = lookupFactor(assumptions, 'offset_target', 0.7, 2);
  const batteryDayFraction = lookupFactor(assumptions, 'battery_day_fraction', 0.35, 3);

  const monthlyKwh = input.monthlyBill > 0 ? input.monthlyBill / tariff : 0;
  const dailyKwh = monthlyKwh / 30.4;
  const yieldPerKwp = Math.max(0.5, peakSunHours * performanceRatio);
  // A roof holds roughly one kWp per 6 m2 of usable area; only part of a floor plate is usable.
  const roofCeiling = input.floorArea > 0 ? (input.floorArea * 0.5) / 6 : Infinity;

  let capacityKwp = input.pvRequired ? input.pvCapacityKwp : 0;
  if (input.pvRequired && capacityKwp <= 0) {
    const fromBill = dailyKwh > 0 ? (dailyKwh * offsetTarget) / yieldPerKwp : 0;
    const fromLoad = input.estimatedLoadKw > 0 ? input.estimatedLoadKw * 0.6 : 0;
    const derived = fromBill > 0 ? fromBill : fromLoad;
    capacityKwp = Math.min(derived > 0 ? derived : 3, roofCeiling);
    capacityKwp = Math.max(capacityKwp, 3);
  }
  capacityKwp = Math.min(bounds.pvKwp, Math.round(capacityKwp * 10) / 10);

  let batteryKwh = input.batteryRequired ? input.batteryKwh : 0;
  if (input.batteryRequired && batteryKwh <= 0) {
    const fromUsage = dailyKwh * batteryDayFraction;
    const fromArray = capacityKwp * 1.2;
    batteryKwh = Math.max(fromUsage > 0 ? fromUsage : fromArray, 5);
  }
  batteryKwh = Math.min(bounds.batteryKwh, Math.round(batteryKwh * 10) / 10);

  return { capacityKwp, batteryKwh };
}

function categoryApplies(category: CategoryRow, input: EstimateInput): boolean {
  if (category.sector !== 'both' && category.sector !== input.sector) return false;
  if (category.applies_when === 'with_pv') return input.pvRequired;
  if (category.applies_when === 'with_battery') return input.batteryRequired;
  if (category.applies_when === 'with_backup') return input.backupRequired;
  if (category.applies_when === 'commercial_only') return input.sector === 'commercial';
  return true;
}

function baseAmount(
  category: CategoryRow,
  input: EstimateInput,
  capacityKwp: number,
  batteryKwh: number,
): number {
  if (category.basis === 'fixed') return category.rate;
  if (category.basis === 'per_kw') return category.rate * capacityKwp;
  if (category.basis === 'per_kwh') return category.rate * batteryKwh;
  if (category.basis === 'per_sqm') return category.rate * input.floorArea;
  if (category.basis === 'per_floor') return category.rate * input.floors;
  if (category.basis === 'per_kw_load') return category.rate * input.estimatedLoadKw;
  return 0;
}

/**
 * Applies the configured floor and cap to a line that has already been scaled by the project
 * multipliers, so a cap means what an administrator typed rather than a pre-multiplier figure.
 *
 * The minimum applies even when the computed amount is zero. A category that applies to the
 * project but happens to price off a quantity the project does not have — labour, cabling and
 * protection on a battery-only job, all of which are rated per kW of PV — must still carry its
 * minimum charge, otherwise the work is quoted at nothing.
 */
function clampAmount(category: CategoryRow, amount: number): number {
  let next = amount;
  if (category.min_amount !== null && next < category.min_amount) {
    next = category.min_amount;
  }
  if (category.max_amount !== null && next > category.max_amount) {
    next = category.max_amount;
  }
  return next;
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse(null, { error: 'This website origin is not allowed.' }, 403);
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== 'POST') {
    return jsonResponse(origin, { error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(origin, { error: 'The quotation calculator is not configured.' }, 500);
  }

  // Refuse oversized bodies before reading them, so a large payload cannot exhaust the worker.
  const declaredLength = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonResponse(origin, { error: 'The request is too large.' }, 413);
  }

  let body: Record<string, unknown>;
  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return jsonResponse(origin, { error: 'The request is too large.' }, 413);
    }
    const parsedBody: unknown = JSON.parse(rawBody);
    if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) {
      return jsonResponse(origin, { error: 'A valid JSON request is required.' }, 400);
    }
    body = parsedBody as Record<string, unknown>;
  } catch {
    return jsonResponse(origin, { error: 'A valid JSON request is required.' }, 400);
  }

  if (body.action !== 'estimate') {
    return jsonResponse(origin, { error: 'Unknown quotation action.' }, 400);
  }

  const parsed = parseInput(body);
  if (!parsed.input) {
    return jsonResponse(origin, { error: parsed.error ?? 'The request is incomplete.' }, 400);
  }
  const input = parsed.input;

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Abuse control. The contact detail is caller-supplied and can be varied freely, so the network
  // address is counted too. Both queries are checked for errors: failing open here would leave the
  // endpoint completely unmetered exactly when it is under load.
  const recentWindow = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const addressDigest = await fingerprint(request, serviceRoleKey);

  const [contactResult, addressResult] = await Promise.all([
    service
      .from('quotations')
      .select('id', { count: 'exact', head: true })
      .eq('client_contact', input.clientContact)
      .gte('created_at', recentWindow),
    service
      .from('quotations')
      .select('id', { count: 'exact', head: true })
      .eq('client_fingerprint', addressDigest)
      .gte('created_at', recentWindow),
  ]);

  if (contactResult.error || addressResult.error) {
    return jsonResponse(origin, { error: 'The estimate could not be prepared right now.' }, 503);
  }
  if (
    (contactResult.count ?? 0) >= MAX_PER_CONTACT_PER_HOUR ||
    (addressResult.count ?? 0) >= MAX_PER_ADDRESS_PER_HOUR
  ) {
    return jsonResponse(
      origin,
      {
        error: 'Several estimates were already prepared recently. Please try again later.',
      },
      429,
    );
  }

  const settingsResult = await service
    .from('quote_settings')
    .select(
      'currency_code, currency_symbol, validity_days, rounding_step, minimum_total, residential_multiplier, commercial_multiplier, complexity_multipliers, location_multipliers, sizing_assumptions, client_notes, disclaimer',
    )
    .eq('id', 'default')
    .maybeSingle<SettingsRow>();
  if (settingsResult.error || !settingsResult.data) {
    return jsonResponse(origin, { error: 'The quotation settings are unavailable.' }, 500);
  }
  const settings = settingsResult.data;

  const categoriesResult = await service
    .from('quote_categories')
    .select('key, label, sector, basis, rate, min_amount, max_amount, applies_when, position')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (categoriesResult.error || !categoriesResult.data?.length) {
    return jsonResponse(origin, { error: 'The quotation categories are not configured yet.' }, 500);
  }
  const categories = categoriesResult.data as CategoryRow[];

  const { capacityKwp, batteryKwh } = resolveSizing(input, settings.sizing_assumptions);

  const sectorMultiplier =
    input.sector === 'commercial'
      ? Number(settings.commercial_multiplier) || 1
      : Number(settings.residential_multiplier) || 1;
  const complexityMultiplier = lookupFactor(settings.complexity_multipliers, input.complexity, 1);
  const areaMultiplier = lookupFactor(settings.location_multipliers, input.serviceArea, 1);
  const multiplier = sectorMultiplier * complexityMultiplier * areaMultiplier;

  const step = Math.max(1, Math.round(Number(settings.rounding_step) || 100));
  const roundAmount = (value: number) => Math.max(0, Math.round(value / step) * step);
  const roundUpAmount = (value: number) => Math.max(0, Math.ceil(value / step) * step);

  const applicable = categories.filter((category) => categoryApplies(category, input));

  // Scale first, then clamp: the floors and caps an administrator configures are peso amounts they
  // expect to see on the finished quotation, not pre-multiplier intermediates.
  const directItems = applicable
    .filter((category) => category.basis !== 'percent_of_subtotal')
    .map((category) => ({
      category,
      amount: clampAmount(
        category,
        baseAmount(category, input, capacityKwp, batteryKwh) * multiplier,
      ),
    }))
    .filter((entry) => entry.amount > 0);

  const subtotal = directItems.reduce((total, entry) => total + entry.amount, 0);
  if (subtotal <= 0) {
    return jsonResponse(
      origin,
      { error: 'The provided details are not enough to prepare an estimate.' },
      400,
    );
  }

  // Percentages read the already-scaled subtotal, so the multiplier is never applied twice.
  const percentItems = applicable
    .filter((category) => category.basis === 'percent_of_subtotal')
    .map((category) => ({
      category,
      amount: clampAmount(category, (subtotal * category.rate) / 100),
    }))
    .filter((entry) => entry.amount > 0);

  const lineItems = [...directItems, ...percentItems]
    .sort((a, b) => a.category.position - b.category.position)
    .map((entry) => ({
      key: entry.category.key,
      label: entry.category.label,
      amount: roundAmount(entry.amount),
    }))
    .filter((item) => item.amount > 0);

  // The printed total is the sum of the printed lines, so the column always adds up.
  let total = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const minimumTotal = Number(settings.minimum_total) || 0;
  if (minimumTotal > 0 && total < minimumTotal) {
    // Rounded up, so topping up can never land below the configured minimum.
    const adjustment = roundUpAmount(minimumTotal - total);
    if (adjustment > 0) {
      lineItems.push({
        key: 'minimum_project_charge',
        label: 'Minimum Project Provision',
        amount: adjustment,
      });
      total += adjustment;
    }
  }

  const numberResult = await service.rpc('issue_quotation_number');
  if (numberResult.error || typeof numberResult.data !== 'string') {
    return jsonResponse(origin, { error: 'A quotation number could not be reserved.' }, 500);
  }
  const quotationNumber = numberResult.data;

  const validityDays = Math.max(1, Math.round(Number(settings.validity_days) || 30));
  const validUntil = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);
  const validUntilDate = validUntil.toISOString().slice(0, 10);

  const insertResult = await service.from('quotations').insert({
    quotation_number: quotationNumber,
    sector: input.sector,
    status: 'generated',
    client_name: input.clientName,
    client_contact: input.clientContact,
    client_email: input.clientEmail || null,
    project_name: input.projectName || null,
    project_location: input.location,
    service_area: input.serviceArea,
    client_fingerprint: addressDigest,
    inputs: {
      projectType: input.projectType,
      electricalService: input.electricalService,
      systemType: input.systemType,
      floorArea: input.floorArea,
      floors: input.floors,
      monthlyBill: input.monthlyBill,
      estimatedLoadKw: input.estimatedLoadKw,
      pvRequired: input.pvRequired,
      batteryRequired: input.batteryRequired,
      backupRequired: input.backupRequired,
      complexity: input.complexity,
      existingSystem: input.existingSystem,
      additionalRequirements: input.additionalRequirements,
    },
    line_items: lineItems.map((item) => ({ label: item.label, amount: item.amount })),
    system_size_kwp: capacityKwp,
    battery_kwh: batteryKwh,
    estimated_total: total,
    currency_code: settings.currency_code,
    valid_until: validUntilDate,
  });
  if (insertResult.error) {
    return jsonResponse(origin, { error: 'The quotation could not be recorded.' }, 500);
  }

  const highlights: Array<{ label: string; value: string }> = [];
  if (capacityKwp > 0) {
    highlights.push({ label: 'Estimated system size', value: `${capacityKwp} kWp` });
  }
  if (batteryKwh > 0) {
    highlights.push({ label: 'Battery storage', value: `${batteryKwh} kWh` });
  }
  highlights.push({
    label: 'Project classification',
    value: input.sector === 'commercial' ? 'Commercial' : 'Residential',
  });

  return jsonResponse(origin, {
    quotation: {
      quotationNumber,
      sector: input.sector,
      issuedAt: new Date().toISOString(),
      validUntil: validUntilDate,
      currencyCode: settings.currency_code,
      currencySymbol: settings.currency_symbol,
      clientName: input.clientName,
      clientContact: input.clientContact,
      projectName: input.projectName,
      projectLocation: input.location,
      systemSizeKwp: capacityKwp,
      batteryKwh,
      highlights,
      lineItems: lineItems.map((item) => ({ label: item.label, amount: item.amount })),
      estimatedTotal: total,
      notes: settings.client_notes ?? [],
      disclaimer: settings.disclaimer,
    },
  });
});
