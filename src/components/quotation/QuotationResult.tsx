import { FileImage, FileText, Info, LoaderCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { QuotationEstimate } from '../../cms/quotationTypes';
import { assetUrl, business } from '../../data/siteData';
import {
  buildQuotationDocumentModel,
  downloadBlob,
  formatQuotationAmount,
  formatQuotationDate,
  loadLogoDataUrl,
} from '../../lib/quotationDocument';

type DocumentFormat = 'png' | 'pdf' | 'docx';

const formatLabels: Record<DocumentFormat, string> = {
  png: 'Image',
  pdf: 'PDF',
  docx: 'Word',
};

const extensions: Record<DocumentFormat, string> = {
  png: 'png',
  pdf: 'pdf',
  docx: 'docx',
};

type QuotationResultProps = {
  estimate: QuotationEstimate;
  onRestart: () => void;
};

export function QuotationResult({ estimate, onRestart }: QuotationResultProps) {
  const [busyFormat, setBusyFormat] = useState<DocumentFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const symbol = estimate.currencySymbol || '₱';

  const generate = async (format: DocumentFormat) => {
    setBusyFormat(format);
    setError(null);
    try {
      const model = buildQuotationDocumentModel(estimate);
      const logoDataUrl = await loadLogoDataUrl(assetUrl('assets/brand/brand-mark.png'));
      const assets = { logoDataUrl };

      const render =
        format === 'png'
          ? (await import('../../lib/docgen/png')).renderQuotationPng
          : format === 'pdf'
            ? (await import('../../lib/docgen/pdf')).renderQuotationPdf
            : (await import('../../lib/docgen/docx')).renderQuotationDocx;

      const blob = await render(model, assets);
      downloadBlob(blob, `${estimate.quotationNumber}.${extensions[format]}`);
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : 'The document could not be generated.',
      );
    } finally {
      setBusyFormat(null);
    }
  };

  return (
    <div className="quotation-result" data-reveal>
      <div className="quotation-result__head">
        <div>
          <p className="eyebrow">Initial estimate prepared</p>
          <h3>{estimate.quotationNumber}</h3>
          <p>
            Issued {formatQuotationDate(estimate.issuedAt)} · Valid until{' '}
            {formatQuotationDate(estimate.validUntil)}
          </p>
        </div>
        <div className="quotation-result__total">
          <span>Estimated total</span>
          <strong>{formatQuotationAmount(estimate.estimatedTotal, symbol)}</strong>
        </div>
      </div>

      {estimate.highlights.length ? (
        <dl className="quotation-result__highlights">
          {estimate.highlights.map((highlight) => (
            <div key={highlight.label}>
              <dt>{highlight.label}</dt>
              <dd>{highlight.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {/* A real table so each amount is announced with its description and column header rather
          than as a bare number following an unrelated label. */}
      <table className="quotation-scope">
        <caption className="sr-only">
          Estimated scope for quotation {estimate.quotationNumber}
        </caption>
        <thead>
          <tr>
            <th scope="col">Description</th>
            <th scope="col">Estimated amount</th>
          </tr>
        </thead>
        <tbody>
          {estimate.lineItems.map((item) => (
            <tr key={item.label}>
              <th scope="row">{item.label}</th>
              <td>{formatQuotationAmount(item.amount, symbol)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Estimated Total</th>
            <td>{formatQuotationAmount(estimate.estimatedTotal, symbol)}</td>
          </tr>
        </tfoot>
      </table>

      {estimate.notes.length ? (
        <ul className="quotation-result__notes">
          {estimate.notes.map((note) => (
            <li key={note}>
              <Info aria-hidden="true" size={15} />
              {note}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="quotation-disclaimer">
        <ShieldCheck aria-hidden="true" />
        <p>
          <strong>Disclaimer:</strong> {estimate.disclaimer}
        </p>
      </div>

      <div className="quotation-result__actions">
        <div className="quotation-downloads">
          {(['png', 'pdf', 'docx'] as DocumentFormat[]).map((format) => (
            <button
              key={format}
              className="button button--primary"
              type="button"
              disabled={busyFormat !== null}
              onClick={() => void generate(format)}
            >
              {busyFormat === format ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" size={18} />
              ) : format === 'png' ? (
                <FileImage aria-hidden="true" size={18} />
              ) : (
                <FileText aria-hidden="true" size={18} />
              )}
              {busyFormat === format ? 'Preparing…' : `Download ${formatLabels[format]}`}
            </button>
          ))}
        </div>
        <button className="button button--ghost-ink" type="button" onClick={onRestart}>
          <RotateCcw aria-hidden="true" size={18} />
          Start a new estimate
        </button>
      </div>

      {error ? (
        <p className="form-status form-status--error" role="alert">
          {error}
        </p>
      ) : null}

      <p className="quotation-result__contact">
        Questions about this estimate? Call {business.name} on{' '}
        <a href={business.phoneHref}>{business.phoneDisplay}</a> and quote reference{' '}
        {estimate.quotationNumber}.
      </p>
    </div>
  );
}
