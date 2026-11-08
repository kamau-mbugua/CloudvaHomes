import type { PublicListingSummary } from './api';

/** Guest-side search and filters over the listings already on the page (no extra requests). */
export interface ListingFilters {
  q: string;
  area: string;
  /** Minimum guests the stay must fit; 0 = any. */
  guests: number;
  /** null = any; 0 = studio; 3 = three or more. */
  bedrooms: number | null;
  /** Whole shillings per night; null = any. */
  maxPrice: number | null;
  sort: 'recommended' | 'price-asc' | 'price-desc';
}

export const EMPTY_FILTERS: ListingFilters = {
  q: '',
  area: '',
  guests: 0,
  bedrooms: null,
  maxPrice: null,
  sort: 'recommended',
};

const nightly = (l: PublicListingSummary) => Number(l.fromPrice) / 100;

export function filterListings(listings: readonly PublicListingSummary[], f: ListingFilters): PublicListingSummary[] {
  const q = f.q.trim().toLowerCase();
  const out = listings.filter((l) => {
    if (q && !`${l.title} ${l.area ?? ''}`.toLowerCase().includes(q)) return false;
    if (f.area && l.area !== f.area) return false;
    if (f.guests > 0 && l.maxGuests < f.guests) return false;
    if (f.bedrooms !== null) {
      if (f.bedrooms >= 3 ? l.bedrooms < 3 : l.bedrooms !== f.bedrooms) return false;
    }
    if (f.maxPrice !== null && nightly(l) > f.maxPrice) return false;
    return true;
  });
  if (f.sort === 'price-asc') out.sort((a, b) => nightly(a) - nightly(b));
  if (f.sort === 'price-desc') out.sort((a, b) => nightly(b) - nightly(a));
  return out;
}

/** How many filters (not sort) are set: for the "Filters (2)" label and "Clear". */
export function activeFilterCount(f: ListingFilters): number {
  return [f.q.trim() !== '', f.area !== '', f.guests > 0, f.bedrooms !== null, f.maxPrice !== null].filter(Boolean)
    .length;
}

export function areasOf(listings: readonly PublicListingSummary[]): string[] {
  return [...new Set(listings.map((l) => l.area).filter((a): a is string => !!a))].sort((a, b) => a.localeCompare(b));
}

/** "Up to KES X" choices: round 5,000s up to just above the dearest stay. */
export function priceStepsOf(listings: readonly PublicListingSummary[]): number[] {
  if (listings.length === 0) return [];
  const top = Math.max(...listings.map(nightly));
  const steps: number[] = [];
  for (let v = 5000; v < top + 5000; v += 5000) steps.push(v);
  return steps;
}

/** wa.me link with a prefilled message, or null when the host has no WhatsApp number. */
export function whatsappLink(digits: string, message: string): string | null {
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
