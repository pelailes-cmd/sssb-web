import { createClient } from 'npm:@supabase/supabase-js@2.110.8';

// Turns an average monthly electricity bill into the single figure shown after the short inquiry
// form is submitted.
//
// Unlike `quotation-estimate`, this endpoint is NOT called by a browser. The Apps Script mailer
// calls it server-to-server while handling a submission, and it refuses anything that arrives with
// an Origin header or without the shared secret. That matters: the estimate is a straight line in
// the bill, so anyone able to call this freely could recover the per-kW price and the battery cost
// from two responses. Routing it through the mailer puts the honeypot, the timing check and the
// per-address rate limit in front of it, and every attempt lands in the sales inbox.
//
// Deploy with JWT verification DISABLED — the caller is Apps Script, which holds no Supabase
// session — and set the ESTIMATE_SHARED_SECRET secret. See EMAIL_SETUP.md.

/** Long enough that a guessed value is not worth trying. Refused rather than warned about. */
const MIN_SECRET_LENGTH = 16;

/**
 * Beyond this the linear model stops being a fair guide and the site should not pretend otherwise,
 * so no figure is returned and the sales team follows up instead.
 */
const MAX_MONTHLY_BILL = 5_000_000;

const propertyLabels: Record<string, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  industrial: 'Industrial',
};

type SettingsRow = {
  residential_rate_per_kwh: number;
  commercial_rate_per_kwh: number;
  industrial_rate_per_kwh: number;
  peak_sun_hours: number;
  days_per_month: number;
  panel_watts: number;
  price_per_kw: number;
  battery_cost: number;
  rounding_step: number;
};

const settingsColumns =
  'residential_rate_per_kwh, commercial_rate_per_kwh, industrial_rate_per_kwh, peak_sun_hours, days_per_month, panel_watts, price_per_kw, battery_cost, rounding_step';

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    // No CORS headers: a browser must not be able to use this endpoint, so there is nothing to
    // allow.
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Compares without an early exit, so a wrong secret takes the same time whatever it starts with. */
function secretMatches(provided: string, expected: string) {
  if (provided.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < provided.length; index += 1) {
    difference |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

const positiveNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/** Every setting is required to be usable; a zero anywhere would divide by nothing or price at nothing. */
function readSettings(row: SettingsRow) {
  const rates: Record<string, number | null> = {
    residential: positiveNumber(row.residential_rate_per_kwh),
    commercial: positiveNumber(row.commercial_rate_per_kwh),
    industrial: positiveNumber(row.industrial_rate_per_kwh),
  };
  const peakSunHours = positiveNumber(row.peak_sun_hours);
  const daysPerMonth = positiveNumber(row.days_per_month);
  const panelWatts = positiveNumber(row.panel_watts);
  const pricePerKw = positiveNumber(row.price_per_kw);
  const batteryCost = Number(row.battery_cost);
  const roundingStep = positiveNumber(row.rounding_step);

  if (
    !peakSunHours ||
    !daysPerMonth ||
    !panelWatts ||
    !pricePerKw ||
    !roundingStep ||
    !Number.isFinite(batteryCost) ||
    batteryCost < 0
  ) {
    return null;
  }
  return { rates, peakSunHours, daysPerMonth, panelWatts, pricePerKw, batteryCost, roundingStep };
}

function computeEstimate(
  settings: NonNullable<ReturnType<typeof readSettings>>,
  propertyType: string,
  monthlyBill: number,
) {
  const ratePerKwh = settings.rates[propertyType];
  if (!ratePerKwh) return null;

  const monthlyKwh = monthlyBill / ratePerKwh;
  const dailyKwh = monthlyKwh / settings.daysPerMonth;
  const systemSizeKw = dailyKwh / settings.peakSunHours;
  const panelCount = Math.max(1, Math.ceil((systemSizeKw * 1000) / settings.panelWatts));
  const total = systemSizeKw * settings.pricePerKw + settings.batteryCost;

  return {
    propertyType,
    propertyTypeLabel: propertyLabels[propertyType],
    monthlyBill: Math.round(monthlyBill),
    monthlyKwh: Math.round(monthlyKwh),
    systemSizeKw: Math.round(systemSizeKw * 100) / 100,
    panelCount,
    estimatedTotal: Math.round(total / settings.roundingStep) * settings.roundingStep,
  };
}

Deno.serve(async (request) => {
  // A browser would send this. Nothing here is meant for one.
  if (request.headers.get('Origin')) {
    return jsonResponse({ error: 'This endpoint is not available from a browser.' }, 403);
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const expectedSecret = Deno.env.get('ESTIMATE_SHARED_SECRET') ?? '';
  if (expectedSecret.length < MIN_SECRET_LENGTH) {
    // Fail closed. Without this an unset secret would leave the pricing endpoint open to anyone.
    return jsonResponse({ error: 'The estimate service is not configured.' }, 503);
  }
  if (!secretMatches(request.headers.get('x-estimate-secret') ?? '', expectedSecret)) {
    return jsonResponse({ error: 'Not authorised.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'The estimate service is not configured.' }, 500);
  }

  if (Number(request.headers.get('Content-Length') ?? '0') > 4096) {
    return jsonResponse({ error: 'The request is too large.' }, 413);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'A valid request is required.' }, 400);
  }
  if (!body || typeof body !== 'object') {
    return jsonResponse({ error: 'A valid request is required.' }, 400);
  }

  const propertyType = String(body.propertyType ?? '');
  if (!propertyLabels[propertyType]) {
    return jsonResponse({ error: 'A valid property type is required.' }, 400);
  }

  const monthlyBill = positiveNumber(body.monthlyBill);
  if (monthlyBill === null) {
    return jsonResponse({ error: 'A valid average monthly bill is required.' }, 400);
  }
  if (monthlyBill > MAX_MONTHLY_BILL) {
    // Declined rather than capped: a silently truncated figure would understate the system the
    // client needs, which is worse than showing no figure at all.
    return jsonResponse({ error: 'This bill is beyond what the quick estimate covers.' }, 422);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result = await service
    .from('quick_estimate_settings')
    .select(settingsColumns)
    .eq('id', 'default')
    .maybeSingle<SettingsRow>();

  if (result.error || !result.data) {
    return jsonResponse({ error: 'The estimate settings have not been created yet.' }, 500);
  }

  const settings = readSettings(result.data);
  if (!settings) {
    return jsonResponse({ error: 'The estimate settings are incomplete.' }, 500);
  }

  const estimate = computeEstimate(settings, propertyType, monthlyBill);
  if (!estimate) {
    return jsonResponse({ error: 'No rate is configured for that property type.' }, 500);
  }

  return jsonResponse({ estimate });
});
