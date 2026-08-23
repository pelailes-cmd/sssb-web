import { ArrowRight, Check, Info, MapPinOff, PackageCheck, Snowflake, Sun } from 'lucide-react';
import { useMemo } from 'react';
import { useServiceArea } from '../cms/ServiceAreaContext';
import { useSiteContent } from '../cms/SiteContentContext';
import { isAvailableInArea, serviceAreaOptions } from '../data/siteData';
import { SectionHeading } from './SectionHeading';
import { SectionScene } from './SectionScene';
import { QuoteButton } from './QuoteButton';
import { ServiceAreaFilter } from './ServiceAreaFilter';

export function PromotionsSection() {
  const { promotions } = useSiteContent();
  const { area } = useServiceArea();
  const visiblePromotions = useMemo(
    () => promotions.filter((promotion) => isAvailableInArea(promotion, area)),
    [area, promotions],
  );
  const areaPlace = serviceAreaOptions.find((option) => option.code === area)?.place;

  return (
    <section id="promotions" className="section promotions-section">
      <SectionScene variant="promotions" />
      <div className="container">
        <SectionHeading
          eyebrow="Supplied offer"
          title="A solar upgrade with a cooler extra"
          description="The promotion below is rebuilt from the supplied poster as responsive native content. Its availability date was not provided, so confirmation is required before relying on the offer."
        />

        <ServiceAreaFilter sectionLabel="promotions" />

        {visiblePromotions.map((promotion) => (
          <article
            key={promotion.id}
            className="promotion-card"
            data-status={promotion.status}
            data-reveal
          >
            <div className="promotion-card__visual">
              <div className="promotion-card__sun" aria-hidden="true">
                <Sun />
              </div>
              <img
                src={promotion.image.src}
                alt={promotion.image.alt}
                loading="lazy"
                decoding="async"
              />
              <div className="promotion-card__status">
                <Info aria-hidden="true" size={16} />
                {promotion.statusLabel}
              </div>
            </div>

            <div className="promotion-card__content">
              <p className="promotion-card__supporting">{promotion.supportingLine}</p>
              <h3>{promotion.title}</h3>
              <div className="promotion-card__offers">
                {promotion.offers.map((offer, index) => (
                  <div key={offer.threshold}>
                    <span className="promotion-card__offer-number">0{index + 1}</span>
                    <p>{offer.threshold}</p>
                    <strong>
                      <Snowflake aria-hidden="true" />
                      {offer.inclusion}
                    </strong>
                  </div>
                ))}
              </div>

              <ul className="promotion-card__highlights" aria-label="Promotion highlights">
                {promotion.highlights.map((highlight) => (
                  <li key={highlight}>
                    <Check aria-hidden="true" size={15} />
                    {highlight}
                  </li>
                ))}
              </ul>

              <div className="promotion-card__footer">
                <p>
                  <PackageCheck aria-hidden="true" />
                  <span>{promotion.condition}</span>
                </p>
                <div className="section-actions">
                  <QuoteButton />
                  <a className="button button--primary" href="#contact">
                    Confirm this offer
                    <ArrowRight aria-hidden="true" size={18} />
                  </a>
                </div>
              </div>
            </div>
          </article>
        ))}

        {visiblePromotions.length ? null : (
          <div className="area-empty" role="status" data-reveal>
            <MapPinOff aria-hidden="true" />
            <h3>No promotions are running in {areaPlace} right now.</h3>
            <p>
              Select “All locations” to see every published offer, or contact the team to ask what
              is currently available in your area.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
