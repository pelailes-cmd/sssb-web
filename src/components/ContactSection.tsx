import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Map,
  MapPin,
  Phone,
  Send,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSiteContent } from '../cms/SiteContentContext';
import { business } from '../data/siteData';
import { SectionHeading } from './SectionHeading';

type FormValues = {
  name: string;
  contact: string;
  location: string;
  service: string;
  monthlyBill: string;
  message: string;
};

type FormErrors = Partial<Record<keyof FormValues, string>>;
type FormStatus = 'idle' | 'error' | 'success';

const initialValues: FormValues = {
  name: '',
  contact: '',
  location: '',
  service: '',
  monthlyBill: '',
  message: '',
};

const additionalInquiryOptions = ['Product inquiry', 'Promotion inquiry'];

function validateForm(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  if (values.name.trim().length < 2) errors.name = 'Enter your name.';

  const contact = values.contact.trim();
  if (!contact) {
    errors.contact = 'Enter a contact number or email.';
  } else if (contact.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
      errors.contact = 'Enter a complete email address.';
    }
  } else if (contact.replace(/\D/g, '').length < 7) {
    errors.contact = 'Enter a complete contact number.';
  }

  if (values.location.trim().length < 2) errors.location = 'Enter your location.';
  if (!values.service) errors.service = 'Select the service or inquiry type you need.';
  if (values.monthlyBill && Number(values.monthlyBill) < 0) {
    errors.monthlyBill = 'Enter a zero or positive amount.';
  }
  if (values.message.trim().length < 20) {
    errors.message = 'Please add at least 20 characters so the request is clear.';
  }
  return errors;
}

