import { Minus, Plus, ShoppingCart, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useCart } from '../../cms/CartContext';
import { useServiceArea } from '../../cms/ServiceAreaContext';
import {
  isAvailableInArea,
  serviceAreaOptions,
  type Product,
  type ServiceAreaCode,
} from '../../data/siteData';
import { clampQuantity, formatPeso, MAX_LINE_QUANTITY, stockAt } from '../../lib/cart';

/**
 * The contents of the panel, one product at a time.
 *
 * Kept separate and keyed by product id so the quantity and the chosen branch start fresh for each
 * product simply by remounting, rather than being reset by an effect after the fact.
 */
function AddToCartPanel({ product }: { product: Product }) {
  const fieldId = useId();
  const { closeAddToCart, addLine, openCart } = useCart();
  const { area } = useServiceArea();

  /** Branches that carry this product; one restricted to a single area only shows that one. */
  const branches = useMemo(
    () => serviceAreaOptions.filter((option) => isAvailableInArea(product, option.code)),
    [product],
  );

  /** The visitor's chosen location counts as nearest; otherwise the first branch holding stock. */
  const nearest = useMemo<ServiceAreaCode | null>(() => {
    if (!branches.length) return null;
    if (area && branches.some((option) => option.code === area)) return area;
    const inStock = branches.find((option) => stockAt(product, option.code) > 0);
    return (inStock ?? branches[0]).code;
  }, [area, branches, product]);

  const [chosenBranch, setChosenBranch] = useState<ServiceAreaCode | null>(null);
  const [quantity, setQuantity] = useState(1);

  // Falls back rather than being assigned, so a change of location while the panel is open moves
  // the default without overwriting a branch the visitor picked deliberately.
  const branch = chosenBranch ?? nearest;
  const available = branch ? stockAt(product, branch) : 0;
  const unitPrice = product.price ?? 0;
  const canAdd = Boolean(branch) && available > 0;
  const ceiling = Math.min(MAX_LINE_QUANTITY, available || MAX_LINE_QUANTITY);

  const confirm = () => {
    if (!branch || !canAdd) return;
    addLine(product.id, branch, clampQuantity(quantity, available));
    closeAddToCart();
    openCart();
  };

  return (
    <>
      <div className="quote-dialog__head">
        <div>
          <p className="eyebrow">{product.category}</p>
          <h2>{product.name}</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Close" onClick={closeAddToCart}>
          <X aria-hidden="true" />
        </button>
      </div>

      <div className="cart-dialog__body">
        <p className="cart-dialog__price">
          {formatPeso(unitPrice)} <span>per unit</span>
        </p>

        <fieldset className="cart-branches">
          <legend>Collect from</legend>
          {branches.map((option) => {
            const units = stockAt(product, option.code);
            return (
              <label
                key={option.code}
                className={`cart-branch${branch === option.code ? ' is-selected' : ''}${
                  units > 0 ? '' : ' is-empty'
                }`}
              >
                <input
                  type="radio"
                  name={`${fieldId}-branch`}
                  value={option.code}
                  checked={branch === option.code}
                  onChange={() => {
                    setChosenBranch(option.code);
                    setQuantity((current) => clampQuantity(current, units));
                  }}
                />
                <span className="cart-branch__place">
                  {option.place}
                  {option.code === nearest ? <em>Nearest</em> : null}
                </span>
                <span className="cart-branch__stock">
                  {units > 0 ? `${units} in stock` : 'Out of stock'}
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="cart-quantity">
          <span id={`${fieldId}-qty`}>Quantity</span>
          <div className="cart-quantity__control">
            <button
              type="button"
              aria-label="Reduce quantity"
              disabled={!canAdd || quantity <= 1}
              onClick={() => setQuantity((current) => clampQuantity(current - 1, available))}
            >
              <Minus aria-hidden="true" size={16} />
            </button>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max={ceiling}
              aria-labelledby={`${fieldId}-qty`}
              value={quantity}
              disabled={!canAdd}
              onChange={(event) =>
                setQuantity(clampQuantity(Number(event.target.value), available))
              }
            />
            <button
              type="button"
              aria-label="Increase quantity"
              disabled={!canAdd || quantity >= ceiling}
              onClick={() => setQuantity((current) => clampQuantity(current + 1, available))}
            >
              <Plus aria-hidden="true" size={16} />
            </button>
          </div>
        </div>

        <p className="cart-dialog__total">
          <span>Line total</span>
          <strong>{formatPeso(unitPrice * quantity)}</strong>
        </p>

        {canAdd ? null : (
          <p className="form-status form-status--error" role="status">
            This is out of stock at the branches serving your area. Call us and we will tell you
            when the next delivery lands.
          </p>
        )}
      </div>

      <div className="quote-dialog__actions">
        <button className="button button--ghost-ink" type="button" onClick={closeAddToCart}>
          Keep browsing
        </button>
        <button className="button button--solar" type="button" disabled={!canAdd} onClick={confirm}>
          <ShoppingCart aria-hidden="true" size={18} />
          Add to cart
        </button>
      </div>
    </>
  );
}

/**
 * Opened from a product card, before anything reaches the cart.
 *
 * It answers the three questions somebody has at that moment: how many, from which branch, and is
 * it actually there. Stock is shown for every branch rather than only the chosen one, so a visitor
 * whose nearest branch is short can see where the item is without hunting for it.
 */
export function AddToCartDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { pendingProduct, closeAddToCart } = useCart();
  const isOpen = Boolean(pendingProduct);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    else if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      className="quote-dialog cart-dialog"
      aria-label="Add to cart"
      onCancel={(event) => {
        event.preventDefault();
        closeAddToCart();
      }}
      onClose={closeAddToCart}
    >
      {pendingProduct ? <AddToCartPanel key={pendingProduct.id} product={pendingProduct} /> : null}
    </dialog>
  );
}
