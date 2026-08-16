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

const text = (value: unknown, limit: number) =>
  typeof value === 'string' ? value.trim().slice(0, limit) : '';

const bool = (value: unknown) => value === true;

/** Coerces to a finite number inside [min, max]; anything else becomes the fallback. */
function num(value: unknown, min: number, max: number, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function lookupFactor(source: Record<string, unknown>, key: string, fallback: number): number {
  const raw = source?.[key];
  const parsed = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''));
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 10 ? parsed : fallback;
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

  return {
    input: {
      sector,
      projectType,
      location,
      serviceArea,
      floorArea: num(raw.floorArea, 0, 500000),
      floors: Math.round(num(raw.floors, 1, 80, 1)),
      electricalService,
      monthlyBill: num(raw.monthlyBill, 0, 100000000),
      estimatedLoadKw: num(raw.estimatedLoadKw, 0, 20000),
      pvRequired,
      systemType,
      pvCapacityKwp: num(raw.pvCapacityKwp, 0, 20000),
      batteryRequired,
      batteryKwh: num(raw.batteryKwh, 0, 100000),
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

/** Derives the system size when the client did not state one. */
function resolveSizing(input: EstimateInput, assumptions: Record<string, unknown>) {
  const tariff = lookupFactor(assumptions, 'tariff_per_kwh', 12);
  const peakSunHours = lookupFactor(assumptions, 'peak_sun_hours', 4.5);
  const performanceRatio = lookupFactor(assumptions, 'performance_ratio', 0.8);
  const offsetTarget = lookupFactor(assumptions, 'offset_target', 0.7);
  const batteryDayFraction = lookupFactor(assumptions, 'battery_day_fraction', 0.35);

  const monthlyKwh = input.monthlyBill > 0 ? input.monthlyBill / tariff : 0;
  const dailyKwh = monthlyKwh / 30.4;

  let capacityKwp = input.pvRequired ? input.pvCapacityKwp : 0;
  if (input.pvRequired && capacityKwp <= 0) {
    const derived = (dailyKwh * offsetTarget) / Math.max(0.5, peakSunHours * performanceRatio);
    const floorAreaFallback = input.floorArea > 0 ? input.floorArea / 40 : 0;
    capacityKwp = Math.max(derived, floorAreaFallback, input.estimatedLoadKw * 0.6, 3);
  }
  capacityKwp = Math.min(20000, Math.round(capacityKwp * 10) / 10);

  let batteryKwh = input.batteryRequired ? input.batteryKwh : 0;
  if (input.batteryRequired && batteryKwh <= 0) {
    batteryKwh = Math.max(dailyKwh * batteryDayFraction, capacityKwp * 1.2, 5);
  }
  batteryKwh = Math.min(100000, Math.round(batteryKwh * 10) / 10);

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

function clampAmount(category: CategoryRow, amount: number): number {
  let next = amount;
  if (category.min_amount !== null && next > 0 && next < category.min_amount) {
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
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

  // Light abuse control: the same contact detail cannot mint an unlimited run of references.
  const recentWindow = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentResult = await service
    .from('quotations')
    .select('id', { count: 'exact', head: true })
    .eq('client_contact', input.clientContact)
    .gte('created_at', recentWindow);
  if ((recentResult.count ?? 0) >= 8) {
    return jsonResponse(
      origin,
      {
        error: 'Several estimates were already prepared for this contact. Please try again later.',
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

  const applicable = categories.filter((category) => categoryApplies(category, input));

  const directItems = applicable
    .filter((category) => category.basis !== 'percent_of_subtotal')
    .map((category) => ({
      category,
      amount: clampAmount(category, baseAmount(category, input, capacityKwp, batteryKwh)),
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
      amount: roundAmount(entry.amount * multiplier),
    }))
    .filter((item) => item.amount > 0);

  let total = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const minimumTotal = Number(settings.minimum_total) || 0;
  if (minimumTotal > 0 && total < minimumTotal) {
    const adjustment = roundAmount(minimumTotal - total);
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
