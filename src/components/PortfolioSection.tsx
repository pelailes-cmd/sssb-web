import { ArrowRight, Camera, ImagePlus, MapPin, Zap } from 'lucide-react';
import { portfolioItems } from '../data/siteData';
import { SectionHeading } from './SectionHeading';

export function PortfolioSection() {
  return (
    <section id="portfolio" className="section portfolio-section">
      <div className="container">
        <SectionHeading
          eyebrow="Portfolio"
          title="Project stories should be specific—and verifiable"
          description="No completed-project photos or project records were supplied, so this section is intentionally ready for real work instead of padded with fictional installations."
          inverse
        />

        {portfolioItems.length ? (
          <div className="portfolio-grid">
            {portfolioItems.map((item) => (
              <article key={item.id}>
                <img src={item.image.src} alt={item.image.alt} loading="lazy" />
                <h3>{item.title}</h3>
                <ul>
                  {item.verifiedDetails.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        ) : (
          <div className="portfolio-empty" data-reveal>
            <div className="portfolio-empty__frame" aria-hidden="true">
              <div>
                <Zap />
              </div>
              <span>
                <MapPin />
              </span>
              <i />
            </div>
            <div className="portfolio-empty__content">
              <span className="portfolio-empty__icon">
                <Camera aria-hidden="true" />
              </span>
              <p className="eyebrow">Awaiting verified project records</p>
              <h3>A clean gallery structure is ready for completed installations.</h3>
              <p>
                Future entries can include approved photographs and verified project details without
                inventing client names, capacities, locations, savings, or results.
              </p>
              <div
                className="portfolio-empty__fields"
                aria-label="Fields ready for future projects"
              >
                <span>
                  <ImagePlus aria-hidden="true" size={16} /> Approved photos
                </span>
                <span>Verified title</span>
                <span>Confirmed details</span>
              </div>
              <a href="#contact">
                Discuss a solar project
                <ArrowRight aria-hidden="true" size={17} />
              </a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
