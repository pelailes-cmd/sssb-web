import { Phone } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useAdmin } from './cms/AdminContext';
import { AboutSection } from './components/AboutSection';
import { ContactSection } from './components/ContactSection';
import { DocumentationSection } from './components/DocumentationSection';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { OverviewSection } from './components/OverviewSection';
import { PortfolioSection } from './components/PortfolioSection';
import { ProductCatalog } from './components/ProductCatalog';
import { PromotionsSection } from './components/PromotionsSection';
import { QuotationSection } from './components/quotation/QuotationSection';
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
        <QuotationSection />
        <DocumentationSection />
        <PortfolioSection />
        <ContactSection />
        <AboutSection />
      </main>
      <Footer />
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
