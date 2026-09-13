import { Phone } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useAdmin } from './cms/AdminContext';
import { AboutSection } from './components/AboutSection';
import { AddToCartDialog } from './components/cart/AddToCartDialog';
import { CartDialog } from './components/cart/CartDialog';
import { ContactSection } from './components/ContactSection';
import { DocumentationSection } from './components/DocumentationSection';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { OverviewSection } from './components/OverviewSection';
import { MediaSection } from './components/media/MediaSection';
import { PortfolioSection } from './components/PortfolioSection';
import { ProductCatalog } from './components/ProductCatalog';
import { PromotionsSection } from './components/PromotionsSection';
import { QuotationEstimateDialog } from './components/quotation/QuotationEstimateDialog';
import { QuoteInquiryDialog } from './components/quotation/QuoteInquiryDialog';
import { ServicesSection } from './components/ServicesSection';
import { business } from './data/siteData';
import { useRevealAnimations } from './hooks/useRevealAnimations';

const AdminLoginDialog = lazy(() =>
  import('./components/admin/AdminLoginDialog').then((module) => ({
    default: module.AdminLoginDialog,
  })),
);
const AdminDashboard = lazy(() =>
  import('./components/admin/AdminDashboard').then((module) => ({
    default: module.AdminDashboard,
  })),
);

function AdminOverlays() {
  const { loginOpen, dashboardOpen } = useAdmin();

  return (
    <Suspense fallback={null}>
      {loginOpen ? <AdminLoginDialog /> : null}
      {dashboardOpen ? <AdminDashboard /> : null}
    </Suspense>
  );
}

/**
 * Both quote journeys live in dialogs rather than on the page: the short inquiry from the header,
 * and the detailed estimator from the footer.
 */
function QuoteDialogs() {
  return (
    <Suspense fallback={null}>
      <QuoteInquiryDialog />
      <QuotationEstimateDialog />
    </Suspense>
  );
}

/** Adding to the cart and checking out, in the same modal style as the quote journeys. */
function CartDialogs() {
  return (
    <Suspense fallback={null}>
      <AddToCartDialog />
      <CartDialog />
    </Suspense>
  );
}

export default function App() {
  const [heroIsVisible, setHeroIsVisible] = useState(true);
  const [contactIsVisible, setContactIsVisible] = useState(false);
  useRevealAnimations();

  useEffect(() => {
    const hero = document.getElementById('home');
    const contact = document.getElementById('contact');
    if (!hero || !contact) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === hero) setHeroIsVisible(entry.isIntersecting);
          if (entry.target === contact) setContactIsVisible(entry.isIntersecting);
        });
      },
      { threshold: 0.04 },
    );
    observer.observe(hero);
    observer.observe(contact);
    return () => observer.disconnect();
  }, []);

  const showMobileCall = !heroIsVisible && !contactIsVisible;

  return (
    <>
      <Header />
      <main id="main-content">
        <Hero />
        <OverviewSection />
        <ServicesSection />
        <ProductCatalog />
        <PromotionsSection />
        <DocumentationSection />
        <PortfolioSection />
        <MediaSection />
        <ContactSection />
        <AboutSection />
      </main>
      <Footer />
      <QuoteDialogs />
      <CartDialogs />
      <AdminOverlays />
      <a
        className={`mobile-call-fab${showMobileCall ? ' is-visible' : ''}`}
        href={business.phoneHref}
        aria-label={`Call ${business.phoneDisplay}`}
      >
        <Phone aria-hidden="true" />
        <span>Call now</span>
      </a>
    </>
  );
}
