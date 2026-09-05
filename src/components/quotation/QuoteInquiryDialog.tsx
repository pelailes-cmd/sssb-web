import { CheckCircle2, LoaderCircle, Send, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useQuoteDialog } from '../../cms/QuoteDialogContext';
import { business } from '../../data/siteData';
import {
  emptyInquiry,
  propertyTypes,
  roofTypes,
  submitInquiry,
  todayIsoDate,
  validateInquiry,
  type InquiryErrors,
  type InquiryEstimate,
  type InquiryValues,
  type PropertyType,
  type RoofType,
} from '../../lib/quoteInquiry';

/** Configured at build time; the address is public, but the recipient mailbox is not. */
const inquiryEndpoint = import.meta.env.VITE_QUOTE_INQUIRY_ENDPOINT?.trim() ?? '';
const isConfigured = Boolean(inquiryEndpoint);

const amount = (value: number) => `₱${Math.round(value).toLocaleString('en-PH')}`;

/**
 * Short estimate request, opened from the header and from every main section.
 *
 * It collects only what is needed to size a system — the average monthly bill and the property
 * type do most of the work — sends it to the sales inbox, and shows the figure the server worked
 * out from it.
 *
 * Nothing is priced in this file. The tariffs, the price per kW, the battery cost and the panel
 * rating are the administrator's settings; they are read and applied on the server, which returns
 * only the finished figures displayed below.
 */
