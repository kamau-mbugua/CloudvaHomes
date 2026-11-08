import type { CsvColumnSpec } from '../../components/CsvImportSheet';
import { getCell, splitListCell, type ParsedCsvRow } from '../../lib/csv';

/**
 * Host listings CSV: one row = one listing (a unit with its nightly price) in a property.
 * Pure rules for ListingsCsvImportSheet: read a row, check it, build the listing API body.
 * Money is typed in whole shillings and sent as minor units (×100), like the listing form.
 */

export interface ListingCsvData {
  propertyName: string;
  /** Upper-cased; empty = derive one from the name when the property is new. */
  propertyCode: string;
  location: string;
  county: string;
  unitNumber: string;
  title: string;
  description: string;
  area: string;
  nightlyMinor: string;
  weekendMinor: string | null;
  cleaningMinor: string;
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  minNights: number;
  amenities: string[];
  checkInInstructions: string;
  published: boolean;
}

export const LISTING_CSV_HEADERS = [
  'property_name',
  'property_code',
  'location',
  'county',
  'unit_number',
  'title',
  'nightly_price',
  'weekend_price',
  'cleaning_fee',
  'max_guests',
  'bedrooms',
  'bathrooms',
  'min_nights',
  'amenities',
  'area',
  'description',
  'check_in_instructions',
  'published',
];

export const LISTING_CSV_SAMPLE_ROWS: (string | number)[][] = [
  ['Makini Court', 'MKC', 'Kilimani, Nairobi', 'Nairobi', '101', 'Cozy 1BR with balcony', 4500, 5000, 500, 2, 1, 1, 1, 'Wi-Fi;Balcony;Smart TV', 'Kilimani', 'Quiet one-bedroom near Yaya Centre.', 'Collect keys from the guard.', 'no'],
  ['Makini Court', 'MKC', 'Kilimani, Nairobi', 'Nairobi', '102', 'Family 2BR', 7500, '', 800, 4, 2, 2, 2, 'Wi-Fi;Parking;Kitchen', 'Kilimani', '', '', 'no'],
  ['Westlands Court', 'WST', 'Westlands, Nairobi', 'Nairobi', 'A1', 'Studio near Sarit', 3500, '', 0, 2, 0, 1, 1, 'Wi-Fi;Backup generator', 'Westlands', '', '', 'no'],
];

export const LISTING_CSV_COLUMNS: CsvColumnSpec[] = [
  { name: 'property_name', required: true, description: 'The building or compound. Created if it does not exist yet.', example: 'Makini Court' },
  { name: 'property_code', description: 'Short unique code (used on paybill references). Made from the name if left empty.', example: 'MKC' },
  { name: 'location', description: 'Street or area of the property (new properties only).', example: 'Kilimani, Nairobi' },
  { name: 'county', description: 'County of the property (new properties only).', example: 'Nairobi' },
  { name: 'unit_number', required: true, description: 'Unit inside the property. If the unit already exists (e.g. from an earlier import) it becomes this listing.', example: '101' },
  { name: 'title', required: true, description: 'What guests see on your booking site.', example: 'Cozy 1BR with balcony' },
  { name: 'nightly_price', required: true, description: 'Price per night, whole shillings.', example: '4500' },
  { name: 'weekend_price', description: 'Friday and Saturday nights, whole shillings.', example: '5000' },
  { name: 'cleaning_fee', description: 'Once per stay, whole shillings. Default 0.', example: '500' },
  { name: 'max_guests', description: 'Default 2.', example: '2' },
  { name: 'bedrooms', description: '0 for a studio. Default 1.', example: '1' },
  { name: 'bathrooms', description: 'Default 1.', example: '1' },
  { name: 'min_nights', description: 'Shortest stay. Default 1.', example: '1' },
  { name: 'amenities', description: 'Separated by ; (semicolon).', example: 'Wi-Fi;Balcony;Smart TV' },
  { name: 'area', description: 'Neighbourhood shown on the listing card.', example: 'Kilimani' },
  { name: 'description', description: 'About the stay.', example: 'Quiet one-bedroom near Yaya Centre.' },
  { name: 'check_in_instructions', description: 'Shared only with confirmed guests.', example: 'Collect keys from the guard.' },
  { name: 'published', description: 'yes = show on your booking site now. Default no (add photos first).', example: 'no' },
];

type Check<T> = { ok: true; value: T } | { ok: false; error: string };

function wholeShillings(raw: string, label: string, opts: { allowZero?: boolean } = {}): Check<string> {
  const cleaned = raw.replace(/kes|ksh/gi, '').replace(/[\s,]/g, '');
  if (!/^\d+$/.test(cleaned)) {
    return { ok: false, error: `${label} must be whole shillings, e.g. ${label === 'Nightly price' ? '4500' : '500'}.` };
  }
  const n = BigInt(cleaned);
  if (n === 0n && !opts.allowZero) return { ok: false, error: `${label} must be more than 0.` };
  return { ok: true, value: (n * 100n).toString() };
}

function wholeNumber(raw: string, label: string, min: number, max: number, fallback: number): Check<number> {
  if (!raw) return { ok: true, value: fallback };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    return { ok: false, error: `${label} must be a whole number from ${min} to ${max}.` };
  }
  return { ok: true, value: n };
}

