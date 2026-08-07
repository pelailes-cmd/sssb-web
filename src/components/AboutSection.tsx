import { ArrowRight, Check, Headphones, MapPin, ShieldCheck, Wrench } from 'lucide-react';
import { useSiteContent } from '../cms/SiteContentContext';
import { assetUrl, type AboutCommitment } from '../data/siteData';
import { SectionHeading } from './SectionHeading';
import { SectionScene } from './SectionScene';

const commitmentIcons: Record<AboutCommitment['icon'], typeof Wrench> = {
  tools: Wrench,
  support: Headphones,
  shield: ShieldCheck,
};

export function AboutSection() {
  const { about } = useSiteContent();
  if (!about) return null;

  return (
    <section id="about" className="section about-section">
      <SectionScene variant="about" />
      <div className="container">
        <SectionHeading
          eyebrow={about.eyebrow}
          title={about.title}
          description={about.description}
        />

        <div className="about-layout">
          <div className="about-statement" data-reveal>
            <div className="about-statement__mark">
              <img src={assetUrl('assets/brand/brand-mark.png')} alt="" loading="lazy" />
            </div>
            <p className="eyebrow">{about.organizationName}</p>
            <blockquote>“{about.quote}”</blockquote>
            <div className="about-statement__location">
              <MapPin aria-hidden="true" />
              <span>{about.location}</span>
            </div>
          </div>

          <div className="commitment-list">
            {about.commitments.map((commitment, index) => {
              const Icon = commitmentIcons[commitment.icon];
              return (
                <article
                  key={commitment.title}
                  data-reveal
                  style={{ '--reveal-delay': `${index * 80}ms` } as React.CSSProperties}
                >
                  <span>
                    <Icon aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{commitment.title}</h3>
                    <p>{commitment.copy}</p>
                  </div>
                  <Check aria-hidden="true" />
                </article>
              );
            })}
            <a className="button button--primary" href="#contact" data-reveal>
              Contact Us
              <ArrowRight aria-hidden="true" size={18} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
