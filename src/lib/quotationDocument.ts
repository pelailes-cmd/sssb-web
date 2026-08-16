import type { QuotationEstimate } from '../cms/quotationTypes';
import { business } from '../data/siteData';
import type { QuotationDocumentModel } from './docgen/types';

const amountFormatter = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Amounts arrive already rounded by the server, so no decimals are shown. */
export function formatQuotationAmount(amount: number, symbol: string): string {
  return `${symbol}${amountFormatter.format(Math.round(amount))}`;
}

export function formatQuotationDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

const sectorLabel = (sector: QuotationEstimate['sector']) =>
  sector === 'commercial' ? 'Commercial' : 'Residential';

/**
 * Turns the server's estimate into the shape the PNG, PDF and DOCX writers consume.
 *
 * Only what the server chose to disclose is carried across: generic category labels and their
 * rounded amounts. There is deliberately no route by which a rate, a multiplier, a quantity or a
 * supplier name could reach a generated document, because none of those ever reach the browser.
 */
export function buildQuotationDocumentModel(estimate: QuotationEstimate): QuotationDocumentModel {
  const symbol = estimate.currencySymbol || '₱';

  const metaLeft = [
    { label: 'Quotation No.', value: estimate.quotationNumber },
    { label: 'Date', value: formatQuotationDate(estimate.issuedAt) },
    { label: 'Valid until', value: formatQuotationDate(estimate.validUntil) },
  ];

  const metaRight = [
    { label: 'Client', value: estimate.clientName },
    ...(estimate.projectName ? [{ label: 'Project', value: estimate.projectName }] : []),
    { label: 'Location', value: estimate.projectLocation },
    { label: 'Project type', value: sectorLabel(estimate.sector) },
  ];

  return {
    company: {
      name: business.name,
      tagline: business.tagline,
      phone: business.phoneDisplay,
      address: business.address,
    },
    title: 'INITIAL ESTIMATE / QUOTATION',
    quotationNumber: estimate.quotationNumber,
    metaLeft,
    metaRight,
    highlights: estimate.highlights.map((highlight) => ({
      label: highlight.label,
      value: highlight.value,
    })),
    scopeHeading: 'Estimated Scope',
    lineItems: estimate.lineItems.map((item) => ({
      label: item.label,
      amount: formatQuotationAmount(item.amount, symbol),
    })),
    totalLabel: 'Estimated Total',
    totalAmount: formatQuotationAmount(estimate.estimatedTotal, symbol),
    notes: estimate.notes,
    disclaimerLabel: 'Disclaimer',
    disclaimer: estimate.disclaimer,
    footnote: `${business.supportingName} · ${business.phoneDisplay} · Reference ${estimate.quotationNumber}`,
  };
}

/** Loads the site logo as a PNG data URL for embedding into generated documents. */
export async function loadLogoDataUrl(source: string): Promise<string | null> {
  try {
    const response = await fetch(source);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
