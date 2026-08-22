import { X } from 'lucide-react';
import { lazy, Suspense, useEffect, useId, useRef } from 'react';
import { useQuoteDialog } from '../../cms/QuoteDialogContext';

const QuotationWizard = lazy(() =>
  import('./QuotationWizard').then((module) => ({ default: module.QuotationWizard })),
);

/**
 * The detailed estimator, kept exactly as it was but moved off the page.
 *
 * It is no longer a website section; it opens from a footer link so the shorter header inquiry can
 * be the main path. The wizard itself is unchanged, and is still code-split so its weight is only
 * fetched when somebody asks for a full estimate.
 */
export function QuotationEstimateDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { openDialog, closeDialog } = useQuoteDialog();
  const isOpen = openDialog === 'estimate';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    else if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      className="quote-dialog quote-dialog--wide"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onClose={closeDialog}
    >
      <div className="quote-dialog__head">
        <div>
          <p className="eyebrow">Detailed estimate</p>
          <h2 id={titleId}>Build a full project estimate</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Close the estimate builder"
          onClick={closeDialog}
        >
          <X aria-hidden="true" />
        </button>
      </div>

      <div className="quote-dialog__body">
        {isOpen ? (
          <Suspense fallback={<div className="quotation-skeleton" aria-hidden="true" />}>
            <QuotationWizard />
          </Suspense>
        ) : null}
      </div>
    </dialog>
  );
}
