import {
  ArrowRight,
  Building2,
  Factory,
  Headphones,
  Home,
  MapPinOff,
  ShieldCheck,
} from 'lucide-react';
import { useMemo } from 'react';
import { useServiceArea } from '../cms/ServiceAreaContext';
import { useSiteContent } from '../cms/SiteContentContext';
import { isAvailableInArea, serviceAreaOptions, type Service } from '../data/siteData';
import { SectionHeading } from './SectionHeading';
import { SectionScene } from './SectionScene';
import { QuoteButton } from './QuoteButton';
import { ServiceAreaFilter } from './ServiceAreaFilter';

const iconMap: Record<Service['icon'], typeof Home> = {
  home: Home,
  building: Building2,
  factory: Factory,
  tools: Headphones,
  shield: ShieldCheck,
};

export function ServicesSection() {
  const { services } = useSiteContent();
  const { area } = useServiceArea();
  const visibleServices = useMemo(
    () => services.filter((service) => isAvailableInArea(service, area)),
    [area, services],
  );
  const areaPlace = serviceAreaOptions.find((option) => option.code === area)?.place;

  return (
    <section id="services" className="section services-section">
      <SectionScene variant="services" />
      <div className="container">
        <div className="services-section__top">
          <SectionHeading
            eyebrow="Confirmed services"
            title="Clear solar support for different requirements"
            description="The service list stays deliberately grounded in the supplied cover and business message, so future offerings can be added without overstating what is currently confirmed."
            inverse
          />
          <div className="section-actions" data-reveal>
            <QuoteButton />
            <a className="button button--light" href="#contact">
              Get a Solar Consultation
              <ArrowRight aria-hidden="true" size={18} />
            </a>
          </div>
        </div>

        <ServiceAreaFilter sectionLabel="services" inverse />

        {visibleServices.length ? (
          <div className="services-grid">
            {visibleServices.map((service, index) => {
              const Icon = iconMap[service.icon];
              return (
                <article
                  key={service.id}
                  className={`service-card${service.id === 'after-sales' ? ' service-card--accent' : ''}`}
                  data-reveal
                  style={
                    { '--reveal-delay': `${Math.min(index, 4) * 70}ms` } as React.CSSProperties
                  }
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
        ) : (
          <div className="area-empty" role="status" data-reveal>
            <MapPinOff aria-hidden="true" />
            <h3>No services are listed for {areaPlace} yet.</h3>
            <p>
              Select “All locations” to see everything currently published, or contact the team to
              ask about coverage in your area.
            </p>
          </div>
        )}

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
