import { FileText } from 'lucide-react';
import { useQuoteDialog } from '../cms/QuoteDialogContext';

type QuoteButtonProps = {
  /** Chosen for contrast against the section it sits in, not for emphasis. */
  variant?: 'solar' | 'light' | 'primary';
  label?: string;
  className?: string;
};

/**
 * Opens the short quote form.
 *
 * Every placement on the page goes through this component so the wording, the icon and the
 * behaviour cannot drift apart as buttons are added to more sections.
 */
export function QuoteButton({
  variant = 'solar',
  label = 'Get an Estimate',
  className,
}: QuoteButtonProps) {
  const { openInquiry } = useQuoteDialog();

  return (
    <button
      className={`button button--${variant} quote-button${className ? ` ${className}` : ''}`}
      type="button"
      onClick={openInquiry}
    >
      <FileText aria-hidden="true" size={18} />
      {label}
    </button>
  );
}
