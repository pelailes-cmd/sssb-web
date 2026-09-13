/**
 * Shopping cart and order submission.
 *
 * The company has no online payment provider, so nothing is charged here. An order is a detailed
 * enquiry: it collects what the customer wants, where it should go and how they intend to pay,
 * emails it to the sales inbox through the same Apps Script web app the estimate form uses, and
 * tells the customer sales will be in touch to take payment.
 *
 * Totals are computed here and shown to the customer, but they are not an invoice. The prices come
 * from the published catalogue, which anybody can read, so there is nothing to protect by moving
 * the arithmetic server-side — and the script recomputes the total from the lines it receives
 * rather than trusting the one the browser sends.
 */

// Types only. siteData builds asset URLs from `import.meta.env` as it loads, which does not exist
// outside Vite, so importing a value from it would put this module out of the test suite's reach.
import type { Product, ServiceAreaCode } from '../data/siteData';

/** How many units a branch can supply, treating an unreported count as none available. */
export const stockAt = (product: Pick<Product, 'stock'>, area: ServiceAreaCode) =>
  Math.max(0, Math.trunc(product.stock?.[area] ?? 0));

/** A product can only be ordered once somebody has priced it. */
export const isOrderable = (product: Pick<Product, 'price'>) =>
  typeof product.price === 'number' && Number.isFinite(product.price) && product.price > 0;

/** One product, at one branch, in the cart. The branch is part of the identity: the same product
 *  collected from Pili and from Lipa City are two different lines. */
export type CartLine = {
  productId: string;
  name: string;
  category: string;
  branch: ServiceAreaCode;
  unitPrice: number;
  quantity: number;
};

/** Above this a single line stops being a website order and becomes a conversation. */
export const MAX_LINE_QUANTITY = 99;
/** Keeps a cart that somebody has been filling for months from becoming unmailable. */
export const MAX_CART_LINES = 30;

export const paymentMethods = [
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Credit / Debit Card' },
] as const;

export type PaymentMethod = (typeof paymentMethods)[number]['value'];

/**
 * What survives between visits.
 *
 * Names and prices are deliberately not stored. They are read from the published catalogue every
 * time the cart is shown, so a cart left open for a month cannot carry a stale price into an
 * order — nor a price someone edited in their own browser storage.
 */
export type StoredLine = {
  productId: string;
  branch: ServiceAreaCode;
  quantity: number;
};

export const lineKey = (productId: string, branch: ServiceAreaCode) => `${productId}@${branch}`;

/**
 * Reads back what was persisted, discarding anything that is not a line this code could produce.
 *
 * The branch list is passed in rather than imported so this module keeps to types only; the caller
 * has the real one to hand.
 */
export function parseStoredLines(value: unknown, branches: readonly string[]): StoredLine[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const lines: StoredLine[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Record<string, unknown>;
    const productId = typeof raw.productId === 'string' ? raw.productId : '';
    const branch = raw.branch as ServiceAreaCode;
    const quantity = typeof raw.quantity === 'number' ? Math.trunc(raw.quantity) : 0;

    if (!productId || !branches.includes(branch)) continue;
    if (quantity < 1 || quantity > MAX_LINE_QUANTITY) continue;

    const key = lineKey(productId, branch);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({ productId, branch, quantity });
    if (lines.length >= MAX_CART_LINES) break;
  }

  return lines;
}

/**
 * Joins the stored lines to the live catalogue.
 *
 * A line whose product has been withdrawn, or has had its price removed, is dropped rather than
 * shown at a guess: the customer should never be quoted a number the catalogue no longer carries.
 */
export function resolveLines(stored: StoredLine[], products: Product[]): CartLine[] {
  const byId = new Map(products.map((product) => [product.id, product]));

  return stored.flatMap((line) => {
    const product = byId.get(line.productId);
    if (!product || !isOrderable(product)) return [];
    return [
      {
        productId: product.id,
        name: product.name,
        category: product.category,
        branch: line.branch,
        unitPrice: product.price as number,
        quantity: line.quantity,
      },
    ];
  });
}

export const formatPeso = (value: number) => `₱${Math.round(value).toLocaleString('en-PH')}`;

export const cartCount = (lines: CartLine[]) =>
  lines.reduce((total, line) => total + line.quantity, 0);

export const cartSubtotal = (lines: CartLine[]) =>
  lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0);

/** Clamped rather than rejected: a stepper that refuses to move is worse than one that stops. */
export const clampQuantity = (quantity: number, available: number) => {
  const ceiling = Math.min(MAX_LINE_QUANTITY, available > 0 ? available : MAX_LINE_QUANTITY);
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(ceiling, Math.max(1, Math.trunc(quantity)));
};

