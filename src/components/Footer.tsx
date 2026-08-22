import { ArrowUp, MapPin, Phone } from 'lucide-react';
import { useQuoteDialog } from '../cms/QuoteDialogContext';
import { assetUrl, business, navItems } from '../data/siteData';

export function Footer() {
  const { openEstimate } = useQuoteDialog();

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
            <span className="brand__copy">
              <strong>Smart Save</strong>
              <small>Solar</small>
            </span>
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
              {/* Sits directly below About Us. The detailed estimator is no longer a section of
                  the page, so this is where it is reached from. */}
              <li>
                <button className="site-footer__quote" type="button" onClick={openEstimate}>
                  Get a free quote now!
                </button>
              </li>
            </ul>
          </nav>
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
