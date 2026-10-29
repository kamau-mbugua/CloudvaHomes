import { describe, expect, it } from 'vitest';
import {
  derivePropertyCode,
  escapeCsvCell,
  getCell,
  normalizeDateCell,
  normalizeHeader,
  normalizePeriodCell,
  parseCsv,
  serializeCsv,
  splitListCell,
} from './csv';

describe('csv utilities', () => {
  it('normalizes headers to snake_case', () => {
    expect(normalizeHeader('Property Name')).toBe('property_name');
    expect(normalizeHeader('unitNumber')).toBe('unit_number');
    expect(normalizeHeader('\uFEFFRent (KES)')).toBe('rent_kes');
    expect(normalizeHeader('Size (sq ft)')).toBe('size_sq_ft');
  });

  it('parses RFC-4180 CSV with quoted commas, escaped quotes, and ignores blank or # lines', () => {
    const raw = [
      '\uFEFFProperty Name,Unit Number,Rent Amount,Unit Features,Description',
      '# Comment line to ignore',
      '"Ivory Breeze, Kilimani",A1,"35,000","Balcony;Parking","Corner unit, ""executive"" finish"',
      '',
      'Palm Court,B2,22000,Parking,Standard 1BR',
    ].join('\r\n');

    const parsed = parseCsv(raw);
    expect(parsed.headers).toEqual([
      'property_name',
      'unit_number',
      'rent_amount',
      'unit_features',
      'description',
    ]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].rowNumber).toBe(3);
    expect(getCell(parsed.rows[0], 'property_name')).toBe('Ivory Breeze, Kilimani');
    expect(getCell(parsed.rows[0], 'unit', 'unit_number')).toBe('A1');
    expect(getCell(parsed.rows[0], 'rent_amount')).toBe('35,000');
    expect(getCell(parsed.rows[0], 'description')).toBe('Corner unit, "executive" finish');
    expect(parsed.rows[1].rowNumber).toBe(5);
    expect(getCell(parsed.rows[1], 'property_name')).toBe('Palm Court');
  });

  it('auto-detects tab-separated spreadsheet paste', () => {
    const tsv = 'first_name\tlast_name\tphone\nGrace\tWanjiku\t0712345678';
    const parsed = parseCsv(tsv);
    expect(parsed.rows).toHaveLength(1);
    expect(getCell(parsed.rows[0], 'firstName')).toBe('Grace');
    expect(getCell(parsed.rows[0], 'phone')).toBe('0712345678');
  });

  it('normalizes dates in YYYY-MM-DD and DD/MM/YYYY formats', () => {
    expect(normalizeDateCell('2026-10-29')).toBe('2026-10-29');
    expect(normalizeDateCell('29/10/2026')).toBe('2026-10-29');
    expect(normalizeDateCell('5-11-2026')).toBe('2026-11-05');
    expect(normalizeDateCell('2026-02-30')).toBeNull();
    expect(normalizeDateCell('not-a-date')).toBeNull();
  });

  it('normalizes billing periods in YYYY-MM and MM/YYYY formats', () => {
    expect(normalizePeriodCell('2026-10')).toBe('2026-10');
    expect(normalizePeriodCell('10/2026')).toBe('2026-10');
    expect(normalizePeriodCell('3/2026')).toBe('2026-03');
    expect(normalizePeriodCell('2026/09')).toBe('2026-09');
    expect(normalizePeriodCell('2026-13')).toBeNull();
  });

  it('splits list cells and deduplicates case-insensitively', () => {
    expect(splitListCell('Balcony; Parking; balcony; En-suite')).toEqual([
      'Balcony',
      'Parking',
      'En-suite',
    ]);
    expect(splitListCell('A1, A2, B1')).toEqual(['A1', 'A2', 'B1']);
  });

  it('derives unique property codes when property_code is omitted', () => {
    const taken = new Set<string>(['IVB']);
    const code1 = derivePropertyCode('Ivory Breeze Apartments', taken);
    expect(code1).toBe('IBA');
    const code2 = derivePropertyCode('Ivory Breeze Annex', taken);
    expect(code2).toBe('IBA1');
  });

  it('serializes and escapes CSV cells properly', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('has, comma')).toBe('"has, comma"');
    expect(escapeCsvCell('has "quote"')).toBe('"has ""quote"""');
    const csv = serializeCsv(['name', 'note'], [['A1', 'Front, "best"']]);
    expect(csv).toBe('name,note\r\nA1,"Front, ""best"""\r\n');
  });
});