function yesNo(raw: string): Check<boolean> {
  const v = raw.trim().toLowerCase();
  if (['', 'no', 'n', 'false', '0', 'draft'].includes(v)) return { ok: true, value: false };
  if (['yes', 'y', 'true', '1', 'published'].includes(v)) return { ok: true, value: true };
  return { ok: false, error: 'Published must be yes or no.' };
}

const unitKey = (code: string, name: string, unit: string) =>
  `${(code || name).trim().toLowerCase()}::${unit.trim().toLowerCase()}`;

export function validateListingCsvRow(
  row: ParsedCsvRow,
  allRows: ParsedCsvRow[],
):
  | { ok: true; data: ListingCsvData; cells: Record<string, string> }
  | { ok: false; error: string; cells: Record<string, string> } {
  const propertyName = getCell(row, 'property_name', 'property');
  const propertyCode = getCell(row, 'property_code', 'code').toUpperCase();
  const unitNumber = getCell(row, 'unit_number', 'unit');
  const title = getCell(row, 'title', 'listing_title', 'name');
  const nightlyRaw = getCell(row, 'nightly_price', 'nightly', 'price');
  const cells = {
    property: propertyCode ? `${propertyName} (${propertyCode})` : propertyName,
    unit: unitNumber,
    title,
    nightly: nightlyRaw,
  };
  const fail = (error: string) => ({ ok: false as const, error, cells });

  if (!propertyName) return fail('Add the property name.');
  if (!unitNumber) return fail('Add the unit number.');
  if (!title) return fail('Add a listing title.');
  if (!nightlyRaw) return fail('Add the nightly price.');

  const nightly = wholeShillings(nightlyRaw, 'Nightly price');
  if (!nightly.ok) return fail(nightly.error);
  const weekendRaw = getCell(row, 'weekend_price', 'weekend');
  const weekend = weekendRaw ? wholeShillings(weekendRaw, 'Weekend price') : null;
  if (weekend && !weekend.ok) return fail(weekend.error);
  const cleaningRaw = getCell(row, 'cleaning_fee', 'cleaning');
  const cleaning = cleaningRaw
    ? wholeShillings(cleaningRaw, 'Cleaning fee', { allowZero: true })
    : ({ ok: true, value: '0' } as const);
  if (!cleaning.ok) return fail(cleaning.error);

  const maxGuests = wholeNumber(getCell(row, 'max_guests', 'guests'), 'Max guests', 1, 50, 2);
  if (!maxGuests.ok) return fail(maxGuests.error);
  const bedrooms = wholeNumber(getCell(row, 'bedrooms'), 'Bedrooms', 0, 20, 1);
  if (!bedrooms.ok) return fail(bedrooms.error);
  const bathrooms = wholeNumber(getCell(row, 'bathrooms'), 'Bathrooms', 0, 20, 1);
  if (!bathrooms.ok) return fail(bathrooms.error);
  const minNights = wholeNumber(getCell(row, 'min_nights'), 'Min nights', 1, 365, 1);
  if (!minNights.ok) return fail(minNights.error);
  const published = yesNo(getCell(row, 'published', 'publish'));
  if (!published.ok) return fail(published.error);

  const key = unitKey(propertyCode, propertyName, unitNumber);
  const earlier = allRows.find(
    (r) =>
      r.rowNumber < row.rowNumber &&
      unitKey(
        getCell(r, 'property_code', 'code').toUpperCase(),
        getCell(r, 'property_name', 'property'),
        getCell(r, 'unit_number', 'unit'),
      ) === key,
  );
  if (earlier) {
    return fail(
      `Unit ${unitNumber} of ${getCell(earlier, 'property_name', 'property')} is already on line ${earlier.rowNumber}.`,
    );
  }

  return {
    ok: true,
    cells,
    data: {
      propertyName,
      propertyCode,
      location: getCell(row, 'location'),
      county: getCell(row, 'county'),
      unitNumber,
      title,
      description: getCell(row, 'description'),
      area: getCell(row, 'area'),
      nightlyMinor: nightly.value,
      weekendMinor: weekend ? (weekend.ok ? weekend.value : null) : null,
      cleaningMinor: cleaning.value,
      maxGuests: maxGuests.value,
      bedrooms: bedrooms.value,
      bathrooms: bathrooms.value,
      minNights: minNights.value,
      amenities: splitListCell(getCell(row, 'amenities')),
      checkInInstructions: getCell(row, 'check_in_instructions', 'check_in'),
      published: published.value,
    },
  };
}

/** Body for POST /host/listings. Empty optional text is left out. */
export function listingPayload(d: ListingCsvData, propertyId: string): Record<string, unknown> {
  return {
    propertyId,
    unitNumber: d.unitNumber,
    title: d.title,
    ...(d.description ? { description: d.description } : {}),
    ...(d.area ? { area: d.area } : {}),
    nightlyPrice: d.nightlyMinor,
    ...(d.weekendMinor ? { weekendPrice: d.weekendMinor } : {}),
    cleaningFee: d.cleaningMinor,
    maxGuests: d.maxGuests,
    bedrooms: d.bedrooms,
    bathrooms: d.bathrooms,
    minNights: d.minNights,
    amenities: d.amenities,
    ...(d.checkInInstructions ? { checkInInstructions: d.checkInInstructions } : {}),
    published: d.published,
  };
}
