import { ArrowRight, Check, Headphones, MapPin, ShieldCheck, Wrench } from 'lucide-react';
import { assetUrl, business } from '../data/siteData';
import { SectionHeading } from './SectionHeading';

const commitments = [
  {
    icon: Wrench,
    title: 'Installation quality',
    copy: 'The standard starts with dependable installation—not unsupported claims or shortcuts.',
  },
  {
    icon: Headphones,
    title: 'Responsive assistance',
    copy: 'Customers need a reachable team when questions or maintenance concerns come up.',
  },
  {
    icon: ShieldCheck,
    title: 'Warranty support',
    copy: 'Warranty concerns deserve clear assistance without inventing terms or durations.',
  },
];

export function AboutSection() {
  return (
    <section id="about" className="section about-section">
      <div className="container">
        <SectionHeading
          eyebrow="About Us"
          title="Trust is built in the work that comes after the sale"
          description="Smart Save Solar Bicol’s message is direct: reliable solar service combines quality installation with fast support, maintenance, and warranty assistance."
        />

        <div className="about-layout">
          <div className="about-statement" data-reveal>
            <div className="about-statement__mark">
              <img src={assetUrl('assets/brand/brand-mark.png')} alt="" loading="lazy" />
            </div>
            <p className="eyebrow">{business.supportingName}</p>
            <blockquote>
              “A reliable solar company in Pili, Camarines Sur should provide not only quality
              installation but also strong after-sales service.”
            </blockquote>
            <div className="about-statement__location">
              <MapPin aria-hidden="true" />
              <span>{business.address}</span>
            </div>
          </div>

          <div className="commitment-list">
            {commitments.map((commitment, index) => {
              const Icon = commitment.icon;
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
