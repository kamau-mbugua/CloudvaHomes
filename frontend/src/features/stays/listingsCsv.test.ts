import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../lib/csv';
import {
  LISTING_CSV_HEADERS,
  LISTING_CSV_SAMPLE_ROWS,
  listingPayload,
  validateListingCsvRow,
} from './listingsCsv';

function rowsOf(text: string) {
  return parseCsv(text).rows;
}

describe('host listings CSV', () => {
  const header =
    'property_name,property_code,location,unit_number,title,nightly_price,weekend_price,cleaning_fee,max_guests,bedrooms,bathrooms,min_nights,amenities,published';

  it('reads a full row into what the listing API needs (whole shillings → minor units)', () => {
    const rows = rowsOf(
      `${header}\nMakini Court,mkc,"Kilimani, Nairobi",101,Cozy 1BR,"4,500",KES 5000,500,2,1,1,2,Wi-Fi;Balcony;Smart TV,yes`,
    );
    const res = validateListingCsvRow(rows[0]!, rows);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({
      propertyName: 'Makini Court',
      propertyCode: 'MKC',
      location: 'Kilimani, Nairobi',
      unitNumber: '101',
      title: 'Cozy 1BR',
      nightlyMinor: '450000',
      weekendMinor: '500000',
      cleaningMinor: '50000',
      maxGuests: 2,
      bedrooms: 1,
      bathrooms: 1,
      minNights: 2,
      amenities: ['Wi-Fi', 'Balcony', 'Smart TV'],
      published: true,
    });
    expect(listingPayload(res.data, 'prop-1')).toEqual({
      propertyId: 'prop-1',
      unitNumber: '101',
      title: 'Cozy 1BR',
      nightlyPrice: '450000',
      weekendPrice: '500000',
      cleaningFee: '50000',
      maxGuests: 2,
      bedrooms: 1,
      bathrooms: 1,
      minNights: 2,
      amenities: ['Wi-Fi', 'Balcony', 'Smart TV'],
      published: true,
    });
  });

  it('fills sensible defaults and stays unpublished unless asked', () => {
    const rows = rowsOf('property_name,unit_number,title,nightly_price\nGarden Court,G1,Garden Cottage,3500');
    const res = validateListingCsvRow(rows[0]!, rows);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({
      propertyCode: '',
      cleaningMinor: '0',
      weekendMinor: null,
      maxGuests: 2,
      bedrooms: 1,
      bathrooms: 1,
      minNights: 1,
      amenities: [],
      published: false,
    });
  });

  it('says plainly what is wrong with a row', () => {
    const check = (line: string) => {
      const rows = rowsOf(`property_name,unit_number,title,nightly_price,max_guests\n${line}`);
      const res = validateListingCsvRow(rows[0]!, rows);
      return res.ok ? null : res.error;
    };
    expect(check(',101,Cozy,4500,2')).toBe('Add the property name.');
    expect(check('Makini,,Cozy,4500,2')).toBe('Add the unit number.');
    expect(check('Makini,101,,4500,2')).toBe('Add a listing title.');
    expect(check('Makini,101,Cozy,,2')).toBe('Add the nightly price.');
    expect(check('Makini,101,Cozy,4500.50,2')).toBe('Nightly price must be whole shillings, e.g. 4500.');
    expect(check('Makini,101,Cozy,0,2')).toBe('Nightly price must be more than 0.');
    expect(check('Makini,101,Cozy,4500,0')).toBe('Max guests must be a whole number from 1 to 50.');
  });

  it('flags the same unit listed twice in one file', () => {
    const rows = rowsOf('property_name,unit_number,title,nightly_price\nMakini,101,A,4500\nmakini,101,B,4600');
    expect(validateListingCsvRow(rows[0]!, rows).ok).toBe(true);
    const second = validateListingCsvRow(rows[1]!, rows);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe('Unit 101 of Makini is already on line 2.');
  });

  it('ships a template whose sample rows pass', () => {
    const csv = [LISTING_CSV_HEADERS.join(','), ...LISTING_CSV_SAMPLE_ROWS.map((r) => r.map((c) => (String(c).includes(',') ? `"${c}"` : c)).join(','))].join('\n');
    const rows = rowsOf(csv);
    expect(rows.length).toBe(LISTING_CSV_SAMPLE_ROWS.length);
    for (const r of rows) expect(validateListingCsvRow(r, rows).ok).toBe(true);
  });
});
