/**
 * Types for the quotation calculator and the administrator pricing console.
 *
 * Nothing here describes how a price is reached. The public site only ever handles
 * `QuotationEstimate`, which the server fills with generic category labels and rounded amounts.
 * `QuoteSettings` and `QuoteCategory` mirror administrator-only tables and are requested solely
 * from the pricing console, where row-level security has already established that the caller is
 * an administrator.
 */

export type QuotationSector = 'residential' | 'commercial';

export type QuotationServiceArea = 'pili' | 'lipa' | 'other';

export type QuotationStatus =
  'draft' | 'generated' | 'sent' | 'under_review' | 'approved' | 'rejected' | 'expired';

export const quotationStatuses = [
  'draft',
  'generated',
  'sent',
  'under_review',
  'approved',
  'rejected',
  'expired',
] as const satisfies readonly QuotationStatus[];

export const quotationStatusLabels: Record<QuotationStatus, string> = {
  draft: 'Draft',
  generated: 'Generated',
  sent: 'Sent',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
};

export type ResidentialProjectType =
  'new_installation' | 'system_expansion' | 'system_replacement' | 'backup_only';

export type CommercialProjectType =
  | 'commercial_building'
  | 'retail_or_office'
  | 'warehouse_or_industrial'
  | 'agricultural'
  | 'institutional'
  | 'hospitality';

export type SystemType = 'grid_tied' | 'hybrid' | 'off_grid';

export type ElectricalService =
  'single_phase_230' | 'three_phase_230' | 'three_phase_400' | 'unknown';

export type ProjectComplexity = 'standard' | 'moderate' | 'complex';

export type ExistingSystem = 'none' | 'existing_pv' | 'generator' | 'unknown';

/** The answers collected by the wizard. Sent verbatim to the server, which revalidates all of it. */
export type QuotationFormValues = {
  projectType: string;
  location: string;
  serviceArea: QuotationServiceArea;
  floorArea: string;
  floors: string;
  electricalService: ElectricalService;
  monthlyBill: string;
  estimatedLoadKw: string;
  pvRequired: boolean;
  systemType: SystemType;
  pvCapacityKwp: string;
  batteryRequired: boolean;
  batteryKwh: string;
  backupRequired: boolean;
  complexity: ProjectComplexity;
  existingSystem: ExistingSystem;
  additionalRequirements: string;
  clientName: string;
  clientContact: string;
  clientEmail: string;
  projectName: string;
};

export type QuotationLineItem = {
  label: string;
  amount: number;
};

export type QuotationHighlight = {
  label: string;
  value: string;
};

/** Exactly what the public site is allowed to know about a priced quotation. */
export type QuotationEstimate = {
  quotationNumber: string;
  sector: QuotationSector;
  issuedAt: string;
  validUntil: string;
  currencyCode: string;
  currencySymbol: string;
  clientName: string;
  clientContact: string;
  projectName: string;
  projectLocation: string;
  systemSizeKwp: number;
  batteryKwh: number;
  highlights: QuotationHighlight[];
  lineItems: QuotationLineItem[];
  estimatedTotal: number;
  notes: string[];
  disclaimer: string;
};

export type QuoteCategoryBasis =
  'fixed' | 'per_kw' | 'per_kwh' | 'per_sqm' | 'per_floor' | 'per_kw_load' | 'percent_of_subtotal';

export const quoteCategoryBases = [
  'fixed',
  'per_kw',
  'per_kwh',
  'per_sqm',
  'per_floor',
  'per_kw_load',
  'percent_of_subtotal',
] as const satisfies readonly QuoteCategoryBasis[];

/** Plain-language description of each formula, shown in the pricing console. */
export const quoteCategoryBasisLabels: Record<QuoteCategoryBasis, string> = {
  fixed: 'Fixed amount',
  per_kw: 'Rate × PV capacity (kWp)',
  per_kwh: 'Rate × battery capacity (kWh)',
  per_sqm: 'Rate × floor area (m²)',
  per_floor: 'Rate × number of floors',
  per_kw_load: 'Rate × estimated load (kW)',
  percent_of_subtotal: 'Percentage of the equipment subtotal',
};

export type QuoteCategoryCondition =
  'always' | 'with_pv' | 'with_battery' | 'with_backup' | 'commercial_only';

export const quoteCategoryConditions = [
  'always',
  'with_pv',
  'with_battery',
  'with_backup',
  'commercial_only',
] as const satisfies readonly QuoteCategoryCondition[];

export const quoteCategoryConditionLabels: Record<QuoteCategoryCondition, string> = {
  always: 'Always included',
  with_pv: 'Only with a solar PV system',
  with_battery: 'Only with battery storage',
  with_backup: 'Only with a backup requirement',
  commercial_only: 'Only for commercial projects',
};

export type QuoteCategorySector = 'residential' | 'commercial' | 'both';

export const quoteCategorySectorLabels: Record<QuoteCategorySector, string> = {
  residential: 'Residential only',
  commercial: 'Commercial only',
  both: 'Residential and commercial',
};

export type QuoteCategory = {
  id: string;
  key: string;
  label: string;
  sector: QuoteCategorySector;
  basis: QuoteCategoryBasis;
  rate: number;
  minAmount: number | null;
  maxAmount: number | null;
  appliesWhen: QuoteCategoryCondition;
  position: number;
  isActive: boolean;
};

export type QuoteSettings = {
  currencyCode: string;
  currencySymbol: string;
  quotationPrefix: string;
  validityDays: number;
  roundingStep: number;
  minimumTotal: number;
  residentialMultiplier: number;
  commercialMultiplier: number;
  complexityMultipliers: Record<string, number>;
  locationMultipliers: Record<string, number>;
  sizingAssumptions: Record<string, number>;
  clientNotes: string[];
  disclaimer: string;
};

/**
 * Rates behind the figure shown after the short estimate form is submitted.
 *
 * Separate from QuoteSettings, which drives the detailed quotation builder from an itemised rate
 * card. This one turns a single average monthly bill into one number.
 */
export type QuickEstimateSettings = {
  residentialRatePerKwh: number;
  commercialRatePerKwh: number;
  industrialRatePerKwh: number;
  peakSunHours: number;
  daysPerMonth: number;
  panelWatts: number;
  pricePerKw: number;
  batteryCost: number;
  roundingStep: number;
};

export type QuotationRecord = {
  id: string;
  quotationNumber: string;
  sector: QuotationSector;
  status: QuotationStatus;
  clientName: string;
  clientContact: string;
  clientEmail: string | null;
  projectName: string | null;
  projectLocation: string;
  serviceArea: QuotationServiceArea;
  inputs: Record<string, unknown>;
  lineItems: QuotationLineItem[];
  systemSizeKwp: number;
  batteryKwh: number;
  estimatedTotal: number;
  currencyCode: string;
  validUntil: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
};