export function ContactSection() {
  const { services } = useSiteContent();
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<FormStatus>('idle');

  const updateField = (field: keyof FormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setStatus('idle');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateForm(values);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      setStatus('error');
      const firstInvalidName = Object.keys(nextErrors)[0];
      const firstInvalid = firstInvalidName
        ? event.currentTarget.elements.namedItem(firstInvalidName)
        : null;
      if (firstInvalid instanceof HTMLElement) firstInvalid.focus();
      return;
    }

    // Delivery is intentionally local-only until an approved backend or form service is connected.
    setStatus('success');
  };

  const fieldError = (field: keyof FormValues) =>
    errors[field] ? (
      <span id={`${field}-error`} className="field-error">
        {errors[field]}
      </span>
    ) : null;

  return (
    <section id="contact" className="section contact-section">
      <div className="container">
        <SectionHeading
          eyebrow="Contact Us"
          title="Start with a clear solar conversation"
          description="Use the verified contact details below or prepare an inquiry with the form. The form currently validates locally and does not transmit data."
          align="center"
        />

        <div className="contact-layout">
          <div className="contact-details" data-reveal>
            <div className="contact-details__intro">
              <p className="eyebrow">Verified from supplied artwork</p>
              <h3>Smart Save Solar Bicol</h3>
              <p>
                For the fastest confirmed contact path, call the number printed consistently across
                the supplied cover, product, and promotion materials.
              </p>
            </div>

            <a className="contact-card contact-card--phone" href={business.phoneHref}>
              <span>
                <Phone aria-hidden="true" />
              </span>
              <div>
                <small>Call Smart Save Solar Bicol</small>
                <strong>{business.phoneDisplay}</strong>
              </div>
              <ArrowRight aria-hidden="true" />
            </a>

            <div className="contact-card">
              <span>
                <MapPin aria-hidden="true" />
              </span>
              <div>
                <small>Verified location</small>
                <strong>{business.address}</strong>
              </div>
            </div>

            <a className="map-action" href={business.mapHref} target="_blank" rel="noreferrer">
              <Map aria-hidden="true" size={18} />
              Search this verified address on Google Maps
              <ArrowRight aria-hidden="true" size={17} />
            </a>

            <div className="contact-details__availability">
              <Clock3 aria-hidden="true" />
              <p>
                <strong>Office hours were not supplied.</strong>
                Call to confirm current availability before visiting.
              </p>
            </div>
          </div>

          <form className="inquiry-form" noValidate onSubmit={handleSubmit} data-reveal>
            <div className="inquiry-form__heading">
              <span>Solar inquiry</span>
              <strong>Tell us what you need</strong>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>
                  Name <b aria-hidden="true">*</b>
                </span>
                <input
                  name="name"
                  autoComplete="name"
                  value={values.name}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? 'name-error' : undefined}
                  onChange={(event) => updateField('name', event.target.value)}
                />
                {fieldError('name')}
              </label>

              <label className="field">
                <span>
                  Contact number or email <b aria-hidden="true">*</b>
                </span>
                <input
                  name="contact"
                  autoComplete="tel"
                  inputMode="text"
                  value={values.contact}
                  aria-invalid={Boolean(errors.contact)}
                  aria-describedby={errors.contact ? 'contact-error' : 'contact-hint'}
                  onChange={(event) => updateField('contact', event.target.value)}
                />
                <small id="contact-hint">Use the best way to reach you about this inquiry.</small>
                {fieldError('contact')}
              </label>

              <label className="field">
                <span>
                  Location <b aria-hidden="true">*</b>
                </span>
                <input
                  name="location"
                  autoComplete="address-level2"
                  value={values.location}
                  aria-invalid={Boolean(errors.location)}
                  aria-describedby={errors.location ? 'location-error' : undefined}
                  onChange={(event) => updateField('location', event.target.value)}
                />
                {fieldError('location')}
              </label>

              <label className="field">
                <span>
                  Service needed <b aria-hidden="true">*</b>
                </span>
                <select
                  name="service"
                  value={values.service}
                  aria-invalid={Boolean(errors.service)}
                  aria-describedby={errors.service ? 'service-error' : undefined}
                  onChange={(event) => updateField('service', event.target.value)}
                >
                  <option value="">Select an inquiry type</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.title}>
                      {service.title}
                    </option>
                  ))}
                  {additionalInquiryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {fieldError('service')}
              </label>

              <label className="field field--wide">
                <span>Estimated monthly electric bill</span>
                <input
                  type="number"
                  name="monthlyBill"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={values.monthlyBill}
                  aria-invalid={Boolean(errors.monthlyBill)}
                  aria-describedby={errors.monthlyBill ? 'monthlyBill-error' : 'bill-hint'}
                  onChange={(event) => updateField('monthlyBill', event.target.value)}
                />
                <small id="bill-hint">Use the approximate amount shown on a recent bill.</small>
                {fieldError('monthlyBill')}
              </label>

              <label className="field field--wide">
                <span>
                  Message <b aria-hidden="true">*</b>
                </span>
                <textarea
                  name="message"
                  rows={5}
                  value={values.message}
                  aria-invalid={Boolean(errors.message)}
                  aria-describedby={errors.message ? 'message-error' : 'message-hint'}
                  onChange={(event) => updateField('message', event.target.value)}
                />
                <small id="message-hint">
                  Include the equipment, support concern, or solar requirement you want to discuss.
                </small>
                {fieldError('message')}
              </label>
            </div>

            {status === 'error' ? (
              <div className="form-status form-status--error" role="alert">
                <CircleAlert aria-hidden="true" />
                <span>Please correct the highlighted fields before continuing.</span>
              </div>
            ) : null}
            {status === 'success' ? (
              <div className="form-status form-status--success" role="status">
                <CheckCircle2 aria-hidden="true" />
                <span>
                  Your inquiry details are ready. No message was transmitted; call{' '}
                  <a href={business.phoneHref}>{business.phoneDisplay}</a> to submit it now.
                </span>
              </div>
            ) : null}

            <div className="inquiry-form__footer">
              <p>
                Demo/local form only. A delivery endpoint must be connected before production
                submissions can be sent.
              </p>
              <button className="button button--solar" type="submit">
                <Send aria-hidden="true" size={18} />
                Review inquiry
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
