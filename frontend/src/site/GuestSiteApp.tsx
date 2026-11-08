import { useEffect, useState } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { type PublicSiteData, photoSrc, publicSiteApi } from './api';
import { digitsOnly } from './booking';
import { BookingPage } from './BookingPage';
import { BookPage } from './BookPage';
import { HomePage } from './HomePage';
import { LegalPage } from './LegalPage';
import { themeVars } from './theme';
import { WhatsAppIcon } from './WhatsAppIcon';
import { UnitPage } from './UnitPage';
import './site.css';

interface GuestSiteAppProps {
  slug: string;
}

export default function GuestSiteApp({ slug }: GuestSiteAppProps) {
  const [site, setSite] = useState<PublicSiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [year] = useState(() => new Date().getFullYear());

  useEffect(() => {
    let cancelled = false;

    publicSiteApi
      .getSite(slug)
      .then((data) => {
        if (cancelled) return;
        if (data.redirectTo) {
          const currentHost = window.location.host;
          const nextHost = currentHost.replace(new RegExp(`^${slug}\\.`, 'i'), `${data.redirectTo}.`);
          if (nextHost !== currentHost) {
            window.location.replace(
              `${window.location.protocol}//${nextHost}${window.location.pathname}${window.location.search}`,
            );
            return;
          }
        }
        document.title = data.businessName;
        setSite(data);
        setNotFound(false);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="site-shell">
        <div className="site-loading" role="status">
          <span className="site-spinner" aria-hidden="true" />
          Loading…
        </div>
      </div>
    );
  }

  if (notFound || !site) {
    return (
      <div className="site-shell">
        <main className="site-not-found">
          <div className="site-not-found__card">
            <div className="site-not-found__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9.5V20h14V9.5" />
                <path d="M10 20v-5h4v5" />
              </svg>
            </div>
            <h1>We couldn't find this booking site</h1>
            <p className="site-not-found__address">{window.location.hostname}</p>
            <p>
              The address may be mistyped, or the host may have paused or renamed their site.
            </p>
            <ul className="site-not-found__tips">
              <li>Check the spelling of the link you were sent.</li>
              <li>Ask the host to send you their booking link again.</li>
            </ul>
            <p className="site-not-found__host">
              Run short stays?{' '}
              <a href="https://kodihub.co.ke" rel="noreferrer">
                Get your own booking site with KodiHub
              </a>
            </p>
          </div>
        </main>
        <footer className="site-footer">
          <div className="site-footer__inner">
            <span className="site-footer__powered">Powered by KodiHub</span>
          </div>
        </footer>
      </div>
    );
  }

  const waDigits = digitsOnly(site.whatsappPhone);

  return (
    <BrowserRouter>
      <div className="site-shell" style={themeVars(site.theme) as React.CSSProperties}>
        <header className="site-header">
          <div className="site-header__inner">
            <Link to="/" className="site-brand">
              {site.logoUrl ? (
                <img src={photoSrc(site.logoUrl, 160)!} alt={site.businessName} className="site-brand__logo" />
              ) : (
                <span className="site-brand__monogram">
                  {site.businessName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="site-brand__name">{site.businessName}</span>
            </Link>

            <nav className="site-header__actions" aria-label="Site">
              <Link to="/" className="site-header__link">
                Stays
              </Link>
              {site.contactPhone ? (
                <a href={`tel:${site.contactPhone}`} className="site-btn site-btn--secondary site-btn--sm">
                  Call
                </a>
              ) : null}
            </nav>
          </div>
        </header>

        <main className="site-main">
          <Routes>
            <Route path="/" element={<HomePage site={site} />} />
            <Route path="/u/:listingId" element={<UnitPage site={site} />} />
            <Route path="/u/:listingId/book" element={<BookPage site={site} />} />
            <Route path="/b/:token" element={<BookingPage />} />
            {(site.legalPages ?? []).map((p) => (
              <Route key={p.key} path={`/${p.key}`} element={<LegalPage slug={site.slug} docKey={p.key} />} />
            ))}
          </Routes>
        </main>

        <footer className="site-footer site-footer--full">
          <div className="site-footer__inner site-footer__grid">
            <div className="site-footer__brand">
              <div className="site-brand">
                {site.logoUrl ? (
                  <img src={photoSrc(site.logoUrl, 160)!} alt="" className="site-brand__logo" />
                ) : (
                  <span className="site-brand__monogram">{site.businessName.slice(0, 1).toUpperCase()}</span>
                )}
                <span className="site-brand__name">{site.businessName}</span>
              </div>
              {site.about ? <p>{site.about.length > 160 ? `${site.about.slice(0, 157)}…` : site.about}</p> : null}
            </div>
            <div>
              <h4>Contact</h4>
              <ul>
                {site.contactPhone ? (
                  <li>
                    <a href={`tel:${site.contactPhone}`}>{site.contactPhone}</a>
                  </li>
                ) : null}
                {waDigits ? (
                  <li>
                    <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer">
                      Chat on WhatsApp
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
            <div>
              <h4>Your stay</h4>
              <ul>
                <li>Check-in from {site.checkInTime}</li>
                <li>Check-out by {site.checkOutTime}</li>
                {site.houseRules ? (
                  <li>
                    <a href="/#house-rules">House rules</a>
                  </li>
                ) : null}
              </ul>
            </div>
            <div>
              <h4>Explore</h4>
              <ul>
                <li>
                  <Link to="/">All stays</Link>
                </li>
                {(site.legalPages ?? []).map((p) => (
                  <li key={p.key}>
                    <Link to={`/${p.key}`}>{p.title}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="site-footer__inner site-footer__bottom">
            <span>
              © {year} {site.businessName}. All rights reserved.
            </span>
            <span className="site-footer__powered">Powered by KodiHub</span>
          </div>
        </footer>

        {waDigits ? (
          <a
            href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Hi ${site.businessName}, I'd like to ask about a stay.`)}`}
            target="_blank"
            rel="noreferrer"
            className="site-wa-fab"
            aria-label={`Chat with ${site.businessName} on WhatsApp`}
            title="Chat on WhatsApp"
          >
            <WhatsAppIcon size={28} />
          </a>
        ) : null}
      </div>
    </BrowserRouter>
  );
}
