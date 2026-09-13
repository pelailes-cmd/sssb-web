/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { serviceAreaCodes, type Product, type ServiceAreaCode } from '../data/siteData';
import {
  cartCount,
  cartSubtotal,
  lineKey,
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
  parseStoredLines,
  resolveLines,
  type CartLine,
  type StoredLine,
} from '../lib/cart';
import { useSiteContent } from './SiteContentContext';

const STORAGE_KEY = 'sssb-cart-v1';

type CartContextValue = {
  /** Priced against the catalogue as it stands now, not as it stood when the item was added. */
  lines: CartLine[];
  count: number;
  subtotal: number;
  addLine: (productId: string, branch: ServiceAreaCode, quantity: number) => void;
  setQuantity: (productId: string, branch: ServiceAreaCode, quantity: number) => void;
  removeLine: (productId: string, branch: ServiceAreaCode) => void;
  clear: () => void;
  /** The product whose "add to cart" panel is open, if any. */
  pendingProduct: Product | null;
  openAddToCart: (product: Product) => void;
  closeAddToCart: () => void;
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function readStoredLines(): StoredLine[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? parseStoredLines(JSON.parse(value), serviceAreaCodes) : [];
  } catch {
    return [];
  }
}

/**
 * Holds the cart.
 *
 * Only product ids, branches and quantities are kept. Everything a customer is shown — the name,
 * the price, whether the line still exists at all — is resolved against the published catalogue on
 * every render, so an unpublished or re-priced product cannot linger in someone's cart.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { products } = useSiteContent();
  const [stored, setStored] = useState<StoredLine[]>(() =>
    typeof window === 'undefined' ? [] : readStoredLines(),
  );
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    try {
      if (stored.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable in privacy modes; the cart still works for this visit.
    }
  }, [stored]);

  const lines = useMemo(() => resolveLines(stored, products), [stored, products]);

  const addLine = useCallback((productId: string, branch: ServiceAreaCode, quantity: number) => {
    setStored((current) => {
      const key = lineKey(productId, branch);
      const existing = current.find((line) => lineKey(line.productId, line.branch) === key);

      if (existing) {
        return current.map((line) =>
          lineKey(line.productId, line.branch) === key
            ? { ...line, quantity: Math.min(MAX_LINE_QUANTITY, line.quantity + quantity) }
            : line,
        );
      }
      if (current.length >= MAX_CART_LINES) return current;
      return [...current, { productId, branch, quantity }];
    });
  }, []);

  const setQuantity = useCallback(
    (productId: string, branch: ServiceAreaCode, quantity: number) => {
      const key = lineKey(productId, branch);
      setStored((current) =>
        quantity < 1
          ? current.filter((line) => lineKey(line.productId, line.branch) !== key)
          : current.map((line) =>
              lineKey(line.productId, line.branch) === key
                ? { ...line, quantity: Math.min(MAX_LINE_QUANTITY, quantity) }
                : line,
            ),
      );
    },
    [],
  );

  const removeLine = useCallback((productId: string, branch: ServiceAreaCode) => {
    const key = lineKey(productId, branch);
    setStored((current) => current.filter((line) => lineKey(line.productId, line.branch) !== key));
  }, []);

  const clear = useCallback(() => setStored([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: cartCount(lines),
      subtotal: cartSubtotal(lines),
      addLine,
      setQuantity,
      removeLine,
      clear,
      pendingProduct,
      openAddToCart: (product: Product) => setPendingProduct(product),
      closeAddToCart: () => setPendingProduct(null),
      isCartOpen,
      openCart: () => setIsCartOpen(true),
      closeCart: () => setIsCartOpen(false),
    }),
    [lines, addLine, setQuantity, removeLine, clear, pendingProduct, isCartOpen],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used inside CartProvider.');
  return value;
}
