import { ArrowLeft, ArrowRight, Building2, Calculator, Home, LoaderCircle } from 'lucide-react';
import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { requestQuotationEstimate } from '../../cms/quotationRepository';
import type {
  QuotationEstimate,
  QuotationFormValues,
  QuotationSector,
} from '../../cms/quotationTypes';
import { useSiteContent } from '../../cms/SiteContentContext';
import { serviceAreaOptions } from '../../data/siteData';
import { QuotationResult } from './QuotationResult';

type FieldName = keyof QuotationFormValues;
type FormErrors = Partial<Record<FieldName, string>>;

type Option = { value: string; label: string; hint?: string };

const stepTitles = [
  'Project type',
  'Project details',
  'System requirements',
  'Your details',
  'Estimate',
];

const residentialProjectTypes: Option[] = [
  {
    value: 'new_installation',
    label: 'New solar installation',
    hint: 'The property has no solar system yet.',
  },
  {
    value: 'system_expansion',
    label: 'System expansion',
    hint: 'Adding capacity to an existing installation.',
  },
  {
    value: 'system_replacement',
    label: 'System replacement',
    hint: 'Replacing equipment that is already installed.',
  },
  {
    value: 'backup_only',
    label: 'Backup power only',
    hint: 'Storage and backup without new panels.',
  },
];

const commercialProjectTypes: Option[] = [
  { value: 'commercial_building', label: 'Commercial building' },
  { value: 'retail_or_office', label: 'Retail or office' },
  { value: 'warehouse_or_industrial', label: 'Warehouse or industrial' },
  { value: 'agricultural', label: 'Agricultural' },
  { value: 'institutional', label: 'Institutional' },
  { value: 'hospitality', label: 'Hospitality' },
];

const electricalServiceOptions: Option[] = [
  { value: 'single_phase_230', label: 'Single phase, 230V' },
  { value: 'three_phase_230', label: 'Three phase, 230V' },
  { value: 'three_phase_400', label: 'Three phase, 400V' },
  { value: 'unknown', label: 'Not sure' },
];

const systemTypeOptions: Option[] = [
  { value: 'grid_tied', label: 'Grid-tied', hint: 'Lowers the bill while the grid is available.' },
  { value: 'hybrid', label: 'Hybrid', hint: 'Grid connection with battery backup.' },
  { value: 'off_grid', label: 'Off-grid', hint: 'Runs independently of the utility.' },
];

const complexityOptions: Option[] = [
  { value: 'standard', label: 'Standard', hint: 'Straightforward roof, clear access.' },
  { value: 'moderate', label: 'Moderate', hint: 'Multiple roof planes or limited access.' },
  { value: 'complex', label: 'Complex', hint: 'Height, staging, or phased works required.' },
];

const existingSystemOptions: Option[] = [
  { value: 'none', label: 'No existing system' },
  { value: 'existing_pv', label: 'Existing solar system' },
  { value: 'generator', label: 'Generator on site' },
  { value: 'unknown', label: 'Not sure' },
];

const defaultValues: QuotationFormValues = {
  projectType: '',
  location: '',
  serviceArea: 'pili',
  floorArea: '',
  floors: '1',
  electricalService: 'single_phase_230',
  monthlyBill: '',
  estimatedLoadKw: '',
  pvRequired: true,
  systemType: 'hybrid',
  pvCapacityKwp: '',
  batteryRequired: false,
  batteryKwh: '',
  backupRequired: false,
  complexity: 'standard',
  existingSystem: 'none',
  additionalRequirements: '',
  clientName: '',
  clientContact: '',
  clientEmail: '',
  projectName: '',
};

const positive = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0;
};

