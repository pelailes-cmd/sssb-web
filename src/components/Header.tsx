import { FileText, LogIn, Menu, PhoneCall, ShieldCheck, ShoppingCart, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useAdmin } from '../cms/AdminContext';
import { useCart } from '../cms/CartContext';
import { useQuoteDialog } from '../cms/QuoteDialogContext';
import { assetUrl, business, navItems } from '../data/siteData';

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeId, setActiveId] = useState('home');
  const menuId = useId();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { isAdmin, openAdmin, status: adminStatus } = useAdmin();
  const { openInquiry } = useQuoteDialog();
  const { count: cartCount, openCart } = useCart();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const sections = navItems
      .map(({ href }) => document.querySelector<HTMLElement>(href))
      .filter((section): section is HTMLElement => Boolean(section));

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveId(visible.target.id);
      },
      { rootMargin: '-28% 0px -58% 0px', threshold: [0, 0.1, 0.35] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const menuButton = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute('disabled'));
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      menuButton?.focus();
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className={`site-header${scrolled ? ' site-header--scrolled' : ''}`}>
      <div className="site-header__inner">
        <a className="brand" href="#home" aria-label={`${business.name} home`}>
          <img src={assetUrl('assets/brand/brand-mark.png')} alt="" width="48" height="48" />
          <span className="brand__copy">Smart Save Solar</span>
        </a>

        <nav className="desktop-nav" aria-label="Primary navigation">
          <ul>
            {navItems.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  aria-current={activeId === item.href.slice(1) ? 'page' : undefined}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* The label is hidden on the narrowest phones, where it would squeeze the menu button, so
            the accessible name is spelled out rather than left to the text. */}
        <button
          className="header-quote"
          type="button"
          aria-label="Get an Estimate"
          onClick={openInquiry}
        >
          <FileText aria-hidden="true" size={18} />
          <span>Get an Estimate</span>
        </button>

        {/* Icon only at every width: the header row is already full, and the count is the part
            that carries the meaning. The label lives in the accessible name instead. */}
        <button
          className="header-cart"
          type="button"
          aria-label={
            cartCount ? `Cart, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}` : 'Cart, empty'
          }
          onClick={openCart}
        >
          <ShoppingCart aria-hidden="true" size={18} />
          {cartCount > 0 ? (
            <span className="header-cart__badge" aria-hidden="true">
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          ) : null}
        </button>

        <a
          className="header-call"
          href={business.phoneHref}
          aria-label={`Call ${business.phoneDisplay}`}
        >
          <PhoneCall aria-hidden="true" size={18} />
          <span>Call now</span>
        </a>

        <button
          className="header-admin"
          type="button"
          disabled={adminStatus === 'checking'}
          onClick={openAdmin}
        >
          {isAdmin ? (
            <ShieldCheck aria-hidden="true" size={18} />
          ) : (
            <LogIn aria-hidden="true" size={18} />
          )}
          <span>{isAdmin ? 'Admin' : 'Login'}</span>
        </button>

        <button
          ref={menuButtonRef}
          className="menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label="Open navigation menu"
          onClick={() => setMenuOpen(true)}
        >
          <Menu aria-hidden="true" />
        </button>
      </div>

      <div className={`mobile-menu${menuOpen ? ' is-open' : ''}`} aria-hidden={!menuOpen}>
        <button
          className="mobile-menu__backdrop"
          type="button"
          aria-label="Close navigation menu"
          tabIndex={menuOpen ? 0 : -1}
          onClick={closeMenu}
        />
        <div
          ref={panelRef}
          id={menuId}
          className="mobile-menu__panel"
          role="dialog"
          aria-modal="true"
        >
          <div className="mobile-menu__top">
            <span className="mobile-menu__label">Navigate</span>
            <button
              ref={closeButtonRef}
              className="icon-button"
              type="button"
              aria-label="Close navigation menu"
              onClick={closeMenu}
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <nav aria-label="Mobile navigation">
            <ol>
              {navItems.map((item, index) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    tabIndex={menuOpen ? 0 : -1}
                    aria-current={activeId === item.href.slice(1) ? 'page' : undefined}
                    onClick={closeMenu}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    {item.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <button
            className="button button--ghost mobile-menu__admin"
            type="button"
            tabIndex={menuOpen ? 0 : -1}
            disabled={adminStatus === 'checking'}
            onClick={() => {
              closeMenu();
              openAdmin();
            }}
          >
            {isAdmin ? (
              <ShieldCheck aria-hidden="true" size={19} />
            ) : (
              <LogIn aria-hidden="true" size={19} />
            )}
            {isAdmin ? 'Open admin dashboard' : 'Administrator login'}
          </button>
          <button
            className="button button--light mobile-menu__quote"
            type="button"
            tabIndex={menuOpen ? 0 : -1}
            onClick={() => {
              closeMenu();
              openInquiry();
            }}
          >
            <FileText aria-hidden="true" size={19} />
            Get an Estimate
          </button>
          <a
            className="button button--solar mobile-menu__call"
            href={business.phoneHref}
            tabIndex={menuOpen ? 0 : -1}
          >
            <PhoneCall aria-hidden="true" size={19} />
            {business.phoneDisplay}
          </a>
        </div>
      </div>
    </header>
  );
}
