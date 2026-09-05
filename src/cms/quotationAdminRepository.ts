import { requireSupabase } from './supabaseClient';
import type {
  QuotationLineItem,
  QuotationRecord,
  QuotationSector,
  QuotationStatus,
  QuickEstimateSettings,
  QuoteCategory,
  QuoteSettings,
} from './quotationTypes';

/**
 * Administrator-only access to pricing and stored quotations.
 *
 * Imported exclusively by the admin dashboard, which is lazily loaded, so nothing in this module
 * reaches a visitor's initial bundle. Authorisation is enforced by row-level security regardless:
 * the pricing tables are owner-only and grant nothing to unauthenticated callers.
 */

type SettingsRow = {
  currency_code: string;
  currency_symbol: string;
  quotation_prefix: string;
  validity_days: number;
  rounding_step: number;
  minimum_total: number;
  residential_multiplier: number;
  commercial_multiplier: number;
  complexity_multipliers: Record<string, unknown>;
  location_multipliers: Record<string, unknown>;
  sizing_assumptions: Record<string, unknown>;
  client_notes: string[] | null;
  disclaimer: string;
};

type CategoryRow = {
  id: string;
  key: string;
  label: string;
  sector: QuoteCategory['sector'];
  basis: QuoteCategory['basis'];
  rate: number;
  min_amount: number | null;
  max_amount: number | null;
  applies_when: QuoteCategory['appliesWhen'];
  position: number;
  is_active: boolean;
};

type QuotationRow = {
  id: string;
  quotation_number: string;
  sector: QuotationSector;
  status: QuotationStatus;
  client_name: string;
  client_contact: string;
  client_email: string | null;
  project_name: string | null;
  project_location: string;
  service_area: QuotationRecord['serviceArea'];
  inputs: Record<string, unknown> | null;
  line_items: QuotationLineItem[] | null;
  system_size_kwp: number;
  battery_kwh: number;
  estimated_total: number;
  currency_code: string;
  valid_until: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
};

const numberMap = (value: Record<string, unknown>): Record<string, number> => {
  const entries = Object.entries(value ?? {}).map(([key, raw]) => {
    const parsed = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
    return [key, Number.isFinite(parsed) ? parsed : 0] as const;
  });
  return Object.fromEntries(entries);
};

function toSettings(row: SettingsRow): QuoteSettings {
  return {
    currencyCode: row.currency_code,
    currencySymbol: row.currency_symbol,
    quotationPrefix: row.quotation_prefix,
    validityDays: Number(row.validity_days),
    roundingStep: Number(row.rounding_step),
    minimumTotal: Number(row.minimum_total),
    residentialMultiplier: Number(row.residential_multiplier),
    commercialMultiplier: Number(row.commercial_multiplier),
    complexityMultipliers: numberMap(row.complexity_multipliers),
    locationMultipliers: numberMap(row.location_multipliers),
    sizingAssumptions: numberMap(row.sizing_assumptions),
    clientNotes: row.client_notes ?? [],
    disclaimer: row.disclaimer,
  };
}

function toCategory(row: CategoryRow): QuoteCategory {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    sector: row.sector,
    basis: row.basis,
    rate: Number(row.rate),
    minAmount: row.min_amount === null ? null : Number(row.min_amount),
    maxAmount: row.max_amount === null ? null : Number(row.max_amount),
    appliesWhen: row.applies_when,
    position: row.position,
    isActive: row.is_active,
  };
}

