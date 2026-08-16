import { Calculator, LoaderCircle, Pencil, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  deleteQuoteCategory,
  fetchQuoteCategories,
  fetchQuoteSettings,
  saveQuoteCategory,
  saveQuoteSettings,
} from '../../cms/quotationRepository';
import {
  quoteCategoryBases,
  quoteCategoryBasisLabels,
  quoteCategoryConditionLabels,
  quoteCategoryConditions,
  quoteCategorySectorLabels,
  type QuoteCategory,
  type QuoteCategoryBasis,
  type QuoteCategoryCondition,
  type QuoteCategorySector,
  type QuoteSettings,
} from '../../cms/quotationTypes';

/**
 * Administrator-only pricing console.
 *
 * Every value edited here lives in tables that grant nothing to `anon`, so the rates and fee
 * percentages below are never readable by a website visitor. The public calculator receives only
 * the finished amounts that the Edge Function computes from them.
 */

const listToText = (items: string[]) => items.join('\n');
const textToList = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const numberText = (value: number) => String(value ?? 0);

const toNumber = (value: string, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const optionalNumber = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

type SettingsDraft = {
  currencySymbol: string;
  quotationPrefix: string;
  validityDays: string;
  roundingStep: string;
  minimumTotal: string;
  residentialMultiplier: string;
  commercialMultiplier: string;
  complexityStandard: string;
  complexityModerate: string;
  complexityComplex: string;
  areaPili: string;
  areaLipa: string;
  areaOther: string;
  tariffPerKwh: string;
  peakSunHours: string;
  performanceRatio: string;
  offsetTarget: string;
  batteryDayFraction: string;
  clientNotes: string;
  disclaimer: string;
};

function toSettingsDraft(settings: QuoteSettings): SettingsDraft {
  return {
    currencySymbol: settings.currencySymbol,
    quotationPrefix: settings.quotationPrefix,
    validityDays: numberText(settings.validityDays),
    roundingStep: numberText(settings.roundingStep),
    minimumTotal: numberText(settings.minimumTotal),
    residentialMultiplier: numberText(settings.residentialMultiplier),
    commercialMultiplier: numberText(settings.commercialMultiplier),
    complexityStandard: numberText(settings.complexityMultipliers.standard ?? 1),
    complexityModerate: numberText(settings.complexityMultipliers.moderate ?? 1.15),
    complexityComplex: numberText(settings.complexityMultipliers.complex ?? 1.35),
    areaPili: numberText(settings.locationMultipliers.pili ?? 1),
    areaLipa: numberText(settings.locationMultipliers.lipa ?? 1.05),
    areaOther: numberText(settings.locationMultipliers.other ?? 1.12),
    tariffPerKwh: numberText(settings.sizingAssumptions.tariff_per_kwh ?? 12),
    peakSunHours: numberText(settings.sizingAssumptions.peak_sun_hours ?? 4.5),
    performanceRatio: numberText(settings.sizingAssumptions.performance_ratio ?? 0.8),
    offsetTarget: numberText(settings.sizingAssumptions.offset_target ?? 0.7),
    batteryDayFraction: numberText(settings.sizingAssumptions.battery_day_fraction ?? 0.35),
    clientNotes: listToText(settings.clientNotes),
    disclaimer: settings.disclaimer,
  };
}

function fromSettingsDraft(draft: SettingsDraft, base: QuoteSettings): QuoteSettings {
  return {
    ...base,
    currencySymbol: draft.currencySymbol.trim() || '₱',
    quotationPrefix: draft.quotationPrefix.trim().toUpperCase() || 'SSS',
    validityDays: Math.round(toNumber(draft.validityDays, 30)),
    roundingStep: Math.round(toNumber(draft.roundingStep, 100)),
    minimumTotal: toNumber(draft.minimumTotal),
    residentialMultiplier: toNumber(draft.residentialMultiplier, 1),
    commercialMultiplier: toNumber(draft.commercialMultiplier, 1),
    complexityMultipliers: {
      standard: toNumber(draft.complexityStandard, 1),
      moderate: toNumber(draft.complexityModerate, 1.15),
      complex: toNumber(draft.complexityComplex, 1.35),
    },
    locationMultipliers: {
      pili: toNumber(draft.areaPili, 1),
      lipa: toNumber(draft.areaLipa, 1.05),
      other: toNumber(draft.areaOther, 1.12),
    },
    sizingAssumptions: {
      tariff_per_kwh: toNumber(draft.tariffPerKwh, 12),
      peak_sun_hours: toNumber(draft.peakSunHours, 4.5),
      performance_ratio: toNumber(draft.performanceRatio, 0.8),
      offset_target: toNumber(draft.offsetTarget, 0.7),
      battery_day_fraction: toNumber(draft.batteryDayFraction, 0.35),
    },
    clientNotes: textToList(draft.clientNotes),
    disclaimer: draft.disclaimer.trim(),
  };
}

type CategoryDraft = {
  id: string;
  key: string;
  label: string;
  sector: QuoteCategorySector;
  basis: QuoteCategoryBasis;
  rate: string;
  minAmount: string;
  maxAmount: string;
  appliesWhen: QuoteCategoryCondition;
  position: string;
  isActive: boolean;
};

const emptyCategoryDraft = (position: number): CategoryDraft => ({
  id: '',
  key: '',
  label: '',
  sector: 'both',
  basis: 'fixed',
  rate: '0',
  minAmount: '',
  maxAmount: '',
  appliesWhen: 'always',
  position: String(position),
  isActive: true,
});

const toCategoryDraft = (category: QuoteCategory): CategoryDraft => ({
  id: category.id,
  key: category.key,
  label: category.label,
  sector: category.sector,
  basis: category.basis,
  rate: numberText(category.rate),
  minAmount: category.minAmount === null ? '' : numberText(category.minAmount),
  maxAmount: category.maxAmount === null ? '' : numberText(category.maxAmount),
  appliesWhen: category.appliesWhen,
  position: numberText(category.position),
  isActive: category.isActive,
});

function Field({
  label,
  hint,
  children,
  full = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`admin-field${full ? ' admin-field--full' : ''}`}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function QuotationPricingPanel() {
  const [settings, setSettings] = useState<QuoteSettings | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [categories, setCategories] = useState<QuoteCategory[]>([]);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [loadedSettings, loadedCategories] = await Promise.all([
        fetchQuoteSettings(),
        fetchQuoteCategories(),
      ]);
      setSettings(loadedSettings);
      setDraft(toSettingsDraft(loadedSettings));
      setCategories(loadedCategories);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'The pricing configuration could not be loaded.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const request = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(request);
  }, [load]);

  const updateDraft = <K extends keyof SettingsDraft>(field: K, value: SettingsDraft[K]) => {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  };

  const updateCategory = <K extends keyof CategoryDraft>(field: K, value: CategoryDraft[K]) => {
    setCategoryDraft((current) => (current ? { ...current, [field]: value } : current));
  };

  const submitSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || !settings) return;
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await saveQuoteSettings(fromSettingsDraft(draft, settings));
      setSettings(saved);
      setDraft(toSettingsDraft(saved));
      setNotice('Pricing settings updated successfully.');
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'The pricing settings were not saved.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const submitCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!categoryDraft) return;

    if (!/^[a-z][a-z0-9_]{1,48}$/.test(categoryDraft.key)) {
      setError('Use a lowercase key with letters, numbers and underscores, such as pv_modules.');
      return;
    }
    if (categoryDraft.label.trim().length < 2) {
      setError('Enter the label that clients will see on the quotation.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveQuoteCategory({
        id: categoryDraft.id,
        key: categoryDraft.key.trim(),
        label: categoryDraft.label.trim(),
        sector: categoryDraft.sector,
        basis: categoryDraft.basis,
        rate: toNumber(categoryDraft.rate),
        minAmount: optionalNumber(categoryDraft.minAmount),
        maxAmount: optionalNumber(categoryDraft.maxAmount),
        appliesWhen: categoryDraft.appliesWhen,
        position: Math.round(toNumber(categoryDraft.position)),
        isActive: categoryDraft.isActive,
      });
      setCategoryDraft(null);
      setCategories(await fetchQuoteCategories());
      setNotice('Quotation category saved successfully.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The category was not saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const removeCategory = async (category: QuoteCategory) => {
    const confirmed = window.confirm(
      `Remove “${category.label}”? Future estimates will no longer include this line item.`,
    );
    if (!confirmed) return;

    setIsSaving(true);
    setError(null);
    try {
      await deleteQuoteCategory(category.id);
      setCategories(await fetchQuoteCategories());
      setNotice('Quotation category removed successfully.');
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'The category was not removed.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const nextPosition = categories.length
    ? Math.max(...categories.map((category) => category.position)) + 10
    : 10;

  return (
    <section className="admin-pricing-panel" aria-labelledby="admin-pricing-title">
      <div className="admin-team-intro">
        <span>
          <Calculator aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">Administrator controls</p>
          <h3 id="admin-pricing-title">Quotation pricing</h3>
          <p>
            These rates never reach the website. Visitors receive only the category labels and the
            calculated amounts, and every figure is applied on the server when an estimate is
            requested.
          </p>
        </div>
      </div>

      {error ? (
        <div className="admin-notice admin-notice--error" role="alert">
          <strong>Pricing needs attention</strong>
          <p>{error}</p>
        </div>
      ) : null}
      {notice ? (
        <div className="admin-notice" role="status">
          <strong>Pricing updated</strong>
          <p>{notice}</p>
        </div>
      ) : null}

      {isLoading || !draft ? (
        <div className="admin-loading" role="status">
          <LoaderCircle className="is-spinning" aria-hidden="true" />
          Loading pricing configuration…
        </div>
      ) : (
        <>
          <form className="admin-pricing-form" onSubmit={submitSettings} noValidate>
            <div className="admin-pricing-form__head">
              <h4>Global settings</h4>
              <button type="button" disabled={isLoading} onClick={() => void load()}>
                <RefreshCw className={isLoading ? 'is-spinning' : ''} aria-hidden="true" />
                Refresh
              </button>
            </div>

            <div className="admin-editor__fields">
              <Field label="Currency symbol">
                <input
                  value={draft.currencySymbol}
                  maxLength={4}
                  onChange={(event) => updateDraft('currencySymbol', event.target.value)}
                />
              </Field>
              <Field label="Quotation prefix" hint="Reference numbers read PREFIX-YEAR-0001.">
                <input
                  value={draft.quotationPrefix}
                  maxLength={8}
                  onChange={(event) => updateDraft('quotationPrefix', event.target.value)}
                />
              </Field>
              <Field label="Validity (days)">
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={draft.validityDays}
                  onChange={(event) => updateDraft('validityDays', event.target.value)}
                />
              </Field>
              <Field label="Rounding step" hint="Each line is rounded to this multiple.">
                <input
                  type="number"
                  min="1"
                  value={draft.roundingStep}
                  onChange={(event) => updateDraft('roundingStep', event.target.value)}
                />
              </Field>
              <Field label="Minimum project total" hint="Use 0 to disable the minimum.">
                <input
                  type="number"
                  min="0"
                  value={draft.minimumTotal}
                  onChange={(event) => updateDraft('minimumTotal', event.target.value)}
                />
              </Field>
              <Field label="Residential multiplier">
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  value={draft.residentialMultiplier}
                  onChange={(event) => updateDraft('residentialMultiplier', event.target.value)}
                />
              </Field>
              <Field label="Commercial multiplier">
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  value={draft.commercialMultiplier}
                  onChange={(event) => updateDraft('commercialMultiplier', event.target.value)}
                />
              </Field>
            </div>

            <h5>Complexity multipliers</h5>
            <div className="admin-editor__fields">
              <Field label="Standard">
                <input
                  type="number"
                  step="0.01"
                  value={draft.complexityStandard}
                  onChange={(event) => updateDraft('complexityStandard', event.target.value)}
                />
              </Field>
              <Field label="Moderate">
                <input
                  type="number"
                  step="0.01"
                  value={draft.complexityModerate}
                  onChange={(event) => updateDraft('complexityModerate', event.target.value)}
                />
              </Field>
              <Field label="Complex">
                <input
                  type="number"
                  step="0.01"
                  value={draft.complexityComplex}
                  onChange={(event) => updateDraft('complexityComplex', event.target.value)}
                />
              </Field>
            </div>

            <h5>Service-area multipliers</h5>
            <div className="admin-editor__fields">
              <Field label="Pili, Camarines Sur">
                <input
                  type="number"
                  step="0.01"
                  value={draft.areaPili}
                  onChange={(event) => updateDraft('areaPili', event.target.value)}
                />
              </Field>
              <Field label="Lipa City, Batangas">
                <input
                  type="number"
                  step="0.01"
                  value={draft.areaLipa}
                  onChange={(event) => updateDraft('areaLipa', event.target.value)}
                />
              </Field>
              <Field label="Other locations">
                <input
                  type="number"
                  step="0.01"
                  value={draft.areaOther}
                  onChange={(event) => updateDraft('areaOther', event.target.value)}
                />
              </Field>
            </div>

            <h5>System sizing assumptions</h5>
            <div className="admin-editor__fields">
              <Field label="Electricity tariff per kWh">
                <input
                  type="number"
                  step="0.1"
                  value={draft.tariffPerKwh}
                  onChange={(event) => updateDraft('tariffPerKwh', event.target.value)}
                />
              </Field>
              <Field label="Peak sun hours">
                <input
                  type="number"
                  step="0.1"
                  value={draft.peakSunHours}
                  onChange={(event) => updateDraft('peakSunHours', event.target.value)}
                />
              </Field>
              <Field label="Performance ratio">
                <input
                  type="number"
                  step="0.01"
                  value={draft.performanceRatio}
                  onChange={(event) => updateDraft('performanceRatio', event.target.value)}
                />
              </Field>
              <Field label="Bill offset target">
                <input
                  type="number"
                  step="0.05"
                  value={draft.offsetTarget}
                  onChange={(event) => updateDraft('offsetTarget', event.target.value)}
                />
              </Field>
              <Field label="Battery day fraction">
                <input
                  type="number"
                  step="0.05"
                  value={draft.batteryDayFraction}
                  onChange={(event) => updateDraft('batteryDayFraction', event.target.value)}
                />
              </Field>
            </div>

            <h5>Client-facing wording</h5>
            <div className="admin-editor__fields">
              <Field label="Quotation notes" hint="One note per line." full>
                <textarea
                  rows={3}
                  value={draft.clientNotes}
                  onChange={(event) => updateDraft('clientNotes', event.target.value)}
                />
              </Field>
              <Field label="Disclaimer" full>
                <textarea
                  rows={4}
                  value={draft.disclaimer}
                  onChange={(event) => updateDraft('disclaimer', event.target.value)}
                />
              </Field>
            </div>

            <div className="admin-editor__actions">
              <button className="button button--primary" type="submit" disabled={isSaving}>
                {isSaving ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : (
                  <Save aria-hidden="true" />
                )}
                {isSaving ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </form>

          <div className="admin-pricing-categories">
            <div className="admin-pricing-form__head">
              <h4>Quotation categories</h4>
              {categoryDraft ? null : (
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => setCategoryDraft(emptyCategoryDraft(nextPosition))}
                >
                  <Plus aria-hidden="true" />
                  Add category
                </button>
              )}
            </div>

            {categoryDraft ? (
              <form className="admin-pricing-category-form" onSubmit={submitCategory} noValidate>
                <div className="admin-editor__header">
                  <div>
                    <p className="eyebrow">{categoryDraft.id ? 'Edit category' : 'New category'}</p>
                    <h5>{categoryDraft.label || 'Quotation category'}</h5>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Close category editor"
                    onClick={() => setCategoryDraft(null)}
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>

                <div className="admin-editor__fields">
                  <Field label="Key" hint="Internal identifier. Lowercase with underscores.">
                    <input
                      value={categoryDraft.key}
                      disabled={Boolean(categoryDraft.id)}
                      onChange={(event) => updateCategory('key', event.target.value)}
                    />
                  </Field>
                  <Field label="Client-facing label" hint="Shown on the generated quotation.">
                    <input
                      value={categoryDraft.label}
                      onChange={(event) => updateCategory('label', event.target.value)}
                    />
                  </Field>
                  <Field label="Applies to">
                    <select
                      value={categoryDraft.sector}
                      onChange={(event) =>
                        updateCategory('sector', event.target.value as QuoteCategorySector)
                      }
                    >
                      {(['both', 'residential', 'commercial'] as QuoteCategorySector[]).map(
                        (option) => (
                          <option key={option} value={option}>
                            {quoteCategorySectorLabels[option]}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                  <Field label="Formula">
                    <select
                      value={categoryDraft.basis}
                      onChange={(event) =>
                        updateCategory('basis', event.target.value as QuoteCategoryBasis)
                      }
                    >
                      {quoteCategoryBases.map((option) => (
                        <option key={option} value={option}>
                          {quoteCategoryBasisLabels[option]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label={
                      categoryDraft.basis === 'percent_of_subtotal' ? 'Percentage' : 'Rate amount'
                    }
                  >
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={categoryDraft.rate}
                      onChange={(event) => updateCategory('rate', event.target.value)}
                    />
                  </Field>
                  <Field label="Included when">
                    <select
                      value={categoryDraft.appliesWhen}
                      onChange={(event) =>
                        updateCategory('appliesWhen', event.target.value as QuoteCategoryCondition)
                      }
                    >
                      {quoteCategoryConditions.map((option) => (
                        <option key={option} value={option}>
                          {quoteCategoryConditionLabels[option]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Minimum charge" hint="Leave blank for no minimum.">
                    <input
                      type="number"
                      min="0"
                      value={categoryDraft.minAmount}
                      onChange={(event) => updateCategory('minAmount', event.target.value)}
                    />
                  </Field>
                  <Field label="Maximum charge" hint="Leave blank for no cap.">
                    <input
                      type="number"
                      min="0"
                      value={categoryDraft.maxAmount}
                      onChange={(event) => updateCategory('maxAmount', event.target.value)}
                    />
                  </Field>
                  <Field label="Order" hint="Lower numbers appear first.">
                    <input
                      type="number"
                      min="0"
                      value={categoryDraft.position}
                      onChange={(event) => updateCategory('position', event.target.value)}
                    />
                  </Field>
                </div>

                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={categoryDraft.isActive}
                    onChange={(event) => updateCategory('isActive', event.target.checked)}
                  />
                  <span>
                    <strong>Active</strong>
                    <small>Uncheck to exclude this line item from new estimates.</small>
                  </span>
                </label>

                <div className="admin-editor__actions">
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => setCategoryDraft(null)}
                  >
                    Cancel
                  </button>
                  <button className="button button--primary" type="submit" disabled={isSaving}>
                    {isSaving ? (
                      <LoaderCircle className="is-spinning" aria-hidden="true" />
                    ) : (
                      <Save aria-hidden="true" />
                    )}
                    {isSaving ? 'Saving…' : 'Save category'}
                  </button>
                </div>
              </form>
            ) : null}

            <div className="admin-pricing-list">
              {categories.map((category) => (
                <article key={category.id}>
                  <div>
                    <span className={category.isActive ? 'is-published' : 'is-draft'}>
                      {category.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <h5>{category.label}</h5>
                    <p>
                      {quoteCategoryBasisLabels[category.basis]} ·{' '}
                      {quoteCategorySectorLabels[category.sector]} ·{' '}
                      {quoteCategoryConditionLabels[category.appliesWhen]}
                    </p>
                  </div>
                  <strong>
                    {category.basis === 'percent_of_subtotal'
                      ? `${category.rate}%`
                      : category.rate.toLocaleString('en-PH')}
                  </strong>
                  <div className="admin-pricing-list__actions">
                    <button
                      type="button"
                      onClick={() => setCategoryDraft(toCategoryDraft(category))}
                    >
                      <Pencil aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      className="is-danger"
                      type="button"
                      onClick={() => void removeCategory(category)}
                    >
                      <Trash2 aria-hidden="true" />
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
