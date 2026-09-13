import {
  ArrowLeft,
  CheckCircle2,
  LoaderCircle,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useCart } from '../../cms/CartContext';
import { business, serviceAreaOptions } from '../../data/siteData';
import {
  emptyOrder,
  formatPeso,
  paymentMethods,
  submitOrder,
  validateOrder,
  MAX_LINE_QUANTITY,
  type OrderErrors,
  type OrderReceipt,
  type OrderValues,
  type PaymentMethod,
} from '../../lib/cart';

/** The same Apps Script web app the estimate form posts to; orders arrive as a second kind. */
const orderEndpoint = import.meta.env.VITE_QUOTE_INQUIRY_ENDPOINT?.trim() ?? '';
const isConfigured = Boolean(orderEndpoint);

const placeOf = (code: string) =>
  serviceAreaOptions.find((option) => option.code === code)?.place ?? code;

/**
 * The cart, the checkout form and the confirmation, in one dialog.
 *
 * Nothing is charged. The company has no online payment provider yet, so "Order Now" sends the
 * order to the sales inbox and says so plainly — the customer is told to expect a call about
 * payment rather than being left to wonder whether money has moved.
 */
export function CartDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const openedAt = useRef(0);
  const fieldId = useId();
  const { lines, count, subtotal, setQuantity, removeLine, clear, isCartOpen, closeCart } =
    useCart();

  const [view, setView] = useState<'summary' | 'checkout' | 'sent'>('summary');
  const [values, setValues] = useState<OrderValues>(emptyOrder);
  const [errors, setErrors] = useState<OrderErrors>({});
  const [honeypot, setHoneypot] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isCartOpen && !dialog.open) dialog.showModal();
    else if (!isCartOpen && dialog.open) dialog.close();
  }, [isCartOpen]);

  const dismiss = () => {
    closeCart();
    // Reset once it has closed, so the visitor does not watch the panel empty out.
    window.setTimeout(() => {
      setView('summary');
      setValues(emptyOrder);
      setErrors({});
      setHoneypot('');
      setSubmitError(null);
      setReceipt(null);
    }, 200);
  };

  const startCheckout = () => {
    setView('checkout');
    setSubmitError(null);
    openedAt.current = Date.now();
    window.setTimeout(() => firstFieldRef.current?.focus(), 0);
  };

  const update = <K extends keyof OrderValues>(field: K, value: OrderValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const errorId = (field: keyof OrderValues) => `${fieldId}-${field}-error`;

  const fieldError = (field: keyof OrderValues) =>
    errors[field] ? (
      <small className="field-error" id={errorId(field)}>
        {errors[field]}
      </small>
    ) : null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateOrder(values);
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
      setReceipt(
        await submitOrder(orderEndpoint, lines, values, {
          honeypot,
          elapsedMs: Date.now() - openedAt.current,
        }),
      );
      // Emptied only once the order is safely with sales, so a failed send never loses the cart.
      clear();
      setView('sent');
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Your order could not be sent. Please try again.',
      );
    } finally {
      setIsSending(false);
    }
  };

  const heading =
    view === 'checkout' ? 'Where should we deliver?' : view === 'sent' ? 'Order sent' : 'Your cart';

  return (
    <dialog
      ref={dialogRef}
      className="quote-dialog cart-dialog"
      aria-labelledby={`${fieldId}-title`}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClose={dismiss}
    >
      <div className="quote-dialog__head">
        <div>
          <p className="eyebrow">
            {view === 'checkout' ? 'Checkout' : view === 'sent' ? 'Thank you' : 'Shopping cart'}
          </p>
          <h2 id={`${fieldId}-title`}>{heading}</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Close the cart" onClick={dismiss}>
          <X aria-hidden="true" />
        </button>
      </div>

      {view === 'sent' ? (
        <div className="quote-dialog__success" role="status">
          <CheckCircle2 aria-hidden="true" />
          <h3>Your order has been sent.</h3>
          <p>
            Our sales team will contact you shortly to arrange payment and the rest of the
            transaction. Nothing has been charged. For anything urgent, call{' '}
            <a href={business.phoneHref}>{business.phoneDisplay}</a>.
          </p>
          {receipt ? (
            <p className="cart-reference">
              Reference <strong>{receipt.reference}</strong>
            </p>
          ) : null}
          <button className="button button--primary" type="button" onClick={dismiss}>
            Close
          </button>
        </div>
      ) : view === 'checkout' ? (
        <form className="quote-dialog__form" onSubmit={submit} noValidate>
          <p className="quote-dialog__lede">
            {count} {count === 1 ? 'item' : 'items'} · {formatPeso(subtotal)}. We do not take
            payment online yet, so sales will call you to settle it.
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
                Mode of payment <b aria-hidden="true">*</b>
              </span>
              <select
                name="paymentMethod"
                value={values.paymentMethod}
                aria-invalid={errors.paymentMethod ? true : undefined}
                aria-describedby={errors.paymentMethod ? errorId('paymentMethod') : undefined}
                onChange={(event) => update('paymentMethod', event.target.value as PaymentMethod)}
              >
                <option value="">Select a payment method</option>
                {paymentMethods.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
              {fieldError('paymentMethod')}
            </label>

            <label className="field field--wide">
              <span>
                Complete delivery address <b aria-hidden="true">*</b>
              </span>
              <input
                name="address"
                type="text"
                autoComplete="street-address"
                placeholder="House number, street, barangay, city, province"
                value={values.address}
                aria-invalid={errors.address ? true : undefined}
                aria-describedby={errors.address ? errorId('address') : undefined}
                onChange={(event) => update('address', event.target.value)}
              />
              {fieldError('address')}
            </label>

            <label className="field field--wide">
              <span>
                Landmark <b aria-hidden="true">*</b>
              </span>
              <input
                name="landmark"
                type="text"
                placeholder="The nearest thing our driver will recognise"
                value={values.landmark}
                aria-invalid={errors.landmark ? true : undefined}
                aria-describedby={errors.landmark ? errorId('landmark') : undefined}
                onChange={(event) => update('landmark', event.target.value)}
              />
              {fieldError('landmark')}
            </label>

            <label className="field field--wide">
              <span>Voucher code</span>
              <input
                name="voucher"
                type="text"
                autoComplete="off"
                placeholder="Optional"
                value={values.voucher}
                aria-invalid={errors.voucher ? true : undefined}
                aria-describedby={
                  errors.voucher
                    ? `${errorId('voucher')} ${fieldId}-voucher-hint`
                    : `${fieldId}-voucher-hint`
                }
                onChange={(event) => update('voucher', event.target.value)}
              />
              <small id={`${fieldId}-voucher-hint`}>
                Sales will confirm the discount when they call. The total above does not include it
                yet.
              </small>
              {fieldError('voucher')}
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
              Ordering is not connected yet. Please call {business.phoneDisplay} and we will take
              your order.
            </p>
          ) : null}

          {submitError ? (
            <p className="form-status form-status--error" role="alert">
              {submitError}
            </p>
          ) : null}

          <div className="quote-dialog__actions">
            <button
              className="button button--ghost-ink"
              type="button"
              onClick={() => setView('summary')}
            >
              <ArrowLeft aria-hidden="true" size={18} />
              Back to cart
            </button>
            <button
              className="button button--solar"
              type="submit"
              disabled={isSending || !isConfigured}
            >
              {isSending ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" size={18} />
              ) : (
                <ShoppingCart aria-hidden="true" size={18} />
              )}
              {isSending ? 'Sending…' : 'Order Now'}
            </button>
          </div>
        </form>
      ) : lines.length ? (
        <div className="cart-dialog__body">
          <ul className="cart-lines">
            {lines.map((line) => (
              <li key={`${line.productId}@${line.branch}`} className="cart-line">
                <div className="cart-line__copy">
                  <h3>{line.name}</h3>
                  <p>
                    {line.category} · {placeOf(line.branch)}
                  </p>
                  <span>{formatPeso(line.unitPrice)} each</span>
                </div>
                <div className="cart-line__controls">
                  <div className="cart-quantity__control">
                    <button
                      type="button"
                      aria-label={`Reduce quantity of ${line.name}`}
                      onClick={() => setQuantity(line.productId, line.branch, line.quantity - 1)}
                    >
                      <Minus aria-hidden="true" size={16} />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max={MAX_LINE_QUANTITY}
                      aria-label={`Quantity of ${line.name}`}
                      value={line.quantity}
                      onChange={(event) =>
                        setQuantity(line.productId, line.branch, Number(event.target.value))
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Increase quantity of ${line.name}`}
                      onClick={() => setQuantity(line.productId, line.branch, line.quantity + 1)}
                    >
                      <Plus aria-hidden="true" size={16} />
                    </button>
                  </div>
                  <strong>{formatPeso(line.unitPrice * line.quantity)}</strong>
                  <button
                    className="cart-line__remove"
                    type="button"
                    aria-label={`Remove ${line.name}`}
                    onClick={() => removeLine(line.productId, line.branch)}
                  >
                    <Trash2 aria-hidden="true" size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <p className="cart-dialog__total">
            <span>
              Subtotal · {count} {count === 1 ? 'item' : 'items'}
            </span>
            <strong>{formatPeso(subtotal)}</strong>
          </p>
          <p className="cart-dialog__note">
            Delivery, installation and any voucher are settled with sales after you order.
          </p>

          <div className="quote-dialog__actions">
            <button className="button button--ghost-ink" type="button" onClick={dismiss}>
              Keep browsing
            </button>
            <button className="button button--solar" type="button" onClick={startCheckout}>
              Check out
            </button>
          </div>
        </div>
      ) : (
        <div className="cart-dialog__empty" role="status">
          <ShoppingCart aria-hidden="true" />
          <h3>Your cart is empty</h3>
          <p>Add equipment from the Products section and it will gather here.</p>
          <button className="button button--primary" type="button" onClick={dismiss}>
            Browse products
          </button>
        </div>
      )}
    </dialog>
  );
}
