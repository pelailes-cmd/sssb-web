import { ArrowDown, ArrowRight, Headphones, MapPin, ShieldCheck, Wrench } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { business } from '../data/siteData';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { QuoteButton } from './QuoteButton';

const SolarScene = lazy(() => import('./SolarScene'));

function HeroFallback() {
  return (
    <div
      className="hero-fallback"
      role="img"
      aria-label="Stylized solar panel array beneath a rising sun"
    >
      <div className="hero-fallback__sun" />
      <div className="hero-fallback__panel hero-fallback__panel--one" />
      <div className="hero-fallback__panel hero-fallback__panel--two" />
      <div className="hero-fallback__panel hero-fallback__panel--three" />
    </div>
  );
}

export function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<'intro' | 'support'>('intro');

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || reducedMotion) return undefined;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = hero.getBoundingClientRect();
      const distance = Math.max(1, rect.height - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -rect.top / distance));
      const introFade = Math.min(1, Math.max(0, (progress - 0.28) / 0.28));
      const supportReveal = Math.min(1, Math.max(0, (progress - 0.42) / 0.3));

      hero.style.setProperty('--hero-copy-opacity', String(1 - introFade));
      hero.style.setProperty('--hero-copy-y', `${progress * -44}px`);
      hero.style.setProperty('--hero-support-opacity', String(supportReveal));
      hero.style.setProperty('--hero-support-y', `${(1 - supportReveal) * 44}px`);
      setPhase(progress > 0.48 ? 'support' : 'intro');
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
    };
  }, [reducedMotion]);

  return (
    <section ref={heroRef} id="home" className="hero" data-phase={phase}>
      <div className="hero__sticky">
        <div className="hero__backdrop" aria-hidden="true" />
        {reducedMotion ? (
          <HeroFallback />
        ) : (
          <Suspense fallback={<HeroFallback />}>
            <SolarScene reducedMotion={false} />
          </Suspense>
        )}

        <div className="hero__grain" aria-hidden="true" />
        <div className="container hero__content">
          <div className="hero__copy">
            <div className="hero__location">
              <MapPin aria-hidden="true" size={16} />
              Pili, Camarines Sur
            </div>
            <p className="hero__kicker">Dependable solar systems. Support that stays.</p>
            <h1>
              <span>{business.name}</span>
              <em>{business.tagline}</em>
            </h1>
            <p className="hero__lede">
              Reliable solar solutions backed by installation quality, responsive maintenance,
              warranty assistance, and dependable after-sales service.
            </p>
            <div className="hero__actions">
              <QuoteButton />
              <a className="button button--light" href="#services">
                Explore Our Solutions
                <ArrowRight aria-hidden="true" size={18} />
              </a>
              <a className="button button--ghost" href="#products">
                View Products
              </a>
            </div>
            <a className="hero__consult" href="#contact">
              Get a Solar Consultation
              <ArrowRight aria-hidden="true" size={16} />
            </a>
          </div>

          <aside className="hero__support" aria-label="After-sales commitment">
            <p className="eyebrow">Beyond installation</p>
            <h2>The real test starts after switch-on.</h2>
            <p>
              Fast assistance, practical maintenance, and warranty support are part of the service
              relationship—not an afterthought.
            </p>
            <div className="hero__support-points">
              <span>
                <Headphones aria-hidden="true" /> Responsive assistance
              </span>
              <span>
                <Wrench aria-hidden="true" /> Maintenance support
              </span>
              <span>
                <ShieldCheck aria-hidden="true" /> Warranty assistance
              </span>
            </div>
            <a className="button button--light" href="#contact">
              Contact Us
              <ArrowRight aria-hidden="true" size={18} />
            </a>
          </aside>
        </div>

        <div className="hero__service-rail" aria-label="Service categories">
          <span>Residential Solar Systems</span>
          <i aria-hidden="true" />
          <span>Commercial Solar Solutions</span>
          <i aria-hidden="true" />
          <span>Industrial Solar Projects</span>
        </div>

        <a className="hero__scroll" href="#home-overview" aria-label="Continue to company overview">
          <span>Scroll to discover</span>
          <ArrowDown aria-hidden="true" size={17} />
        </a>
      </div>
    </section>
  );
}
