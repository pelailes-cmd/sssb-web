/**
 * Quote inquiry submission.
 *
 * The short form is delivered straight to the company's sales inbox by a Google Apps Script web
 * app, so no database table or mail provider account is involved. The recipient address lives in
 * the script's own properties rather than here, which keeps it out of the published bundle.
 *
 * The endpoint address itself is public, as any browser-callable endpoint must be. The script
 * checks every field again on its side, ignores anything that trips the honeypot, and refuses
 * submissions that arrive faster than a person could type, which is what keeps casual abuse from
 * consuming the daily send quota. See EMAIL_SETUP.md.
 */

export const roofTypes = [
  { value: 'metal', label: 'Corrugated metal / G.I. sheet' },
  { value: 'concrete', label: 'Concrete deck' },
  { value: 'tile', label: 'Clay or concrete tile' },
  { value: 'shingle', label: 'Asphalt shingle' },
  { value: 'other', label: 'Other' },
] as const;

export type RoofType = (typeof roofTypes)[number]['value'];

/**
 * Decides which electricity tariff the estimate is worked out from. The rate behind each of these
 * is set by the administrator and never reaches the browser.
 */
export const propertyTypes = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'industrial', label: 'Industrial' },
] as const;

export type PropertyType = (typeof propertyTypes)[number]['value'];

export type InquiryValues = {
  fullName: string;
  email: string;
  phone: string;
  installationDate: string;
  propertyType: PropertyType | '';
  roofType: RoofType | '';
  floors: string;
  address: string;
  monthlyBill: string;
};

/**
 * The finished figures the server sends back, in the order they are shown.
 *
 * Only these reach the browser. The tariff, the price per kW, the battery cost and the panel
 * rating they were derived from stay on the server, as does the arithmetic itself.
 */
export type InquiryEstimate = {
  propertyTypeLabel: string;
  monthlyKwh: number;
  systemSizeKw: number;
  panelCount: number;
  estimatedTotal: number;
};

export type InquiryErrors = Partial<Record<keyof InquiryValues, string>>;

export const emptyInquiry: InquiryValues = {
  fullName: '',
  email: '',
  phone: '',
  installationDate: '',
  propertyType: '',
  roofType: '',
  floors: '',
  address: '',
  monthlyBill: '',
};

/** Deliberately permissive: enough to catch a typo, not enough to reject a valid address. */
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Philippine mobile and landline numbers, allowing spaces, dashes and a country code. */
const phonePattern = /^\+?[\d\s()-]{7,20}$/;

const positiveNumber = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const todayIsoDate = () => new Date().toISOString().slice(0, 10);

/** Every field is required; the form cannot be submitted with anything left blank. */
export function validateInquiry(values: InquiryValues): InquiryErrors {
  const errors: InquiryErrors = {};

  if (values.fullName.trim().length < 2) {
    errors.fullName = 'Enter your full name.';
  }
  if (!emailPattern.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }
  if (!phonePattern.test(values.phone.trim())) {
    errors.phone = 'Enter a contact number we can reach you on.';
  }
  if (!values.installationDate) {
    errors.installationDate = 'Choose your preferred installation date.';
  } else if (values.installationDate < todayIsoDate()) {
    errors.installationDate = 'Choose a date that has not already passed.';
  }
  if (!values.propertyType) {
    errors.propertyType = 'Select your property type.';
  }
  if (!values.roofType) {
    errors.roofType = 'Select your roof type.';
  }
  const floors = positiveNumber(values.floors);
  if (floors === null || floors > 60) {
    errors.floors = 'Enter the number of floors.';
  }
  if (values.address.trim().length < 5) {
    errors.address = 'Enter the installation address.';
  }
  if (positiveNumber(values.monthlyBill) === null) {
    errors.monthlyBill = 'Enter your average monthly electricity bill.';
  }

  return errors;
}

export type InquiryContext = {
  /** Must stay empty; a filled honeypot means a bot completed the form. */
  honeypot: string;
  /** Milliseconds the visitor spent on the form, used to reject instant submissions. */
  elapsedMs: number;
};

/**
 * Reads the figures out of the reply.
 *
 * Anything missing or nonsensical yields null rather than a partly filled panel: the success
 * message stands on its own, and a half-drawn estimate would be worse than none.
 */
function parseEstimate(value: unknown): InquiryEstimate | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;

  const figure = (key: string) => {
    const parsed = typeof raw[key] === 'number' ? (raw[key] as number) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const monthlyKwh = figure('monthlyKwh');
  const systemSizeKw = figure('systemSizeKw');
  const panelCount = figure('panelCount');
  const estimatedTotal = figure('estimatedTotal');
  const propertyTypeLabel =
    typeof raw.propertyTypeLabel === 'string' ? raw.propertyTypeLabel.trim() : '';

  if (!monthlyKwh || !systemSizeKw || !panelCount || !estimatedTotal || !propertyTypeLabel) {
    return null;
  }
  return { propertyTypeLabel, monthlyKwh, systemSizeKw, panelCount, estimatedTotal };
}

/**
 * The endpoint is passed in rather than read from the environment here, so this module stays free
 * of Vite-only globals and its validation rules can be exercised directly by the test suite.
 *
 * Resolves with the estimate the server worked out, or null when it could not produce one. A
 * missing estimate is not an error: the inquiry has still reached the sales inbox, which is the
 * part that must not fail.
 */
export async function submitInquiry(
  endpoint: string,
  values: InquiryValues,
  context: InquiryContext,
): Promise<InquiryEstimate | null> {
  if (!endpoint) {
    throw new Error('The inquiry form is not connected yet. Please call us and we will help.');
  }

  const payload = {
    fullName: values.fullName.trim(),
    email: values.email.trim(),
    phone: values.phone.trim(),
    installationDate: values.installationDate,
    propertyType: values.propertyType,
    roofType: values.roofType,
    roofTypeLabel: roofTypes.find((type) => type.value === values.roofType)?.label ?? '',
    floors: values.floors.trim(),
    address: values.address.trim(),
    monthlyBill: values.monthlyBill.trim(),
    submittedAt: new Date().toISOString(),
    website: context.honeypot,
    elapsedMs: context.elapsedMs,
  };

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      // text/plain keeps this a simple request. Apps Script web apps do not answer the CORS
      // preflight that application/json would trigger, so the request would never be sent.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
  } catch {
    throw new Error('Your inquiry could not be sent. Please check your connection and try again.');
  }

  if (!response.ok) {
    throw new Error('Your inquiry could not be sent. Please try again, or call us directly.');
  }

  const body = await response.text();
  let result: { ok?: boolean; error?: string; estimate?: unknown };
  try {
    result = JSON.parse(body) as { ok?: boolean; error?: string; estimate?: unknown };
  } catch {
    throw new Error('Your inquiry could not be confirmed. Please call us so we do not miss it.');
  }

  if (!result.ok) {
    throw new Error(result.error ?? 'Your inquiry was not accepted. Please try again.');
  }

  return parseEstimate(result.estimate);
}
