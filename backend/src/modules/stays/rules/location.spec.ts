import { describe, expect, it } from 'vitest';
import { locationOf, mapLink, parseCoordinates, shortMapLink } from './location.js';

const loc = {
  address: 'Makini Court, Kilimani',
  lat: -1.2920659,
  lng: 36.787194,
  placeId: 'ChIJabc',
};

describe('listing location', () => {
  it('is set only with an address and both coordinates', () => {
    expect(locationOf(loc)).toEqual(loc);
    expect(locationOf({ ...loc, lat: null })).toBeNull();
    expect(locationOf({ ...loc, address: null })).toBeNull();
  });

  it('makes a short link for SMS and a named-place link for email', () => {
    expect(shortMapLink(loc)).toBe('https://maps.google.com/?q=-1.292066,36.787194');
    expect(shortMapLink(loc).length).toBeLessThan(50);
    expect(mapLink(loc)).toBe(
      'https://www.google.com/maps/search/?api=1&query=-1.292066,36.787194&query_place_id=ChIJabc',
    );
    expect(mapLink({ ...loc, placeId: null })).toBe(
      'https://www.google.com/maps/search/?api=1&query=-1.292066,36.787194',
    );
  });

  it('reads coordinates from pasted Google Maps links or plain text', () => {
    const want = { lat: -1.2921, lng: 36.8219 };
    expect(parseCoordinates('https://www.google.com/maps/@-1.2921,36.8219,17z')).toEqual(want);
    expect(parseCoordinates('https://maps.google.com/?q=-1.2921,36.8219')).toEqual(want);
    expect(
      parseCoordinates('https://www.google.com/maps/place/X/data=!3m1!4b1!4m6!3d-1.2921!4d36.8219'),
    ).toEqual(want);
    expect(parseCoordinates(' -1.2921 , 36.8219 ')).toEqual(want);
    expect(parseCoordinates('Kilimani, Nairobi')).toBeNull();
    expect(parseCoordinates('95, 36.8')).toBeNull();
  });
});