export type OrderValues = {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  landmark: string;
  paymentMethod: PaymentMethod | '';
  voucher: string;
};

export type OrderErrors = Partial<Record<keyof OrderValues, string>>;

export const emptyOrder: OrderValues = {
  fullName: '',
  email: '',
  phone: '',
  address: '',
  landmark: '',
  paymentMethod: '',
  voucher: '',
};

/** Deliberately permissive: enough to catch a typo, not enough to reject a valid address. */
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Philippine mobile and landline numbers, allowing spaces, dashes and a country code. */
const phonePattern = /^\+?[\d\s()-]{7,20}$/;

/**
 * Every field is required except the voucher, which most people will not have.
 *
 * The client's list was address, landmark, payment method and voucher. A name, an email and a
 * phone number are here as well because the whole promise of this flow is that sales will make
 * contact — an order nobody can reply to cannot be fulfilled.
 */
export function validateOrder(values: OrderValues): OrderErrors {
  const errors: OrderErrors = {};

  if (values.fullName.trim().length < 2) {
    errors.fullName = 'Enter your full name.';
  }
  if (!emailPattern.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }
  if (!phonePattern.test(values.phone.trim())) {
    errors.phone = 'Enter a contact number we can reach you on.';
  }
  if (values.address.trim().length < 10) {
    errors.address = 'Enter the complete delivery address.';
  }
  if (values.landmark.trim().length < 3) {
    errors.landmark = 'Give us a nearby landmark.';
  }
  if (!values.paymentMethod) {
    errors.paymentMethod = 'Choose how you would like to pay.';
  }
  // A voucher is optional, but a mistyped one should be caught before it reaches sales.
  if (values.voucher.trim() && !/^[A-Za-z0-9-]{3,24}$/.test(values.voucher.trim())) {
    errors.voucher = 'Voucher codes are 3 to 24 letters, numbers or dashes.';
  }

  return errors;
}

export type OrderContext = {
  /** Must stay empty; a filled honeypot means a bot completed the form. */
  honeypot: string;
  /** Milliseconds the visitor spent on the form, used to reject instant submissions. */
  elapsedMs: number;
};

export type OrderReceipt = {
  reference: string;
  itemCount: number;
  total: number;
};

function parseReceipt(value: unknown): OrderReceipt | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const reference = typeof raw.reference === 'string' ? raw.reference.trim() : '';
  const itemCount = typeof raw.itemCount === 'number' ? raw.itemCount : Number.NaN;
  const total = typeof raw.total === 'number' ? raw.total : Number.NaN;
  if (!reference || !Number.isFinite(itemCount) || !Number.isFinite(total)) return null;
  return { reference, itemCount, total };
}

/**
 * The endpoint is passed in rather than read from the environment here, so this module stays free
 * of Vite-only globals and its rules can be exercised directly by the test suite.
 */
export async function submitOrder(
  endpoint: string,
  lines: CartLine[],
  values: OrderValues,
  context: OrderContext,
): Promise<OrderReceipt | null> {
  if (!endpoint) {
    throw new Error('Ordering is not connected yet. Please call us and we will take your order.');
  }
  if (!lines.length) {
    throw new Error('Your cart is empty.');
  }

  const payload = {
    type: 'order',
    fullName: values.fullName.trim(),
    email: values.email.trim(),
    phone: values.phone.trim(),
    address: values.address.trim(),
    landmark: values.landmark.trim(),
    paymentMethod: values.paymentMethod,
    voucher: values.voucher.trim(),
    lines: lines.map((line) => ({
      productId: line.productId,
      name: line.name,
      category: line.category,
      branch: line.branch,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
    })),
    submittedAt: new Date().toISOString(),
    website: context.honeypot,
    elapsedMs: context.elapsedMs,
  };

  let response: Response;
  try {
    response = await fetch(endpoint, {
      // text/plain keeps this a simple request. Apps Script web apps do not answer the CORS
      // preflight that application/json would trigger, so the request would never be sent.
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
  } catch {
    throw new Error('Your order could not be sent. Please check your connection and try again.');
  }

  if (!response.ok) {
    throw new Error('Your order could not be sent. Please try again, or call us directly.');
  }

  const body = await response.text();
  let result: { ok?: boolean; error?: string; receipt?: unknown };
  try {
    result = JSON.parse(body) as { ok?: boolean; error?: string; receipt?: unknown };
  } catch {
    throw new Error('Your order could not be confirmed. Please call us so we do not miss it.');
  }

  if (!result.ok) {
    throw new Error(result.error ?? 'Your order was not accepted. Please try again.');
  }

  return parseReceipt(result.receipt);
}
