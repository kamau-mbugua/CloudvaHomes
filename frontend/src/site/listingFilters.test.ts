import { describe, expect, it } from 'vitest';
import { type PublicListingSummary, photoSrc } from './api';
import {
  EMPTY_FILTERS,
  activeFilterCount,
  areasOf,
  filterListings,
  priceStepsOf,
  whatsappLink,
} from './listingFilters';

const L = (id: string, title: string, area: string | null, price: number, guests: number, beds: number): PublicListingSummary => ({
  id,
  title,
  area,
  coverUrl: null,
  fromPrice: String(price * 100),
  maxGuests: guests,
  bedrooms: beds,
  bathrooms: 1,
});

const all = [
  L('a', 'Cozy 1BR with balcony', 'Kilimani', 4500, 2, 1),
  L('b', 'Family 2BR Poolside', 'Kilimani', 7500, 4, 2),
  L('c', 'Studio near Sarit', 'Westlands', 3500, 2, 0),
  L('d', 'Executive 3BR Penthouse', 'Westlands', 12000, 6, 3),
];

describe('guest site search and filters', () => {
  it('shows everything with no filters, in the host order', () => {
    expect(filterListings(all, EMPTY_FILTERS).map((l) => l.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  it('searches title and area, ignoring case', () => {
    expect(filterListings(all, { ...EMPTY_FILTERS, q: 'penthouse' }).map((l) => l.id)).toEqual(['d']);
    expect(filterListings(all, { ...EMPTY_FILTERS, q: 'westl' }).map((l) => l.id)).toEqual(['c', 'd']);
  });

  it('filters by area, guests, bedrooms (3 = 3 or more) and max price', () => {
    expect(filterListings(all, { ...EMPTY_FILTERS, area: 'Kilimani' }).map((l) => l.id)).toEqual(['a', 'b']);
    expect(filterListings(all, { ...EMPTY_FILTERS, guests: 4 }).map((l) => l.id)).toEqual(['b', 'd']);
    expect(filterListings(all, { ...EMPTY_FILTERS, bedrooms: 0 }).map((l) => l.id)).toEqual(['c']);
    expect(filterListings(all, { ...EMPTY_FILTERS, bedrooms: 3 }).map((l) => l.id)).toEqual(['d']);
    expect(filterListings(all, { ...EMPTY_FILTERS, maxPrice: 5000 }).map((l) => l.id)).toEqual(['a', 'c']);
    expect(activeFilterCount({ ...EMPTY_FILTERS, area: 'Kilimani', maxPrice: 5000 })).toBe(2);
  });

  it('sorts by price both ways', () => {
    expect(filterListings(all, { ...EMPTY_FILTERS, sort: 'price-asc' }).map((l) => l.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(filterListings(all, { ...EMPTY_FILTERS, sort: 'price-desc' }).map((l) => l.id)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('offers the areas and sensible price caps the listings actually have', () => {
    expect(areasOf(all)).toEqual(['Kilimani', 'Westlands']);
    expect(priceStepsOf(all)).toEqual([5000, 10000, 15000]);
  });

  it('builds a WhatsApp link with a ready message', () => {
    expect(whatsappLink('254727589261', 'Hi, is Cozy 1BR free?')).toBe(
      'https://wa.me/254727589261?text=Hi%2C%20is%20Cozy%201BR%20free%3F',
    );
    expect(whatsappLink('', 'x')).toBeNull();
  });

  it('asks the API for a smaller photo size', () => {
    expect(photoSrc('/api/v1/public/photos/abc', 480)).toBe('/api/v1/public/photos/abc?w=480');
    expect(photoSrc(null, 480)).toBeNull();
  });
});
