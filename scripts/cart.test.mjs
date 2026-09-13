/**
 * Covers the shopping cart and the order it produces.
 *
 * Nothing here is charged, so the arithmetic is not an invoice — but it is what a customer decides
 * on and what sales quotes back, so it is exercised against the real module. The cart persists to
 * browser storage, which anybody can edit, so the parsing and re-pricing rules matter as much as
 * the sums.
 *
 * Requires Node's TypeScript type stripping (`--experimental-strip-types`, see package.json).
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  cartCount,
  cartSubtotal,
  clampQuantity,
  emptyOrder,
  formatPeso,
  isOrderable,
  lineKey,
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
  parseStoredLines,
  paymentMethods,
  resolveLines,
  stockAt,
  submitOrder,
  validateOrder,
} from '../src/lib/cart.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const branches = ['pili', 'lipa'];

const catalogue = [
  { id: 'panel', name: '620W Panel', category: 'Solar Panels', price: 12000, stock: { pili: 4 } },
  {
    id: 'inverter',
    name: '8kW Inverter',
    category: 'Inverters',
    price: 55000,
    stock: { pili: 2, lipa: 7 },
  },
  // Listed but never priced: it appears in the catalogue and cannot be ordered.
  { id: 'mounting', name: 'Mounting Rails', category: 'Balance of System' },
];

const validOrder = {
  fullName: 'Juan dela Cruz',
  email: 'juan@example.com',
  phone: '0997-688-4865',
  address: '12 Rizal Street, Barangay San Jose, Pili',
  landmark: 'Beside the covered court',
  paymentMethod: 'gcash',
  voucher: '',
};

test('a product has to be priced before it can be ordered', () => {
  assert.equal(isOrderable({ price: 12000 }), true);
  assert.equal(isOrderable({ price: 0 }), false);
  assert.equal(isOrderable({}), false);
  assert.equal(isOrderable({ price: Number.NaN }), false);

  // An unreported count is not the same as a promise of stock.
  assert.equal(stockAt({ stock: { pili: 4 } }, 'pili'), 4);
  assert.equal(stockAt({ stock: { pili: 4 } }, 'lipa'), 0);
  assert.equal(stockAt({}, 'pili'), 0);
  assert.equal(stockAt({ stock: { pili: -3 } }, 'pili'), 0);
});

test('stored lines are read back defensively', () => {
  const parsed = parseStoredLines(
    [
      { productId: 'panel', branch: 'pili', quantity: 2 },
      { productId: 'panel', branch: 'pili', quantity: 9 }, // duplicate key
      { productId: 'panel', branch: 'mars', quantity: 1 }, // unknown branch
      { productId: '', branch: 'pili', quantity: 1 }, // no product
      { productId: 'inverter', branch: 'lipa', quantity: 0 }, // below one
      { productId: 'inverter', branch: 'lipa', quantity: 500 }, // above the ceiling
      'not an object',
    ],
    branches,
  );

  assert.deepEqual(parsed, [{ productId: 'panel', branch: 'pili', quantity: 2 }]);
  assert.deepEqual(parseStoredLines(null, branches), []);
  assert.deepEqual(parseStoredLines({ productId: 'panel' }, branches), []);

  // A cart nobody has emptied for months still has to be mailable.
  const huge = Array.from({ length: MAX_CART_LINES + 12 }, (_, index) => ({
    productId: `p${index}`,
    branch: 'pili',
    quantity: 1,
  }));
  assert.equal(parseStoredLines(huge, branches).length, MAX_CART_LINES);
});

test('lines are priced from the catalogue, never from storage', () => {
  const stored = [
    { productId: 'panel', branch: 'pili', quantity: 2 },
    { productId: 'inverter', branch: 'lipa', quantity: 1 },
    { productId: 'mounting', branch: 'pili', quantity: 5 }, // has no price
    { productId: 'withdrawn', branch: 'pili', quantity: 1 }, // no longer sold
  ];

  const lines = resolveLines(stored, catalogue);

  // The unpriced and the withdrawn both fall away rather than being shown at a guess.
  assert.deepEqual(
    lines.map((line) => line.productId),
    ['panel', 'inverter'],
  );
  assert.equal(lines[0].unitPrice, 12000);
  assert.equal(lines[0].name, '620W Panel');
  assert.equal(cartCount(lines), 3);
  assert.equal(cartSubtotal(lines), 2 * 12000 + 55000);

  // A price change in the catalogue reaches a cart that was filled before it.
  const cheaper = catalogue.map((item) => (item.id === 'panel' ? { ...item, price: 9000 } : item));
  assert.equal(cartSubtotal(resolveLines(stored, cheaper)), 2 * 9000 + 55000);
});

test('the same product from two branches is two lines', () => {
  const lines = resolveLines(
    [
      { productId: 'inverter', branch: 'pili', quantity: 1 },
      { productId: 'inverter', branch: 'lipa', quantity: 2 },
    ],
    catalogue,
  );

  assert.equal(lines.length, 2);
  assert.notEqual(lineKey('inverter', 'pili'), lineKey('inverter', 'lipa'));
  assert.equal(cartCount(lines), 3);
});

test('quantity is clamped to what the branch actually holds', () => {
  assert.equal(clampQuantity(3, 4), 3);
  assert.equal(clampQuantity(9, 4), 4, 'cannot order more than the branch has');
  assert.equal(clampQuantity(0, 4), 1);
  assert.equal(clampQuantity(-5, 4), 1);
  assert.equal(clampQuantity(Number.NaN, 4), 1);
  assert.equal(clampQuantity(2.7, 4), 2);
  // With no count reported the ceiling is the per-line maximum rather than zero.
  assert.equal(clampQuantity(1000, 0), MAX_LINE_QUANTITY);
});

test('every checkout field is required except the voucher', () => {
  assert.deepEqual(validateOrder(validOrder), {});

  const errors = validateOrder(emptyOrder);
  assert.deepEqual(Object.keys(errors).sort(), [
    'address',
    'email',
    'fullName',
    'landmark',
    'paymentMethod',
    'phone',
  ]);

  assert.ok(validateOrder({ ...validOrder, email: 'nope' }).email);
  assert.ok(validateOrder({ ...validOrder, phone: 'call me' }).phone);
  assert.ok(validateOrder({ ...validOrder, address: 'too short' }).address);
  assert.ok(validateOrder({ ...validOrder, landmark: 'x' }).landmark);
  assert.ok(validateOrder({ ...validOrder, paymentMethod: '' }).paymentMethod);

  // Optional, but a mistyped code should be caught before it reaches sales.
  assert.deepEqual(validateOrder({ ...validOrder, voucher: 'SAVE-2026' }), {});
  assert.ok(validateOrder({ ...validOrder, voucher: 'no spaces here' }).voucher);
  assert.ok(validateOrder({ ...validOrder, voucher: 'ab' }).voucher);
});

test('the four payment methods the client asked for are offered', () => {
  assert.deepEqual(
    paymentMethods.map((method) => method.label),
    ['GCash', 'Maya', 'Bank Transfer', 'Credit / Debit Card'],
  );
});

test('an order is posted as a plain-text order and returns its reference', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(
      JSON.stringify({
        ok: true,
        receipt: { reference: 'SSS-260913-4KQ', itemCount: 3, total: 79000 },
      }),
      { status: 200 },
    );
  };

  try {
    const lines = resolveLines(
      [
        { productId: 'panel', branch: 'pili', quantity: 2 },
        { productId: 'inverter', branch: 'lipa', quantity: 1 },
      ],
      catalogue,
    );
    const receipt = await submitOrder('https://script.example/exec', lines, validOrder, {
      honeypot: '',
      elapsedMs: 9000,
    });

    assert.deepEqual(receipt, { reference: 'SSS-260913-4KQ', itemCount: 3, total: 79000 });

    const [call] = calls;
    // Apps Script does not answer the preflight that application/json would trigger.
    assert.equal(call.init.headers['Content-Type'], 'text/plain;charset=utf-8');
    const body = JSON.parse(call.init.body);
    assert.equal(body.type, 'order', 'the mailer tells orders from estimates by this');
    assert.equal(body.lines.length, 2);
    assert.equal(body.lines[0].unitPrice, 12000);
    assert.equal(body.landmark, 'Beside the covered court');
    assert.equal(body.paymentMethod, 'gcash');
    assert.equal(body.website, '');
  } finally {
    globalThis.fetch = original;
  }
});

test('a refused order is reported rather than silently succeeding', async () => {
  const original = globalThis.fetch;
  const lines = resolveLines([{ productId: 'panel', branch: 'pili', quantity: 1 }], catalogue);

  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ ok: false, error: 'An ordered item has an invalid price.' }), {
        status: 200,
      });
    await assert.rejects(
      () =>
        submitOrder('https://script.example/exec', lines, validOrder, {
          honeypot: '',
          elapsedMs: 9000,
        }),
      /invalid price/,
    );

    globalThis.fetch = async () => {
      throw new Error('offline');
    };
    await assert.rejects(
      () =>
        submitOrder('https://script.example/exec', lines, validOrder, {
          honeypot: '',
          elapsedMs: 9000,
        }),
      /check your connection/,
    );

    // An empty cart and an unconfigured endpoint are caught before anything is sent.
    await assert.rejects(
      () => submitOrder('', lines, validOrder, { honeypot: '', elapsedMs: 9000 }),
      /not connected/,
    );
    await assert.rejects(
      () =>
        submitOrder('https://script.example/exec', [], validOrder, {
          honeypot: '',
          elapsedMs: 9000,
        }),
      /cart is empty/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('prices are formatted as pesos', () => {
  assert.equal(formatPeso(79000), '₱79,000');
  assert.equal(formatPeso(0), '₱0');
});

test('the shop is wired into the page the client asked for', async () => {
  const header = await readFile(path.join(root, 'src/components/Header.tsx'), 'utf8');
  assert.match(header, /header-cart/, 'the navigation bar needs a cart');
  assert.match(header, /header-cart__badge/, 'and a count on it');
  assert.match(
    header,
    /aria-label=\{\s*\n?\s*cartCount/,
    'the count belongs in the accessible name',
  );

  const catalog = await readFile(path.join(root, 'src/components/ProductCatalog.tsx'), 'utf8');
  assert.match(catalog, /product-card__price/, 'products should show their price');
  assert.match(catalog, /Price on request/, 'and say so when nobody has set one');
  assert.match(catalog, /openAddToCart/);

  const add = await readFile(path.join(root, 'src/components/cart/AddToCartDialog.tsx'), 'utf8');
  assert.match(add, /Collect from/, 'the panel should ask which branch');
  assert.match(add, /in stock/, 'and show what each branch holds');
  assert.match(add, /Nearest/);

  const cart = await readFile(path.join(root, 'src/components/cart/CartDialog.tsx'), 'utf8');
  assert.match(cart, /Order Now/, 'the client asked for this wording, not "Place order"');
  assert.doesNotMatch(cart, /Place order/i);
  assert.match(cart, /Your order has been sent/);
  assert.match(cart, /sales team will contact you/);
  assert.match(cart, /Nothing has been charged/, 'no payment is taken, and it must say so');
  assert.match(cart, /Landmark/);
  assert.match(cart, /Voucher code/);
});

test('price and stock stay optional so older product records survive', async () => {
  const siteData = await readFile(path.join(root, 'src/data/siteData.ts'), 'utf8');
  assert.match(siteData, /price\?: number/);
  assert.match(siteData, /stock\?: ProductStock/);

  // Every product saved before ordering existed carries neither. A required field would fail
  // validation for all of them and empty the catalogue.
  const types = await readFile(path.join(root, 'src/cms/types.ts'), 'utf8');
  assert.match(types, /value\.price === undefined/);
  assert.match(types, /value\.stock === undefined/);
});

test('the cart never learns how to price anything itself', async () => {
  const files = [
    'src/lib/cart.ts',
    'src/cms/CartContext.tsx',
    'src/components/cart/CartDialog.tsx',
    'src/components/cart/AddToCartDialog.tsx',
  ];
  const source = (
    await Promise.all(files.map((file) => readFile(path.join(root, file), 'utf8')))
  ).join('\n');

  // Product prices are public catalogue data, but the quotation rate card is not: the cart must
  // not reach the pricing tables or the estimate function on its way to a total.
  for (const term of [
    'quote_categories',
    'quote_settings',
    'quick_estimate_settings',
    'quick-estimate',
  ]) {
    assert.doesNotMatch(source, new RegExp(term), `the cart must not reference ${term}`);
  }

  // The recipient mailbox belongs in the Apps Script, never in the published bundle.
  assert.doesNotMatch(source, /@gmail\.com|@smartsave/i);
});
