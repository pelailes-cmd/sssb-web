import { ArrowRight, Check, Info, PackageCheck, Snowflake, Sun } from 'lucide-react';
import { useSiteContent } from '../cms/SiteContentContext';
import { SectionHeading } from './SectionHeading';

export function PromotionsSection() {
  const { promotions } = useSiteContent();
  return (
    <section id="promotions" className="section promotions-section">
      <div className="container">
        <SectionHeading
          eyebrow="Supplied offer"
          title="A solar upgrade with a cooler extra"
          description="The promotion below is rebuilt from the supplied poster as responsive native content. Its availability date was not provided, so confirmation is required before relying on the offer."
        />

        {promotions.map((promotion) => (
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
                <a className="button button--primary" href="#contact">
                  Confirm this offer
                  <ArrowRight aria-hidden="true" size={18} />
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
