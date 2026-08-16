/**
 * Shared model for every generated quotation document (PNG, PDF, DOCX).
 *
 * Every value is pre-formatted by the caller so the generators stay dumb: they lay out
 * strings and never compute, round, or format money. This also keeps the security
 * boundary obvious — nothing in this model may carry unit prices, quantities, supplier
 * names, formulas, or margins. It holds only the generic category labels and the
 * amounts the server already decided the client is allowed to see.
 */

export type DocumentCompany = {
  name: string;
  tagline?: string;
  phone: string;
  address: string;
};

export type DocumentMetaRow = {
  label: string;
  value: string;
};

export type DocumentLineItem = {
  label: string;
  /** Pre-formatted currency string, e.g. "₱182,400". */
  amount: string;
};

export type QuotationDocumentModel = {
  company: DocumentCompany;
  /** Document heading, e.g. "INITIAL ESTIMATE / QUOTATION". */
  title: string;
  quotationNumber: string;
  /** Left column of the meta block: quotation number, date, validity. */
  metaLeft: DocumentMetaRow[];
  /** Right column of the meta block: client, project, location, classification. */
  metaRight: DocumentMetaRow[];
  /** Optional highlights above the table, e.g. "Estimated system size · 8.2 kWp". */
  highlights: DocumentMetaRow[];
  scopeHeading: string;
  lineItems: DocumentLineItem[];
  totalLabel: string;
  totalAmount: string;
  notes: string[];
  disclaimerLabel: string;
  disclaimer: string;
  /** Small print under the disclaimer, e.g. the generation timestamp. */
  footnote: string;
};

export type DocumentAssets = {
  /** PNG data URL for the company logo, or null when it could not be loaded. */
  logoDataUrl: string | null;
};

export type QuotationDocumentRenderer = (
  model: QuotationDocumentModel,
  assets: DocumentAssets,
) => Promise<Blob>;
