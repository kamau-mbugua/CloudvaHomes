import { describe, expect, it } from 'vitest';
import { embedUrl, mapLink, parseCoordinates, placeAddress } from './location';

const loc = { address: 'Makini Court', lat: -1.2920659, lng: 36.787194, placeId: 'ChIJabc' };

describe('listing location', () => {
  it('links to the named place on Google Maps', () => {
    expect(mapLink(loc)).toBe(
      'https://www.google.com/maps/search/?api=1&query=-1.292066,36.787194&query_place_id=ChIJabc',
    );
    expect(mapLink({ ...loc, placeId: null })).toBe('https://www.google.com/maps/search/?api=1&query=-1.292066,36.787194');
  });

  it('embeds the place, or the coordinates when there is no place ID', () => {
    expect(embedUrl('KEY', loc)).toBe('https://www.google.com/maps/embed/v1/place?key=KEY&q=place_id%3AChIJabc&zoom=16');
    expect(embedUrl('KEY', { ...loc, placeId: null })).toBe(
      'https://www.google.com/maps/embed/v1/place?key=KEY&q=-1.292066%2C36.787194&zoom=16',
    );
  });

  it('reads coordinates from pasted Google Maps links and plain text', () => {
    const want = { lat: -1.2921, lng: 36.8219 };
    expect(parseCoordinates('https://www.google.com/maps/@-1.2921,36.8219,17z')).toEqual(want);
    expect(parseCoordinates('https://maps.google.com/?q=-1.2921,36.8219')).toEqual(want);
    expect(parseCoordinates('https://www.google.com/maps/place/X/data=!4m6!3d-1.2921!4d36.8219')).toEqual(want);
    expect(parseCoordinates('-1.2921, 36.8219')).toEqual(want);
    expect(parseCoordinates('Kilimani')).toBeNull();
    expect(parseCoordinates('95, 10')).toBeNull();
  });

  it('puts the place name in front of the address once', () => {
    expect(placeAddress('Makini Court', 'Argwings Kodhek Rd, Nairobi')).toBe('Makini Court, Argwings Kodhek Rd, Nairobi');
    expect(placeAddress('Yaya Centre', 'Yaya Centre, Argwings Kodhek Rd')).toBe('Yaya Centre, Argwings Kodhek Rd');
    expect(placeAddress(null, 'Argwings Kodhek Rd')).toBe('Argwings Kodhek Rd');
    expect(placeAddress('Makini Court', '')).toBe('Makini Court');
  });
});