export function QuoteInquiryDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const openedAt = useRef(0);
  const fieldId = useId();
  const { openDialog, closeDialog } = useQuoteDialog();

  const [values, setValues] = useState<InquiryValues>(emptyInquiry);
  const [errors, setErrors] = useState<InquiryErrors>({});
  const [honeypot, setHoneypot] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);
  const [estimate, setEstimate] = useState<InquiryEstimate | null>(null);

  const isOpen = openDialog === 'inquiry';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
      openedAt.current = Date.now();
      window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const dismiss = () => {
    closeDialog();
    // Reset only once the dialog has closed, so the visitor does not watch it empty out.
    window.setTimeout(() => {
      setValues(emptyInquiry);
      setErrors({});
      setHoneypot('');
      setSubmitError(null);
      setIsSent(false);
      setEstimate(null);
    }, 200);
  };

  const update = <K extends keyof InquiryValues>(field: K, value: InquiryValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const errorId = (field: keyof InquiryValues) => `${fieldId}-${field}-error`;

  const fieldError = (field: keyof InquiryValues) =>
    errors[field] ? (
      <small className="field-error" id={errorId(field)}>
        {errors[field]}
      </small>
    ) : null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateInquiry(values);
    setErrors(nextErrors);
    setSubmitError(null);

    const firstInvalid = Object.keys(nextErrors)[0];
    if (firstInvalid) {
      const field = event.currentTarget.elements.namedItem(firstInvalid);
      if (field instanceof HTMLElement) field.focus();
      return;
    }

    setIsSending(true);
    try {
      // The figure comes back with the confirmation, so what is shown here and what reaches the
      // sales inbox are the same number, worked out once, on the server.
      setEstimate(
        await submitInquiry(inquiryEndpoint, values, {
          honeypot,
          elapsedMs: Date.now() - openedAt.current,
        }),
      );
      setIsSent(true);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Your inquiry could not be sent. Please try again.',
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="quote-dialog"
      aria-labelledby={`${fieldId}-title`}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClose={dismiss}
    >
      <div className="quote-dialog__head">
        <div>
          <p className="eyebrow">Get an Estimate</p>
          <h2 id={`${fieldId}-title`}>Tell us about your property</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Close the estimate request"
          onClick={dismiss}
        >
          <X aria-hidden="true" />
        </button>
      </div>

      {isSent ? (
        <div className="quote-dialog__success" role="status">
          <CheckCircle2 aria-hidden="true" />
          <h3>Submission success, we&rsquo;ll get back to you right away.</h3>
          {/* Shown only when the server returned a figure. A submission that arrived without one
              still succeeded, and saying so plainly beats an empty panel or an apology. */}
          {estimate ? (
            <div className="quote-estimate">
              <p className="quote-estimate__label">
                Estimated cost for a {estimate.propertyTypeLabel.toLowerCase()} system
              </p>
              <p className="quote-estimate__total">{amount(estimate.estimatedTotal)}</p>
              <dl className="quote-estimate__facts">
                <div>
                  <dt>System size</dt>
                  <dd>{estimate.systemSizeKw} kW</dd>
                </div>
                <div>
                  <dt>Solar panels</dt>
                  <dd>{estimate.panelCount}</dd>
                </div>
                <div>
                  <dt>Monthly usage</dt>
                  <dd>{estimate.monthlyKwh.toLocaleString('en-PH')} kWh</dd>
                </div>
              </dl>
              <p className="quote-estimate__note">
                Indicative only. It is sized from the bill you gave us and includes battery storage;
                the final figure follows a site assessment.
              </p>
            </div>
          ) : null}
          <p>
            Our team will review your details and contact you shortly. For anything urgent, call{' '}
            <a href={business.phoneHref}>{business.phoneDisplay}</a>.
          </p>
          <button className="button button--primary" type="button" onClick={dismiss}>
            Close
          </button>
        </div>
      ) : (
        <form className="quote-dialog__form" onSubmit={submit} noValidate>
          <p className="quote-dialog__lede">
            Your average monthly bill and property type tell us most of what we need. Fill in the
            details below and we will show you an estimate straight away.
          </p>

          <div className="form-grid">
            <label className="field">
              <span>
                Full name <b aria-hidden="true">*</b>
              </span>
              <input
                ref={firstFieldRef}
                name="fullName"
                type="text"
                autoComplete="name"
                value={values.fullName}
                aria-invalid={errors.fullName ? true : undefined}
                aria-describedby={errors.fullName ? errorId('fullName') : undefined}
                onChange={(event) => update('fullName', event.target.value)}
              />
              {fieldError('fullName')}
            </label>

            <label className="field">
              <span>
                Email address <b aria-hidden="true">*</b>
              </span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                value={values.email}
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? errorId('email') : undefined}
                onChange={(event) => update('email', event.target.value)}
              />
              {fieldError('email')}
            </label>

            <label className="field">
              <span>
                Phone number <b aria-hidden="true">*</b>
              </span>
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="0997-688-4865"
                value={values.phone}
                aria-invalid={errors.phone ? true : undefined}
                aria-describedby={errors.phone ? errorId('phone') : undefined}
                onChange={(event) => update('phone', event.target.value)}
              />
              {fieldError('phone')}
            </label>

            <label className="field">
              <span>
                Preferred installation date <b aria-hidden="true">*</b>
              </span>
              <input
                name="installationDate"
                type="date"
                min={todayIsoDate()}
                value={values.installationDate}
                aria-invalid={errors.installationDate ? true : undefined}
                aria-describedby={errors.installationDate ? errorId('installationDate') : undefined}
                onChange={(event) => update('installationDate', event.target.value)}
              />
              {fieldError('installationDate')}
            </label>

            <label className="field">
              <span>
                Property type <b aria-hidden="true">*</b>
              </span>
              <select
                name="propertyType"
                value={values.propertyType}
                aria-invalid={errors.propertyType ? true : undefined}
                aria-describedby={
                  errors.propertyType
                    ? `${errorId('propertyType')} ${fieldId}-property-hint`
                    : `${fieldId}-property-hint`
                }
                onChange={(event) => update('propertyType', event.target.value as PropertyType)}
              >
                <option value="">Select a property type</option>
                {propertyTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <small id={`${fieldId}-property-hint`}>
                This sets the electricity rate we work from.
              </small>
              {fieldError('propertyType')}
            </label>

            <label className="field">
              <span>
                Roof type <b aria-hidden="true">*</b>
              </span>
              <select
                name="roofType"
                value={values.roofType}
                aria-invalid={errors.roofType ? true : undefined}
                aria-describedby={errors.roofType ? errorId('roofType') : undefined}
                onChange={(event) => update('roofType', event.target.value as RoofType)}
              >
                <option value="">Select a roof type</option>
                {roofTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              {fieldError('roofType')}
            </label>

            <label className="field">
              <span>
                Number of floors <b aria-hidden="true">*</b>
              </span>
              <input
                name="floors"
                type="number"
                inputMode="numeric"
                min="1"
                max="60"
                step="1"
                value={values.floors}
                aria-invalid={errors.floors ? true : undefined}
                aria-describedby={errors.floors ? errorId('floors') : undefined}
                onChange={(event) => update('floors', event.target.value)}
              />
              {fieldError('floors')}
            </label>

            <label className="field field--wide">
              <span>
                Installation address <b aria-hidden="true">*</b>
              </span>
              <input
                name="address"
                type="text"
                autoComplete="street-address"
                placeholder="House number, street, barangay, city"
                value={values.address}
                aria-invalid={errors.address ? true : undefined}
                aria-describedby={errors.address ? errorId('address') : undefined}
                onChange={(event) => update('address', event.target.value)}
              />
              {fieldError('address')}
            </label>

            <label className="field field--wide">
              <span>
                Average monthly electricity bill <b aria-hidden="true">*</b>
              </span>
              <input
                name="monthlyBill"
                type="number"
                inputMode="numeric"
                min="0"
                step="100"
                placeholder="e.g. 8000"
                value={values.monthlyBill}
                aria-invalid={errors.monthlyBill ? true : undefined}
                aria-describedby={
                  errors.monthlyBill
                    ? `${errorId('monthlyBill')} ${fieldId}-bill-hint`
                    : `${fieldId}-bill-hint`
                }
                onChange={(event) => update('monthlyBill', event.target.value)}
              />
              <small id={`${fieldId}-bill-hint`}>
                In pesos. This is what we size your system from.
              </small>
              {fieldError('monthlyBill')}
            </label>
          </div>

          {/* Left empty by people and filled by bots; a filled value is rejected server-side. */}
          <div className="quote-dialog__trap" aria-hidden="true">
            <label htmlFor={`${fieldId}-website`}>Website</label>
            <input
              id={`${fieldId}-website`}
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(event) => setHoneypot(event.target.value)}
            />
          </div>

          {!isConfigured ? (
            <p className="form-status form-status--error" role="alert">
              The inquiry form is not connected yet. Please call {business.phoneDisplay} and we will
              take your details.
            </p>
          ) : null}

          {submitError ? (
            <p className="form-status form-status--error" role="alert">
              {submitError}
            </p>
          ) : null}

          <div className="quote-dialog__actions">
            <button className="button button--ghost-ink" type="button" onClick={dismiss}>
              Cancel
            </button>
            <button
              className="button button--solar"
              type="submit"
              disabled={isSending || !isConfigured}
            >
              {isSending ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" size={18} />
              ) : (
                <Send aria-hidden="true" size={18} />
              )}
              {isSending ? 'Sending…' : 'Get an Estimate'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