function toQuotationRecord(row: QuotationRow): QuotationRecord {
  return {
    id: row.id,
    quotationNumber: row.quotation_number,
    sector: row.sector,
    status: row.status,
    clientName: row.client_name,
    clientContact: row.client_contact,
    clientEmail: row.client_email,
    projectName: row.project_name,
    projectLocation: row.project_location,
    serviceArea: row.service_area,
    inputs: row.inputs ?? {},
    lineItems: Array.isArray(row.line_items) ? row.line_items : [],
    systemSizeKwp: Number(row.system_size_kwp),
    batteryKwh: Number(row.battery_kwh),
    estimatedTotal: Number(row.estimated_total),
    currencyCode: row.currency_code,
    validUntil: row.valid_until,
    adminNotes: row.admin_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const settingsColumns =
  'currency_code, currency_symbol, quotation_prefix, validity_days, rounding_step, minimum_total, residential_multiplier, commercial_multiplier, complexity_multipliers, location_multipliers, sizing_assumptions, client_notes, disclaimer';

const categoryColumns =
  'id, key, label, sector, basis, rate, min_amount, max_amount, applies_when, position, is_active';

const quotationColumns =
  'id, quotation_number, sector, status, client_name, client_contact, client_email, project_name, project_location, service_area, inputs, line_items, system_size_kwp, battery_kwh, estimated_total, currency_code, valid_until, admin_notes, created_at, updated_at';

export async function fetchQuoteSettings(): Promise<QuoteSettings> {
  const client = await requireSupabase();
  const result = await client
    .from('quote_settings')
    .select(settingsColumns)
    .eq('id', 'default')
    .maybeSingle<SettingsRow>();
  if (result.error) throw result.error;
  if (!result.data) {
    throw new Error('The pricing configuration has not been created yet.');
  }
  return toSettings(result.data);
}

export async function saveQuoteSettings(settings: QuoteSettings): Promise<QuoteSettings> {
  const client = await requireSupabase();
  const result = await client
    .from('quote_settings')
    .update({
      currency_code: settings.currencyCode,
      currency_symbol: settings.currencySymbol,
      quotation_prefix: settings.quotationPrefix,
      validity_days: settings.validityDays,
      rounding_step: settings.roundingStep,
      minimum_total: settings.minimumTotal,
      residential_multiplier: settings.residentialMultiplier,
      commercial_multiplier: settings.commercialMultiplier,
      complexity_multipliers: settings.complexityMultipliers,
      location_multipliers: settings.locationMultipliers,
      sizing_assumptions: settings.sizingAssumptions,
      client_notes: settings.clientNotes,
      disclaimer: settings.disclaimer,
    })
    .eq('id', 'default')
    .select(settingsColumns)
    .single<SettingsRow>();
  if (result.error) throw result.error;
  return toSettings(result.data);
}

type QuickEstimateRow = {
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

const quickEstimateColumns =
  'residential_rate_per_kwh, commercial_rate_per_kwh, industrial_rate_per_kwh, peak_sun_hours, days_per_month, panel_watts, price_per_kw, battery_cost, rounding_step';

function toQuickEstimateSettings(row: QuickEstimateRow): QuickEstimateSettings {
  return {
    residentialRatePerKwh: Number(row.residential_rate_per_kwh),
    commercialRatePerKwh: Number(row.commercial_rate_per_kwh),
    industrialRatePerKwh: Number(row.industrial_rate_per_kwh),
    peakSunHours: Number(row.peak_sun_hours),
    daysPerMonth: Number(row.days_per_month),
    panelWatts: Number(row.panel_watts),
    pricePerKw: Number(row.price_per_kw),
    batteryCost: Number(row.battery_cost),
    roundingStep: Number(row.rounding_step),
  };
}

export async function fetchQuickEstimateSettings(): Promise<QuickEstimateSettings> {
  const client = await requireSupabase();
  const result = await client
    .from('quick_estimate_settings')
    .select(quickEstimateColumns)
    .eq('id', 'default')
    .maybeSingle<QuickEstimateRow>();
  if (result.error) throw result.error;
  if (!result.data) {
    throw new Error('The estimate settings have not been created yet.');
  }
  return toQuickEstimateSettings(result.data);
}

export async function saveQuickEstimateSettings(
  settings: QuickEstimateSettings,
): Promise<QuickEstimateSettings> {
  const client = await requireSupabase();
  const result = await client
    .from('quick_estimate_settings')
    .update({
      residential_rate_per_kwh: settings.residentialRatePerKwh,
      commercial_rate_per_kwh: settings.commercialRatePerKwh,
      industrial_rate_per_kwh: settings.industrialRatePerKwh,
      peak_sun_hours: settings.peakSunHours,
      days_per_month: settings.daysPerMonth,
      panel_watts: settings.panelWatts,
      price_per_kw: settings.pricePerKw,
      battery_cost: settings.batteryCost,
      rounding_step: settings.roundingStep,
    })
    .eq('id', 'default')
    .select(quickEstimateColumns)
    .single<QuickEstimateRow>();
  if (result.error) throw result.error;
  return toQuickEstimateSettings(result.data);
}

export async function fetchQuoteCategories(): Promise<QuoteCategory[]> {
  const client = await requireSupabase();
  const result = await client
    .from('quote_categories')
    .select(categoryColumns)
    .order('position', { ascending: true });
  if (result.error) throw result.error;
  return (result.data as CategoryRow[]).map(toCategory);
}

export async function saveQuoteCategory(category: QuoteCategory): Promise<QuoteCategory> {
  const client = await requireSupabase();
  const row = {
    key: category.key,
    label: category.label,
    sector: category.sector,
    basis: category.basis,
    rate: category.rate,
    min_amount: category.minAmount,
    max_amount: category.maxAmount,
    applies_when: category.appliesWhen,
    position: category.position,
    is_active: category.isActive,
  };

  const result = category.id
    ? await client
        .from('quote_categories')
        .update(row)
        .eq('id', category.id)
        .select(categoryColumns)
        .single<CategoryRow>()
    : await client
        .from('quote_categories')
        .insert(row)
        .select(categoryColumns)
        .single<CategoryRow>();

  if (result.error) throw result.error;
  return toCategory(result.data);
}

export async function deleteQuoteCategory(id: string): Promise<void> {
  const client = await requireSupabase();
  const result = await client.from('quote_categories').delete().eq('id', id);
  if (result.error) throw result.error;
}

export async function fetchQuotations(): Promise<QuotationRecord[]> {
  const client = await requireSupabase();
  const result = await client
    .from('quotations')
    .select(quotationColumns)
    .order('created_at', { ascending: false })
    .limit(400);
  if (result.error) throw result.error;
  return (result.data as QuotationRow[]).map(toQuotationRecord);
}

export async function updateQuotation(
  id: string,
  changes: { status?: QuotationStatus; adminNotes?: string },
): Promise<QuotationRecord> {
  const client = await requireSupabase();
  const row: Record<string, unknown> = {};
  if (changes.status) row.status = changes.status;
  if (changes.adminNotes !== undefined) row.admin_notes = changes.adminNotes || null;

  const result = await client
    .from('quotations')
    .update(row)
    .eq('id', id)
    .select(quotationColumns)
    .single<QuotationRow>();
  if (result.error) throw result.error;
  return toQuotationRecord(result.data);
}

export async function deleteQuotation(id: string): Promise<void> {
  const client = await requireSupabase();
  const result = await client.from('quotations').delete().eq('id', id);
  if (result.error) throw result.error;
}
