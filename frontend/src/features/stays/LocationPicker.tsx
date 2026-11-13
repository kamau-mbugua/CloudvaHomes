import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { googleMapsKeyRefused, loadGoogleMaps } from '../../lib/googleMaps';
import { staysKeys } from './api';
import { embedUrl, mapLink, parseCoordinates, placeAddress, type StayLocation } from './location';

/** What the Places library gives back for a chosen suggestion (only the parts used here). */
interface PickedPlace {
  id?: string;
  displayName?: string | null;
  formattedAddress?: string | null;
  location?: { lat(): number; lng(): number } | null;
  fetchFields(o: { fields: string[] }): Promise<unknown>;
}
type SelectEvent = Event & {
  placePrediction?: { toPlace(): PickedPlace };
  place?: PickedPlace;
};

/**
 * Where the listing is: search Google Places (when KodiHub admin has set a Maps key), or paste
 * a Google Maps link or coordinates. Guests see the exact pin and get a Google Maps link.
 */
export function LocationPicker({
  value,
  onChange,
  disabled,
}: {
  value: StayLocation | null;
  onChange: (next: StayLocation | null) => void;
  disabled?: boolean;
}) {
  const config = useQuery({
    queryKey: [...staysKeys.all, 'maps-key'],
    queryFn: async () => (await api.get<DataEnvelope<{ key: string | null }>>('/host/listings/maps')).data,
    staleTime: 5 * 60_000,
  });
  const key = config.data?.key ?? null;
  const searchHost = useRef<HTMLDivElement>(null);
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  }, [onChange]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [pastedAddress, setPastedAddress] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);

  useEffect(() => {
    const host = searchHost.current;
    if (!key || disabled || !host) return;
    let el: HTMLElement | null = null;
    let cancelled = false;
    const picked = async (event: Event) => {
      const e = event as SelectEvent;
      const place = e.placePrediction?.toPlace() ?? e.place;
      if (!place) return;
      try {
        await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location'] });
        if (!place.location) throw new Error('no location');
        setSearchError(null);
        changed.current({
          address: placeAddress(place.displayName, place.formattedAddress),
          lat: place.location.lat(),
          lng: place.location.lng(),
          placeId: place.id ?? null,
        });
      } catch {
        setSearchError('Google could not give that place’s location. Try another result, or paste a Google Maps link below.');
      }
    };
    loadGoogleMaps(key)
      .then(async (maps) => {
        const places = (await maps.importLibrary('places')) as {
          PlaceAutocompleteElement: new (o: Record<string, unknown>) => HTMLElement;
        };
        if (cancelled) return;
        el = new places.PlaceAutocompleteElement({ includedRegionCodes: ['ke'] });
        el.id = 'listing-location-search';
        el.setAttribute('aria-label', 'Search for the building or street');
        el.addEventListener('gmp-select', picked);
        el.addEventListener('gmp-placeselect', picked);
        host.replaceChildren(el);
      })
      .catch(() => {
        if (!cancelled) setSearchError('The map search could not load. Paste a Google Maps link below instead.');
      });
    return () => {
      cancelled = true;
      el?.remove();
    };
  }, [key, disabled]);

  const usePasted = () => {
    const coords = parseCoordinates(pasted);
    if (!coords) {
      setPasteError(
        pasted.includes('goo.gl')
          ? 'Short links (maps.app.goo.gl) don’t carry the pin. Open the link, then copy the full link from the address bar.'
          : 'Paste a Google Maps link that shows the pin, or coordinates like -1.2921, 36.8219.',
      );
      return;
    }
    const address = pastedAddress.trim() || value?.address || '';
    if (address.length < 3) {
      setPasteError('Add the address guests should see.');
      return;
    }
    setPasteError(null);
    setPasted('');
    setPastedAddress('');
    onChange({ address, ...coords, placeId: null });
  };

  const refused = googleMapsKeyRefused();

  return (
    <div className="au__field loc">
      <div className="au__labelrow">
        <label htmlFor="listing-location-search">Location on the map (guests see the exact pin)</label>
      </div>

      {key && !disabled ? (
        <div ref={searchHost} className="loc__search">
          <input className="au__input" disabled placeholder="Loading map search…" aria-label="Loading map search" />
        </div>
      ) : !key && !config.isPending ? (
        <p className="loc__hint">
          Map search isn’t set up yet (KodiHub admin adds a Google Maps key). Paste a Google Maps link or the coordinates below.
        </p>
      ) : null}
      {searchError || refused ? (
        <p className="loc__error" role="alert">
          {refused ? 'Google refused the Maps key. Ask KodiHub admin to check it. You can paste a link below.' : searchError}
        </p>
      ) : null}

      {value ? (
        <div className="loc__chosen">
          <label className="loc__label" htmlFor="listing-location-address">Address guests see</label>
          <input
            id="listing-location-address"
            className="au__input"
            value={value.address}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, address: e.target.value })}
          />
          <div className="loc__meta">
            <span className="num">{value.lat.toFixed(6)}, {value.lng.toFixed(6)}</span>
            <a href={mapLink(value)} target="_blank" rel="noreferrer">Open in Google Maps</a>
            {disabled ? null : (
              <button type="button" className="nx-btn nx-btn--sm" onClick={() => onChange(null)}>Remove location</button>
            )}
          </div>
          {key && !refused ? (
            <iframe className="loc__map" title="Map of the listing’s location" src={embedUrl(key, value)} loading="lazy"
              referrerPolicy="no-referrer-when-downgrade" />
          ) : null}
        </div>
      ) : null}

      {disabled ? null : (
        <details className="loc__paste" open={!key && !value}>
          <summary>Or paste a Google Maps link or coordinates</summary>
          <input
            className="au__input"
            aria-label="Google Maps link or coordinates"
            placeholder="https://www.google.com/maps/@-1.2921,36.8219,17z  or  -1.2921, 36.8219"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          {value ? null : (
            <input
              className="au__input"
              aria-label="Address guests see"
              placeholder="Address guests see, e.g. Makini Court, Argwings Kodhek Rd, Nairobi"
              value={pastedAddress}
              onChange={(e) => setPastedAddress(e.target.value)}
            />
          )}
          <button type="button" className="nx-btn nx-btn--sm" onClick={usePasted} disabled={!pasted.trim()}>
            Use this location
          </button>
          {pasteError ? <p className="loc__error" role="alert">{pasteError}</p> : null}
        </details>
      )}
    </div>
  );
}
