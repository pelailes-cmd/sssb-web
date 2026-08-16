import {
  ArrowLeft,
  FileImage,
  FileText,
  LoaderCircle,
  RefreshCw,
  Save,
  ScrollText,
  Search,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteQuotation,
  fetchQuotations,
  updateQuotation,
} from '../../cms/quotationAdminRepository';
import {
  quotationStatusLabels,
  quotationStatuses,
  type QuotationRecord,
  type QuotationStatus,
} from '../../cms/quotationTypes';
import { assetUrl, business } from '../../data/siteData';
import type { QuotationDocumentModel } from '../../lib/docgen/types';
import {
  downloadBlob,
  formatQuotationAmount,
  formatQuotationDate,
  loadLogoDataUrl,
} from '../../lib/quotationDocument';

const currency = (record: QuotationRecord, amount: number) =>
  formatQuotationAmount(amount, record.currencyCode === 'PHP' ? '₱' : '');

/** Rebuilds the client document from the stored record so an administrator can re-issue it. */
function documentModelFor(record: QuotationRecord): QuotationDocumentModel {
  return {
    company: {
      name: business.name,
      tagline: business.tagline,
      phone: business.phoneDisplay,
      address: business.address,
    },
    title: 'INITIAL ESTIMATE / QUOTATION',
    quotationNumber: record.quotationNumber,
    metaLeft: [
      { label: 'Quotation No.', value: record.quotationNumber },
      { label: 'Date', value: formatQuotationDate(record.createdAt) },
      ...(record.validUntil
        ? [{ label: 'Valid until', value: formatQuotationDate(record.validUntil) }]
        : []),
    ],
    metaRight: [
      { label: 'Client', value: record.clientName },
      ...(record.projectName ? [{ label: 'Project', value: record.projectName }] : []),
      { label: 'Location', value: record.projectLocation },
      {
        label: 'Project type',
        value: record.sector === 'commercial' ? 'Commercial' : 'Residential',
      },
    ],
    highlights: [
      ...(record.systemSizeKwp > 0
        ? [{ label: 'Estimated system size', value: `${record.systemSizeKwp} kWp` }]
        : []),
      ...(record.batteryKwh > 0
        ? [{ label: 'Battery storage', value: `${record.batteryKwh} kWh` }]
        : []),
    ],
    scopeHeading: 'Estimated Scope',
    lineItems: record.lineItems.map((item) => ({
      label: item.label,
      amount: currency(record, item.amount),
    })),
    totalLabel: 'Estimated Total',
    totalAmount: currency(record, record.estimatedTotal),
    notes: [],
    disclaimerLabel: 'Disclaimer',
    disclaimer:
      'This quotation is an initial estimate based on the information provided by the client and is subject to site assessment, engineering evaluation, final design, material availability, project requirements, and other applicable conditions. The final project cost may vary after detailed assessment and confirmation.',
    footnote: `${business.supportingName} · ${business.phoneDisplay} · Reference ${record.quotationNumber}`,
  };
}