function validateStep(
  step: number,
  sector: QuotationSector,
  values: QuotationFormValues,
): FormErrors {
  const errors: FormErrors = {};

  if (step === 0 && !values.projectType) {
    errors.projectType = 'Select the type of project.';
  }

  if (step === 1) {
    if (values.location.trim().length < 2) {
      errors.location = 'Enter the project location.';
    }
    if (!positive(values.monthlyBill)) {
      errors.monthlyBill = 'Enter the approximate monthly electricity bill.';
    }
    if (sector === 'commercial' && !positive(values.floorArea)) {
      errors.floorArea = 'Enter the approximate floor area.';
    }
  }

  if (step === 2) {
    if (!values.pvRequired && !values.batteryRequired) {
      errors.pvRequired = 'Select a solar photovoltaic system, battery storage, or both.';
    }
    if (values.pvRequired && values.pvCapacityKwp && !positive(values.pvCapacityKwp)) {
      errors.pvCapacityKwp = 'Enter a capacity greater than zero, or leave it blank.';
    }
    if (values.batteryRequired && values.batteryKwh && !positive(values.batteryKwh)) {
      errors.batteryKwh = 'Enter a capacity greater than zero, or leave it blank.';
    }
  }

  if (step === 3) {
    if (values.clientName.trim().length < 2) {
      errors.clientName = 'Enter the client name.';
    }
    if (values.clientContact.trim().length < 5) {
      errors.clientContact = 'Enter a contact number or email address.';
    }
  }

  return errors;
}

