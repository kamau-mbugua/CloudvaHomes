import { useEffect, useState } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { type PublicSiteData, publicSiteApi } from './api';
import { digitsOnly } from './booking';
import { BookingPage } from './BookingPage';
import { BookPage } from './BookPage';
import { HomePage } from './HomePage';
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
      <div className="site-shell">
        <header className="site-header">
          <div className="site-header__inner">
            <Link to="/" className="site-brand">
              {site.logoUrl ? (
                <img src={site.logoUrl} alt={site.businessName} className="site-brand__logo" />
              ) : (
                <span className="site-brand__monogram">
                  {site.businessName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="site-brand__name">{site.businessName}</span>
            </Link>

            <div className="site-header__actions">
              {waDigits ? (
                <a
                  href={`https://wa.me/${waDigits}`}
                  target="_blank"
                  rel="noreferrer"
                  className="site-btn site-btn--secondary site-btn--sm"
                >
                  WhatsApp
                </a>
              ) : site.contactPhone ? (
                <a
                  href={`tel:${site.contactPhone}`}
                  className="site-btn site-btn--secondary site-btn--sm"
                >
                  Call host
                </a>
              ) : null}
            </div>
          </div>
        </header>

        <main className="site-main">
          <Routes>
            <Route path="/" element={<HomePage site={site} />} />
            <Route path="/u/:listingId" element={<UnitPage site={site} />} />
            <Route path="/u/:listingId/book" element={<BookPage site={site} />} />
            <Route path="/b/:token" element={<BookingPage />} />
          </Routes>
        </main>

        <footer className="site-footer">
          <div className="site-footer__inner">
            <span>
              © {year} {site.businessName}
            </span>
            {site.contactPhone && <span>{site.contactPhone}</span>}
            <span className="site-footer__powered">Powered by KodiHub</span>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}
