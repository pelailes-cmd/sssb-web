/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Which quote dialog is open, if any.
 *
 * Two separate journeys share this state. `inquiry` is the short form behind the header button:
 * a handful of questions that go straight to the sales inbox. `estimate` is the detailed
 * calculator, kept intact but moved out of the page and behind a footer link. Only one can be
 * open at a time, which keeps the focus handling simple.
 */
type QuoteDialog = 'inquiry' | 'estimate' | null;

type QuoteDialogContextValue = {
  openDialog: QuoteDialog;
  openInquiry: () => void;
  openEstimate: () => void;
  closeDialog: () => void;
};

const QuoteDialogContext = createContext<QuoteDialogContextValue | null>(null);

export function QuoteDialogProvider({ children }: { children: ReactNode }) {
  const [openDialog, setOpenDialog] = useState<QuoteDialog>(null);

  const openInquiry = useCallback(() => setOpenDialog('inquiry'), []);
  const openEstimate = useCallback(() => setOpenDialog('estimate'), []);
  const closeDialog = useCallback(() => setOpenDialog(null), []);

  const value = useMemo<QuoteDialogContextValue>(
    () => ({ openDialog, openInquiry, openEstimate, closeDialog }),
    [closeDialog, openDialog, openEstimate, openInquiry],
  );

  return <QuoteDialogContext.Provider value={value}>{children}</QuoteDialogContext.Provider>;
}

export function useQuoteDialog() {
  const value = useContext(QuoteDialogContext);
  if (!value) throw new Error('useQuoteDialog must be used inside QuoteDialogProvider.');
  return value;
}
