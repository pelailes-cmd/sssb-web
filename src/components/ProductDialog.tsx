import { ArrowRight, Check, FileWarning, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Product } from '../data/siteData';
import { ProductModelPreview } from './ProductModelPreview';

type ProductDialogProps = {
  product: Product | null;
  onClose: () => void;
};

export function ProductDialog({ product, onClose }: ProductDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !product) return undefined;
    if (!dialog.open) dialog.showModal();

    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose, product]);

  if (!product) return null;

  const closeDialog = () => dialogRef.current?.close();
  const image = product.images[activeImage] ?? product.images[0];

  return (
    <dialog
      ref={dialogRef}
      className="product-dialog"
      aria-labelledby={`product-title-${product.id}`}
      onClick={(event) => {
        if (event.target === dialogRef.current) closeDialog();
      }}
    >
      <div className="product-dialog__shell">
        <div className="product-dialog__topbar">
          <span>Interactive preview · verified product details</span>
          <button
            className="icon-button"
            type="button"
            aria-label="Close product details"
            onClick={closeDialog}
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="product-dialog__layout">
          <div className="product-dialog__media">
            <div className="product-dialog__image-wrap">
              <ProductModelPreview
                models={product.models}
                fallbackImage={image}
                productName={product.name}
                mode="dialog"
              />
            </div>
            {!product.models?.length && product.images.length > 1 ? (
              <div className="product-dialog__thumbs" aria-label="Product image views">
                {product.images.map((item, index) => (
                  <button
                    key={item.src}
                    type="button"
                    aria-label={`View image ${index + 1} of ${product.images.length}`}
                    aria-pressed={activeImage === index}
                    onClick={() => setActiveImage(index)}
                  >
                    <img src={item.src} alt="" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="product-dialog__content">
            <p className="eyebrow">{product.category}</p>
            {product.brand ? <p className="product-dialog__brand">{product.brand}</p> : null}
            <h2 id={`product-title-${product.id}`}>{product.name}</h2>
            <p className="product-dialog__summary">{product.summary}</p>

            <div className="product-dialog__spec-heading">
              <Check aria-hidden="true" size={18} />
              Source-verified specifications
            </div>
            <dl className="spec-list">
              {product.specs.map((spec, index) => (
                <div key={`${spec.label}-${spec.value}-${index}`}>
                  <dt>{spec.label}</dt>
                  <dd>{spec.value}</dd>
                </div>
              ))}
            </dl>

            {product.sourceNote ? (
              <p className="product-dialog__note">
                <FileWarning aria-hidden="true" size={18} />
                <span>{product.sourceNote}</span>
              </p>
            ) : null}

            <div className="product-dialog__actions">
              <a className="button button--primary" href="#contact" onClick={closeDialog}>
                Inquire about this product
                <ArrowRight aria-hidden="true" size={18} />
              </a>
              <button className="button button--text" type="button" onClick={closeDialog}>
                Continue browsing
              </button>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