export function QuotationRequestsPanel() {
  const [records, setRecords] = useState<QuotationRecord[]>([]);
  const [selected, setSelected] = useState<QuotationRecord | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | QuotationStatus>('all');
  const [noteDraft, setNoteDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState<QuotationStatus>('generated');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyFormat, setBusyFormat] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setRecords(await fetchQuotations());
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'The quotations could not be loaded.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const request = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(request);
  }, [load]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return records.filter((record) => {
      const matchesStatus = statusFilter === 'all' || record.status === statusFilter;
      const matchesQuery =
        !normalized ||
        [
          record.quotationNumber,
          record.clientName,
          record.clientContact,
          record.projectName ?? '',
          record.projectLocation,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalized);
      return matchesStatus && matchesQuery;
    });
  }, [query, records, statusFilter]);

  const stats = useMemo(() => {
    const total = records.length;
    const pending = records.filter((record) =>
      ['generated', 'sent', 'under_review'].includes(record.status),
    ).length;
    const approved = records.filter((record) => record.status === 'approved').length;
    const value = records
      .filter((record) => record.status === 'approved')
      .reduce((sum, record) => sum + record.estimatedTotal, 0);
    return { total, pending, approved, value };
  }, [records]);

  const openRecord = (record: QuotationRecord) => {
    setSelected(record);
    setNoteDraft(record.adminNotes ?? '');
    setStatusDraft(record.status);
    setError(null);
    setNotice(null);
  };

  const applyChanges = async (changes: { status?: QuotationStatus; adminNotes?: string }) => {
    if (!selected) return;
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateQuotation(selected.id, changes);
      setSelected(updated);
      setNoteDraft(updated.adminNotes ?? '');
      setStatusDraft(updated.status);
      setRecords((current) =>
        current.map((record) => (record.id === updated.id ? updated : record)),
      );
      setNotice('Quotation updated successfully.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The quotation was not updated.');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (record: QuotationRecord) => {
    const confirmed = window.confirm(
      `Remove quotation “${record.quotationNumber}”? The stored record will be deleted permanently.`,
    );
    if (!confirmed) return;

    setIsSaving(true);
    setError(null);
    try {
      await deleteQuotation(record.id);
      setRecords((current) => current.filter((entry) => entry.id !== record.id));
      setSelected(null);
      setNotice('Quotation removed successfully.');
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'The quotation was not removed.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const download = async (record: QuotationRecord, format: 'png' | 'pdf' | 'docx') => {
    setBusyFormat(format);
    setError(null);
    try {
      const model = documentModelFor(record);
      const logoDataUrl = await loadLogoDataUrl(assetUrl('assets/brand/brand-mark.png'));
      const render =
        format === 'png'
          ? (await import('../../lib/docgen/png')).renderQuotationPng
          : format === 'pdf'
            ? (await import('../../lib/docgen/pdf')).renderQuotationPdf
            : (await import('../../lib/docgen/docx')).renderQuotationDocx;
      const blob = await render(model, { logoDataUrl });
      downloadBlob(blob, `${record.quotationNumber}.${format}`);
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
    <section className="admin-quotations-panel" aria-labelledby="admin-quotations-title">
      <div className="admin-team-intro">
        <span>
          <ScrollText aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">Administrator controls</p>
          <h3 id="admin-quotations-title">Quotation requests</h3>
          <p>
            Every estimate generated from the website is recorded here with its reference number,
            client details and status.
          </p>
        </div>
      </div>

      {error ? (
        <div className="admin-notice admin-notice--error" role="alert">
          <strong>Quotations need attention</strong>
          <p>{error}</p>
        </div>
      ) : null}
      {notice ? (
        <div className="admin-notice" role="status">
          <strong>Quotations updated</strong>
          <p>{notice}</p>
        </div>
      ) : null}

      {selected ? (
        <div className="admin-quotation-detail">
          <div className="admin-editor__header">
            <div>
              <p className="eyebrow">Quotation record</p>
              <h4>{selected.quotationNumber}</h4>
            </div>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => setSelected(null)}
            >
              <ArrowLeft aria-hidden="true" />
              Back to list
            </button>
          </div>

          <dl className="admin-quotation-detail__meta">
            <div>
              <dt>Client</dt>
              <dd>{selected.clientName}</dd>
            </div>
            <div>
              <dt>Contact</dt>
              <dd>{selected.clientContact}</dd>
            </div>
            {selected.clientEmail ? (
              <div>
                <dt>Email</dt>
                <dd>{selected.clientEmail}</dd>
              </div>
            ) : null}
            <div>
              <dt>Location</dt>
              <dd>{selected.projectLocation}</dd>
            </div>
            <div>
              <dt>Classification</dt>
              <dd>{selected.sector === 'commercial' ? 'Commercial' : 'Residential'}</dd>
            </div>
            <div>
              <dt>System size</dt>
              <dd>
                {selected.systemSizeKwp} kWp
                {selected.batteryKwh > 0 ? ` · ${selected.batteryKwh} kWh storage` : ''}
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{new Date(selected.createdAt).toLocaleString('en-PH')}</dd>
            </div>
            <div>
              <dt>Estimated total</dt>
              <dd>{currency(selected, selected.estimatedTotal)}</dd>
            </div>
          </dl>

          <div className="admin-quotation-lines">
            {selected.lineItems.map((item) => (
              <p key={item.label}>
                <span>{item.label}</span>
                <span>{currency(selected, item.amount)}</span>
              </p>
            ))}
          </div>

          <div className="admin-editor__fields">
            <label className="admin-field">
              <span>Status</span>
              {/* Held locally and written by the Save button. Writing on every change event would
                  commit each option a keyboard user passes through while arrowing to the one they
                  want, and disabling the control mid-interaction would drop their focus. */}
              <select
                value={statusDraft}
                onChange={(event) => setStatusDraft(event.target.value as QuotationStatus)}
              >
                {quotationStatuses.map((status) => (
                  <option key={status} value={status}>
                    {quotationStatusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field admin-field--full">
              <span>Internal notes</span>
              <textarea
                rows={3}
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
              />
              <small>Visible to administrators only.</small>
            </label>
          </div>

          <div className="admin-editor__actions">
            <button
              className="button button--ghost is-danger"
              type="button"
              disabled={isSaving}
              onClick={() => void remove(selected)}
            >
              <Trash2 aria-hidden="true" />
              Remove
            </button>
            <button
              className="button button--primary"
              type="button"
              disabled={isSaving}
              onClick={() => void applyChanges({ status: statusDraft, adminNotes: noteDraft })}
            >
              {isSaving ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" />
              ) : (
                <Save aria-hidden="true" />
              )}
              {isSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>

          <div className="admin-quotation-downloads">
            {(['png', 'pdf', 'docx'] as const).map((format) => (
              <button
                key={format}
                className="button button--ghost"
                type="button"
                disabled={busyFormat !== null}
                onClick={() => void download(selected, format)}
              >
                {busyFormat === format ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : format === 'png' ? (
                  <FileImage aria-hidden="true" />
                ) : (
                  <FileText aria-hidden="true" />
                )}
                {format.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="admin-collection-summary">
            <div>
              <strong>{stats.total}</strong>
              <span>Total quotations</span>
            </div>
            <div>
              <strong>{stats.pending}</strong>
              <span>Awaiting decision</span>
            </div>
            <div>
              <strong>{stats.approved}</strong>
              <span>Approved</span>
            </div>
            <div>
              <strong>{stats.value.toLocaleString('en-PH')}</strong>
              <span>Approved value</span>
            </div>
            <button type="button" disabled={isLoading} onClick={() => void load()}>
              <RefreshCw className={isLoading ? 'is-spinning' : ''} aria-hidden="true" />
              Refresh
            </button>
          </div>

          <div className="admin-quotation-tools">
            <label>
              <Search aria-hidden="true" />
              <span className="sr-only">Search quotations</span>
              <input
                type="search"
                value={query}
                placeholder="Search reference, client or location"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label>
              <span className="sr-only">Filter by status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | QuotationStatus)}
              >
                <option value="all">All statuses</option>
                {quotationStatuses.map((status) => (
                  <option key={status} value={status}>
                    {quotationStatusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isLoading ? (
            <div className="admin-loading" role="status">
              <LoaderCircle className="is-spinning" aria-hidden="true" />
              Loading quotations…
            </div>
          ) : visible.length ? (
            <div className="admin-quotation-list">
              {visible.map((record) => (
                <article key={record.id}>
                  <div>
                    <span data-status={record.status}>{quotationStatusLabels[record.status]}</span>
                    <h5>{record.quotationNumber}</h5>
                    <p>
                      {record.clientName} · {record.projectLocation} ·{' '}
                      {new Date(record.createdAt).toLocaleDateString('en-PH', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  <strong>{currency(record, record.estimatedTotal)}</strong>
                  <button type="button" onClick={() => openRecord(record)}>
                    Open
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="admin-empty">
              <ScrollText aria-hidden="true" />
              <h3>No quotations match the current filters.</h3>
              <p>Estimates generated from the website appear here automatically.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
