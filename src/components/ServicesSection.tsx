import { ArrowRight, Building2, Factory, Headphones, Home, ShieldCheck } from 'lucide-react';
import { useSiteContent } from '../cms/SiteContentContext';
import type { Service } from '../data/siteData';
import { SectionHeading } from './SectionHeading';

const iconMap: Record<Service['icon'], typeof Home> = {
  home: Home,
  building: Building2,
  factory: Factory,
  tools: Headphones,
  shield: ShieldCheck,
};

export function ServicesSection() {
  const { services } = useSiteContent();
  return (
    <section id="services" className="section services-section">
      <div className="container">
        <div className="services-section__top">
          <SectionHeading
            eyebrow="Confirmed services"
            title="Clear solar support for different requirements"
            description="The service list stays deliberately grounded in the supplied cover and business message, so future offerings can be added without overstating what is currently confirmed."
            inverse
          />
          <a className="button button--light" href="#contact" data-reveal>
            Get a Solar Consultation
            <ArrowRight aria-hidden="true" size={18} />
          </a>
        </div>

        <div className="services-grid">
          {services.map((service, index) => {
            const Icon = iconMap[service.icon];
            return (
              <article
                key={service.id}
                className={`service-card${service.id === 'after-sales' ? ' service-card--accent' : ''}`}
                data-reveal
                style={{ '--reveal-delay': `${Math.min(index, 4) * 70}ms` } as React.CSSProperties}
              >
                <div className="service-card__top">
                  <span>0{index + 1}</span>
                  <Icon aria-hidden="true" />
                </div>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <a href="#contact" aria-label={`Inquire about ${service.title}`}>
                  Discuss this service
                  <ArrowRight aria-hidden="true" size={16} />
                </a>
              </article>
            );
          })}
        </div>

        <div className="service-commitment" data-reveal>
          <div className="service-commitment__signal" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div>
            <p className="eyebrow">The after-sales standard</p>
            <h3>Install well. Respond quickly. Keep supporting.</h3>
          </div>
          <p>
            A dependable solar provider is measured not only by installation quality, but also by
            how effectively maintenance and warranty concerns are handled afterward.
          </p>
        </div>
      </div>
    </section>
  );
}
