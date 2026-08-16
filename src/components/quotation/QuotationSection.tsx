import { lazy, Suspense } from 'react';
import { SectionHeading } from '../SectionHeading';
import { SectionScene } from '../SectionScene';

// The wrapper stays eagerly mounted so the header's scroll-spy and #quotation deep links resolve
// on first paint; only the wizard itself is code-split.
const QuotationWizard = lazy(() =>
  import('./QuotationWizard').then((module) => ({ default: module.QuotationWizard })),
);

function WizardSkeleton() {
  return <div className="quotation-skeleton" aria-hidden="true" />;
}

export function QuotationSection() {
  return (
    <section id="quotation" className="section quotation-section">
      <SectionScene variant="contact" />
      <div className="container">
        <SectionHeading
          eyebrow="Quotation / Estimate"
          title="Request an initial estimate for your project"
          description="Answer a few questions and receive an initial estimated cost with a reference number you can download and share. The estimate is indicative and is confirmed after a site assessment."
          align="center"
        />
        <Suspense fallback={<WizardSkeleton />}>
          <QuotationWizard />
        </Suspense>
      </div>
    </section>
  );
}
