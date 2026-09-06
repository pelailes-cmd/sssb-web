import { ArrowUp, MapPin, Phone } from 'lucide-react';
import { useState } from 'react';
import { assetUrl, business, navItems } from '../data/siteData';

export function Footer() {
  // The detailed estimator is switched off for now. The link stays so the plan is visible, but it
  // explains itself rather than opening a builder that is not ready to be relied on.
  const [showEstimatorNotice, setShowEstimatorNotice] = useState(false);

  return (
    <footer className="site-footer">
      <div className="container site-footer__top">
        <div className="site-footer__brand">
          <a className="brand brand--footer" href="#home" aria-label={`${business.name} home`}>
            <img
              src={assetUrl('assets/brand/brand-mark.png')}
              alt=""
              width="54"
              height="54"
              loading="lazy"
            />
            <span className="brand__copy">Smart Save Solar</span>
          </a>
          <p>{business.tagline}</p>
          <span>{business.supportingName}</span>
        </div>

        <div className="site-footer__nav">
          <strong>Navigate</strong>
          <nav aria-label="Footer navigation">
            <ul>
              {navItems.map((item) => (
                <li key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
              {/* Sits directly below About Us, where the detailed estimator used to be reached
                  from. */}
              <li>
                <button
                  className="site-footer__quote"
                  type="button"
                  aria-expanded={showEstimatorNotice}
                  onClick={() => setShowEstimatorNotice(true)}
                >
                  Get a free quote now!
                </button>
              </li>
            </ul>
          </nav>
          {showEstimatorNotice ? (
            <p className="site-footer__notice" role="status">
              This feature is under construction, don&rsquo;t worry, we will update on our pages
              once this feature is active.
            </p>
          ) : null}
        </div>

        <div className="site-footer__contact">
          <strong>Verified contact</strong>
          <a href={business.phoneHref}>
            <Phone aria-hidden="true" size={18} />
            {business.phoneDisplay}
          </a>
          <p>
            <MapPin aria-hidden="true" size={18} />
            {business.address}
          </p>
          <a className="site-footer__top-link" href="#home">
            Back to top
            <ArrowUp aria-hidden="true" size={17} />
          </a>
        </div>
      </div>

      <div className="container site-footer__bottom">
        <p>
          © {new Date().getFullYear()} {business.name}. Business information is limited to supplied
          sources.
        </p>
        <p>Solar You Can Trust</p>
      </div>
    </footer>
  );
}
