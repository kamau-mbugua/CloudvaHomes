import { useState } from "react";
import { Link } from "react-router-dom";
import {
  type PublicListingSummary,
  type PublicSiteData,
  publicSiteApi,
} from "./api";
import { digitsOnly, formatMinorKES } from "./booking";

interface HomePageProps {
  site: PublicSiteData;
}

export function HomePage({ site }: HomePageProps) {
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(1);
  const [filteredListings, setFilteredListings] = useState<
    PublicListingSummary[] | null
  >(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!checkIn || !checkOut) {
      setFilteredListings(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const res = await publicSiteApi.getAvailable(
        site.slug,
        checkIn,
        checkOut,
        guests,
      );
      setFilteredListings(res.listings);
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Unable to check availability",
      );
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setCheckIn("");
    setCheckOut("");
    setGuests(1);
    setFilteredListings(null);
    setSearchError(null);
  }

  const listings = filteredListings ?? site.listings;
  const waDigits = digitsOnly(site.whatsappPhone);
  const hasListings = site.listings.length > 0;
  const contactHref = waDigits
    ? `https://wa.me/${waDigits}`
    : site.contactPhone
      ? `tel:${site.contactPhone}`
      : null;

  return (
    <div className="site-home">
      <section className="site-hero">
        <div className="site-hero__inner">
          <p className="site-hero__eyebrow">Direct booking · Best rates</p>
          <h1 className="site-hero__title">{site.businessName}</h1>
          {site.about && <p className="site-hero__about">{site.about}</p>}
          <div className="site-hero__meta">
            <span>Check-in from {site.checkInTime}</span>
            <span>·</span>
            <span>Check-out by {site.checkOutTime}</span>
            {waDigits && (
              <>
                <span>·</span>
                <a
                  href={`https://wa.me/${waDigits}`}
                  target="_blank"
                  rel="noreferrer"
                  className="site-hero__contact"
                >
                  WhatsApp host
                </a>
              </>
            )}
          </div>
        </div>

        {hasListings ? (
          <form
            className="site-search-bar"
            onSubmit={(e) => void handleSearch(e)}
          >
            <label className="site-search-field">
              <span>Check-in</span>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
              />
            </label>
            <label className="site-search-field">
              <span>Check-out</span>
              <input
                type="date"
                value={checkOut}
                min={checkIn || undefined}
                onChange={(e) => setCheckOut(e.target.value)}
              />
            </label>
            <label className="site-search-field">
              <span>Guests</span>
              <input
                type="number"
                min={1}
                max={20}
                value={guests}
                onChange={(e) =>
                  setGuests(Math.max(1, Number(e.target.value) || 1))
                }
              />
            </label>
            <div className="site-search-actions">
              <button
                type="submit"
                className="site-btn site-btn--primary"
                disabled={searching}
              >
                {searching ? "Checking…" : "Check availability"}
              </button>
              {filteredListings !== null && (
                <button
                  type="button"
                  className="site-btn site-btn--ghost"
                  onClick={clearSearch}
                >
                  Reset
                </button>
              )}
            </div>
          </form>
        ) : null}
        {searchError && (
          <p className="site-alert site-alert--error">{searchError}</p>
        )}
      </section>

      <section className="site-section">
        <div className="site-section__head">
          <h2>{filteredListings !== null ? "Available stays" : "Our stays"}</h2>
          {hasListings ? (
            <span>
              {listings.length} {listings.length === 1 ? "place" : "places"}
            </span>
          ) : null}
        </div>

        {!hasListings ? (
          <div className="site-empty site-empty--welcome">
            <div className="site-not-found__icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                width="28"
                height="28"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9.5V20h14V9.5" />
                <path d="M10 20v-5h4v5" />
              </svg>
            </div>
            <h3>No stays listed yet</h3>
            <p>
              {site.businessName} is getting ready. Check back soon, or ask the
              host about availability.
            </p>
            {contactHref ? (
              <a
                href={contactHref}
                target={waDigits ? "_blank" : undefined}
                rel="noreferrer"
                className="site-btn site-btn--primary"
              >
                {waDigits ? "Message on WhatsApp" : "Call the host"}
              </a>
            ) : null}
          </div>
        ) : listings.length === 0 ? (
          <div className="site-empty">
            <p>
              No stays are free for those dates. Try other dates, or see
              everything we offer.
            </p>
            <button
              type="button"
              className="site-btn site-btn--ghost"
              onClick={clearSearch}
            >
              Show all stays
            </button>
          </div>
        ) : (
          <div className="site-grid">
            {listings.map((item) => {
              const query =
                checkIn && checkOut
                  ? `?checkIn=${encodeURIComponent(checkIn)}&checkOut=${encodeURIComponent(checkOut)}&guests=${guests}`
                  : "";
              return (
                <Link
                  key={item.id}
                  to={`/u/${item.id}${query}`}
                  className="site-card"
                >
                  <div className="site-card__media">
                    {item.coverUrl ? (
                      <img
                        src={item.coverUrl}
                        alt={item.title}
                        loading="lazy"
                      />
                    ) : (
                      <div className="site-card__placeholder">
                        {item.title.slice(0, 1)}
                      </div>
                    )}
                    {item.area && (
                      <span className="site-card__badge">{item.area}</span>
                    )}
                  </div>
                  <div className="site-card__body">
                    <h3 className="site-card__title">{item.title}</h3>
                    <p className="site-card__specs">
                      Up to {item.maxGuests}{" "}
                      {item.maxGuests === 1 ? "guest" : "guests"} ·{" "}
                      {item.bedrooms === 0 ? "Studio" : `${item.bedrooms} bd`} ·{" "}
                      {item.bathrooms} ba
                    </p>
                    <div className="site-card__price-row">
                      <div>
                        <span className="site-card__price">
                          {formatMinorKES(item.fromPrice)}
                        </span>
                        <span className="site-card__per"> / night</span>
                      </div>
                      {item.totalPrice && item.nights && (
                        <span className="site-card__total">
                          {formatMinorKES(item.totalPrice)} total ({item.nights}
                          n)
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {site.houseRules && (
        <section className="site-section site-rules-box">
          <h2>House rules</h2>
          <p>{site.houseRules}</p>
        </section>
      )}
    </div>
  );
}
