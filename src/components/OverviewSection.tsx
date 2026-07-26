import {
  ArrowRight,
  BadgeCheck,
  Headphones,
  MapPinned,
  PackageCheck,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { business } from '../data/siteData';

const pathwayCards = [
  {
    title: 'Find the right service path',
    copy: 'Residential, commercial, and industrial solar inquiries are clearly separated for a more focused first conversation.',
    href: '#services',
    link: 'Explore services',
    icon: BadgeCheck,
  },
  {
    title: 'Review verified equipment',
    copy: 'Browse panels, inverters, storage, protection, mounting hardware, lighting, and air-conditioning products from the supplied catalog.',
    href: '#products',
    link: 'View the catalog',
    icon: PackageCheck,
  },
  {
    title: 'Keep support within reach',
    copy: 'After-sales assistance, maintenance, and warranty support stay visible from the first inquiry onward.',
    href: '#contact',
    link: 'Talk to the local team',
    icon: Headphones,
  },
];

export function OverviewSection() {
  return (
    <section id="home-overview" className="section overview-section">
      <div className="container">
        <div className="overview-intro">
          <div className="overview-intro__copy" data-reveal>
            <p className="eyebrow">Solar confidence, built around support</p>
            <h2>A solar company should still be there after the installation.</h2>
          </div>
          <div className="overview-intro__body" data-reveal>
            <p>
              Smart Save Solar Bicol presents dependable solar solutions with a clear service
              promise: installation quality matters, and so does what happens next.
            </p>
            <p>
              Responsive maintenance, fast assistance, and warranty support help keep the customer
              relationship useful long after equipment is switched on.
            </p>
          </div>
        </div>

        <div className="trust-bar" data-reveal aria-label="Verified trust indicators">
          <span>
            <MapPinned aria-hidden="true" />
            <strong>Local contact</strong>
            {business.address}
          </span>
          <span>
            <Wrench aria-hidden="true" />
            <strong>After-sales</strong>
            Support & maintenance
          </span>
          <span>
            <ShieldCheck aria-hidden="true" />
            <strong>Ongoing help</strong>
            Warranty assistance
          </span>
        </div>

        <div className="pathway-grid">
          {pathwayCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <article
                key={card.title}
                className="pathway-card"
                data-reveal
                style={{ '--reveal-delay': `${index * 80}ms` } as React.CSSProperties}
              >
                <span className="pathway-card__number">0{index + 1}</span>
                <Icon aria-hidden="true" />
                <h3>{card.title}</h3>
                <p>{card.copy}</p>
                <a href={card.href}>
                  {card.link}
                  <ArrowRight aria-hidden="true" size={17} />
                </a>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