export function QuotationWizard() {
  const { isConfigured } = useSiteContent();
  const fieldId = useId();
  const stepRef = useRef<HTMLDivElement>(null);
  const [sector, setSector] = useState<QuotationSector>('residential');
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<QuotationFormValues>(defaultValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<QuotationEstimate | null>(null);

  const projectTypes = useMemo(
    () => (sector === 'commercial' ? commercialProjectTypes : residentialProjectTypes),
    [sector],
  );

  const update = <K extends FieldName>(field: K, value: QuotationFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const errorCount = Object.values(errors).filter(Boolean).length;

  const errorId = (field: FieldName) => `${fieldId}-${field}-error`;

  const describedBy = (field: FieldName, hintId?: string) => {
    const ids = [errors[field] ? errorId(field) : null, hintId ?? null].filter(Boolean);
    return ids.length ? ids.join(' ') : undefined;
  };

  /** Moves focus to the top of whichever step just became visible. */
  const focusStep = () => {
    window.setTimeout(() => stepRef.current?.focus(), 0);
  };

  const chooseSector = (next: QuotationSector) => {
    if (next === sector) return;
    // Sector-specific answers are cleared so a commercial figure cannot follow the visitor into a
    // residential estimate and silently change the system size.
    setSector(next);
    setValues((current) => ({
      ...current,
      projectType: '',
      estimatedLoadKw: '',
      complexity: 'standard',
      existingSystem: 'none',
    }));
    setErrors({});
  };

  const restart = () => {
    const confirmed = window.confirm(
      'Start a new estimate? The current reference number and amounts will not be shown again unless you have already downloaded them.',
    );
    if (!confirmed) return;
    setEstimate(null);
    setValues(defaultValues);
    setErrors({});
    setSubmitError(null);
    setStep(0);
    focusStep();
  };

  const goBack = () => {
    setSubmitError(null);
    setStep((current) => Math.max(0, current - 1));
    focusStep();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateStep(step, sector, values);
    setErrors(nextErrors);

    const firstInvalid = Object.keys(nextErrors)[0];
    if (firstInvalid) {
      // A radio group resolves to a RadioNodeList rather than an element, so focus the first
      // input inside it; otherwise activating Continue on step one appears to do nothing at all.
      const named = event.currentTarget.elements.namedItem(firstInvalid);
      const target =
        named instanceof HTMLElement
          ? named
          : named instanceof RadioNodeList
            ? (Array.from(named).find((node) => node instanceof HTMLElement) as
                HTMLElement | undefined)
            : undefined;
      if (target) target.focus();
      else stepRef.current?.focus();
      return;
    }

    if (step < 3) {
      setStep(step + 1);
      focusStep();
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await requestQuotationEstimate(sector, values);
      setEstimate(result);
      setStep(4);
      focusStep();
    } catch (requestError) {
      setSubmitError(
        requestError instanceof Error
          ? requestError.message
          : 'The estimate could not be prepared. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldError = (field: FieldName) =>
    errors[field] ? (
      <small className="field-error" id={errorId(field)}>
        {errors[field]}
      </small>
    ) : null;

  return (
    <div className="quotation-builder">
      <ol className="quotation-progress" aria-label="Quotation progress">
        {stepTitles.map((title, index) => (
          <li
            key={title}
            aria-current={index === step ? 'step' : undefined}
            data-state={index < step ? 'done' : index === step ? 'current' : 'todo'}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            {title}
            {/* State is carried in text as well as colour, for screen readers and forced colours. */}
            <span className="sr-only">
              {index < step
                ? ' (completed)'
                : index === step
                  ? ' (current step)'
                  : ' (not started)'}
            </span>
          </li>
        ))}
      </ol>

      {/* Announces step changes and validation failures, which are otherwise silent. */}
      <p className="sr-only" role="status" aria-live="polite">
        {errorCount
          ? `${errorCount} ${errorCount === 1 ? 'answer needs' : 'answers need'} attention on step ${step + 1}, ${stepTitles[step]}.`
          : `Step ${step + 1} of ${stepTitles.length}: ${stepTitles[step]}.`}
      </p>

      {estimate && step === 4 ? (
        <div ref={stepRef} tabIndex={-1}>
          <QuotationResult estimate={estimate} onRestart={restart} />
        </div>
      ) : (
        <form className="quotation-form" onSubmit={submit} noValidate>
          {step === 0 ? (
            <div className="quotation-step" data-reveal ref={stepRef} tabIndex={-1}>
              <div className="quotation-sectors" role="group" aria-label="Quotation category">
                <button
                  type="button"
                  aria-pressed={sector === 'residential'}
                  onClick={() => chooseSector('residential')}
                >
                  <Home aria-hidden="true" size={18} />
                  Residential
                </button>
                <button
                  type="button"
                  aria-pressed={sector === 'commercial'}
                  onClick={() => chooseSector('commercial')}
                >
                  <Building2 aria-hidden="true" size={18} />
                  Commercial
                </button>
              </div>

              <fieldset className="quotation-choices">
                <legend>
                  What kind of {sector === 'commercial' ? 'commercial' : 'residential'} project is
                  this? <b aria-hidden="true">*</b>
                </legend>
                <div className="quotation-choices__grid">
                  {projectTypes.map((option) => (
                    <label key={option.value} className="quotation-choice">
                      <input
                        type="radio"
                        name="projectType"
                        value={option.value}
                        checked={values.projectType === option.value}
                        aria-invalid={errors.projectType ? true : undefined}
                        aria-describedby={describedBy('projectType')}
                        onChange={() => update('projectType', option.value)}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        {option.hint ? <small>{option.hint}</small> : null}
                      </span>
                    </label>
                  ))}
                </div>
                {fieldError('projectType')}
              </fieldset>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="quotation-step" data-reveal ref={stepRef} tabIndex={-1}>
              <div className="form-grid">
                <label className="field field--wide">
                  <span>
                    Project location <b aria-hidden="true">*</b>
                  </span>
                  <input
                    name="location"
                    type="text"
                    value={values.location}
                    placeholder="Barangay, city or municipality"
                    aria-invalid={errors.location ? true : undefined}
                    aria-describedby={describedBy('location')}
                    onChange={(event) => update('location', event.target.value)}
                  />
                  {fieldError('location')}
                </label>

                <label className="field">
                  <span>Nearest service area</span>
                  <select
                    name="serviceArea"
                    value={values.serviceArea}
                    onChange={(event) =>
                      update(
                        'serviceArea',
                        event.target.value as QuotationFormValues['serviceArea'],
                      )
                    }
                  >
                    {serviceAreaOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.place}
                      </option>
                    ))}
                    <option value="other">Another location</option>
                  </select>
                </label>

                <label className="field">
                  <span>
                    Average monthly electricity bill <b aria-hidden="true">*</b>
                  </span>
                  <input
                    name="monthlyBill"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="100"
                    value={values.monthlyBill}
                    placeholder="e.g. 8000"
                    aria-invalid={errors.monthlyBill ? true : undefined}
                    aria-describedby={describedBy('monthlyBill', `${fieldId}-bill-hint`)}
                    onChange={(event) => update('monthlyBill', event.target.value)}
                  />
                  <small id={`${fieldId}-bill-hint`}>
                    Used to size the system when no capacity is stated.
                  </small>
                  {fieldError('monthlyBill')}
                </label>

                <label className="field">
                  <span>
                    Approximate floor area (m²){' '}
                    {sector === 'commercial' ? <b aria-hidden="true">*</b> : null}
                  </span>
                  <input
                    name="floorArea"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={values.floorArea}
                    placeholder="e.g. 180"
                    aria-invalid={errors.floorArea ? true : undefined}
                    aria-describedby={describedBy('floorArea')}
                    onChange={(event) => update('floorArea', event.target.value)}
                  />
                  {fieldError('floorArea')}
                </label>

                <label className="field">
                  <span>Number of floors</span>
                  <input
                    name="floors"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="80"
                    step="1"
                    value={values.floors}
                    onChange={(event) => update('floors', event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Electrical service</span>
                  <select
                    name="electricalService"
                    value={values.electricalService}
                    onChange={(event) =>
                      update(
                        'electricalService',
                        event.target.value as QuotationFormValues['electricalService'],
                      )
                    }
                  >
                    {electricalServiceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {sector === 'commercial' ? (
                  <>
                    <label className="field">
                      <span>Estimated connected load (kW)</span>
                      <input
                        name="estimatedLoadKw"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="1"
                        value={values.estimatedLoadKw}
                        placeholder="e.g. 45"
                        onChange={(event) => update('estimatedLoadKw', event.target.value)}
                      />
                    </label>

                    <label className="field">
                      <span>Existing electrical system</span>
                      <select
                        name="existingSystem"
                        value={values.existingSystem}
                        onChange={(event) =>
                          update(
                            'existingSystem',
                            event.target.value as QuotationFormValues['existingSystem'],
                          )
                        }
                      >
                        {existingSystemOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>Project complexity</span>
                      <select
                        name="complexity"
                        value={values.complexity}
                        onChange={(event) =>
                          update(
                            'complexity',
                            event.target.value as QuotationFormValues['complexity'],
                          )
                        }
                      >
                        {complexityOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="quotation-step" data-reveal ref={stepRef} tabIndex={-1}>
              <fieldset className="quotation-choices">
                <legend>What should the estimate cover?</legend>
                <div className="quotation-toggles">
                  <label className="quotation-toggle">
                    <input
                      type="checkbox"
                      name="pvRequired"
                      checked={values.pvRequired}
                      aria-invalid={errors.pvRequired ? true : undefined}
                      aria-describedby={describedBy('pvRequired')}
                      onChange={(event) => update('pvRequired', event.target.checked)}
                    />
                    <span>
                      <strong>Solar photovoltaic system</strong>
                      <small>Panels, inverter, mounting and protection.</small>
                    </span>
                  </label>
                  <label className="quotation-toggle">
                    <input
                      type="checkbox"
                      name="batteryRequired"
                      checked={values.batteryRequired}
                      onChange={(event) => update('batteryRequired', event.target.checked)}
                    />
                    <span>
                      <strong>Battery energy storage</strong>
                      <small>Stores production for evening or outage use.</small>
                    </span>
                  </label>
                  <label className="quotation-toggle">
                    <input
                      type="checkbox"
                      name="backupRequired"
                      checked={values.backupRequired}
                      onChange={(event) => update('backupRequired', event.target.checked)}
                    />
                    <span>
                      <strong>Backup changeover provision</strong>
                      <small>Automatic transfer for essential circuits.</small>
                    </span>
                  </label>
                </div>
                {fieldError('pvRequired')}
              </fieldset>

              <div className="form-grid">
                {values.pvRequired ? (
                  <>
                    <label className="field">
                      <span>Preferred system type</span>
                      <select
                        name="systemType"
                        value={values.systemType}
                        onChange={(event) =>
                          update(
                            'systemType',
                            event.target.value as QuotationFormValues['systemType'],
                          )
                        }
                      >
                        {systemTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>Preferred PV capacity (kWp)</span>
                      <input
                        name="pvCapacityKwp"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.1"
                        value={values.pvCapacityKwp}
                        placeholder="Leave blank to let us size it"
                        aria-invalid={errors.pvCapacityKwp ? true : undefined}
                        aria-describedby={describedBy('pvCapacityKwp')}
                        onChange={(event) => update('pvCapacityKwp', event.target.value)}
                      />
                      {fieldError('pvCapacityKwp')}
                    </label>
                  </>
                ) : null}

                {values.batteryRequired ? (
                  <label className="field">
                    <span>Preferred battery capacity (kWh)</span>
                    <input
                      name="batteryKwh"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.1"
                      value={values.batteryKwh}
                      placeholder="Leave blank to let us size it"
                      aria-invalid={errors.batteryKwh ? true : undefined}
                      aria-describedby={describedBy('batteryKwh')}
                      onChange={(event) => update('batteryKwh', event.target.value)}
                    />
                    {fieldError('batteryKwh')}
                  </label>
                ) : null}

                <label className="field field--wide">
                  <span>Additional requirements</span>
                  <textarea
                    name="additionalRequirements"
                    rows={3}
                    value={values.additionalRequirements}
                    placeholder="Anything else we should account for."
                    onChange={(event) => update('additionalRequirements', event.target.value)}
                  />
                </label>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="quotation-step" data-reveal ref={stepRef} tabIndex={-1}>
              <div className="form-grid">
                <label className="field">
                  <span>
                    Client name <b aria-hidden="true">*</b>
                  </span>
                  <input
                    name="clientName"
                    type="text"
                    autoComplete="name"
                    value={values.clientName}
                    aria-invalid={errors.clientName ? true : undefined}
                    aria-describedby={describedBy('clientName')}
                    onChange={(event) => update('clientName', event.target.value)}
                  />
                  {fieldError('clientName')}
                </label>

                <label className="field">
                  <span>
                    Contact number or email <b aria-hidden="true">*</b>
                  </span>
                  <input
                    name="clientContact"
                    type="text"
                    autoComplete="tel"
                    value={values.clientContact}
                    aria-invalid={errors.clientContact ? true : undefined}
                    aria-describedby={describedBy('clientContact')}
                    onChange={(event) => update('clientContact', event.target.value)}
                  />
                  {fieldError('clientContact')}
                </label>

                <label className="field">
                  <span>Email address</span>
                  <input
                    name="clientEmail"
                    type="email"
                    autoComplete="email"
                    value={values.clientEmail}
                    onChange={(event) => update('clientEmail', event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Project name</span>
                  <input
                    name="projectName"
                    type="text"
                    value={values.projectName}
                    placeholder="Optional reference for your records"
                    onChange={(event) => update('projectName', event.target.value)}
                  />
                </label>
              </div>

              {!isConfigured ? (
                <p className="form-status form-status--error" role="alert">
                  The estimate service is not connected yet. Please call us and we will prepare the
                  quotation manually.
                </p>
              ) : null}

              {submitError ? (
                <p className="form-status form-status--error" role="alert">
                  {submitError}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="quotation-actions">
            {step > 0 ? (
              <button className="button button--ghost-ink" type="button" onClick={goBack}>
                <ArrowLeft aria-hidden="true" size={18} />
                Back
              </button>
            ) : (
              <span />
            )}
            <button
              className="button button--solar"
              type="submit"
              disabled={isSubmitting || (step === 3 && !isConfigured)}
            >
              {isSubmitting ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" size={18} />
              ) : step === 3 ? (
                <Calculator aria-hidden="true" size={18} />
              ) : (
                <ArrowRight aria-hidden="true" size={18} />
              )}
              {isSubmitting ? 'Preparing estimate…' : step === 3 ? 'Generate estimate' : 'Continue'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
