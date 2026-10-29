import { isDay } from './dates';

/**
 * RFC-4180 CSV parser, serializer, header normalizer, and helper utilities for
 * onboarding CSV imports across Portfolio, Tenants, Meters & Readings, Charges,
 * and Expenses.
 */

export interface ParsedCsvRow {
  /** 1-based line number in the CSV file (header is line 1, first data row is >= 2). */
  rowNumber: number;
  /** Raw values keyed by normalized header name (`snake_case`). */
  values: Record<string, string>;
}

export interface ParsedCsv {
  /** Original header labels as written in row 1. */
  rawHeaders: string[];
  /** Normalized (`snake_case`) header keys corresponding to `rawHeaders`. */
  headers: string[];
  /** Non-empty data rows. */
  rows: ParsedCsvRow[];
}

/**
 * Converts any column header into a canonical snake_case key:
 * - `"Property Name"` -> `"property_name"`
 * - `"propertyName"` -> `"property_name"`
 * - `"Rent (KES)"` -> `"rent_kes"`
 * - `"Unit #"` -> `"unit"`
 */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Reads the first non-empty value among the given header aliases on a parsed row.
 */
export function getCell(row: ParsedCsvRow | Record<string, string>, ...aliases: string[]): string {
  const map = 'values' in row && typeof row.values === 'object' ? row.values : (row as Record<string, string>);
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    const val = map[key];
    if (val !== undefined && val.trim() !== '') {
      return val.trim();
    }
  }
  return '';
}

/**
 * Parses CSV text (comma- or semicolon-delimited, auto-detected on the header line)
 * into raw headers, normalized headers, and data rows.
 */
export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^\uFEFF/, '');
  if (!text.trim()) {
    return { rawHeaders: [], headers: [], rows: [] };
  }

  // Auto-detect delimiter from the first line (comma vs semicolon vs tab)
  const firstNewline = text.search(/\r?\n/);
  const firstLine = firstNewline === -1 ? text : text.slice(0, firstNewline);
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semiCount = (firstLine.match(/;/g) ?? []).length;
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const delimiter = tabCount > commaCount && tabCount > semiCount
    ? '\t'
    : semiCount > commaCount
      ? ';'
      : ',';

  const rawRows: { line: number; cells: string[] }[] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentCell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line += 1;
        else if (ch === '\r' && text[i + 1] !== '\n') line += 1;
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"' && currentCell.trim() === '') {
      inQuotes = true;
      continue;
    }

    if (ch === delimiter) {
      currentRow.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      currentRow.push(currentCell.trim());
      rawRows.push({ line: rowStartLine, cells: currentRow });
      currentRow = [];
      currentCell = '';
      if (ch === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      line += 1;
      rowStartLine = line;
      continue;
    }

    currentCell += ch;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rawRows.push({ line: rowStartLine, cells: currentRow });
  }

  // Filter out blank lines and comment lines starting with #
  const nonEmpty = rawRows.filter((r) => {
    const nonBlank = r.cells.some((c) => c !== '');
    if (!nonBlank) return false;
    const first = r.cells[0] ?? '';
    return !first.startsWith('#');
  });

  if (nonEmpty.length === 0) {
    return { rawHeaders: [], headers: [], rows: [] };
  }

  const rawHeaders = nonEmpty[0].cells;
  const headers = rawHeaders.map(normalizeHeader);

  const rows: ParsedCsvRow[] = nonEmpty.slice(1).map((r) => {
    const values: Record<string, string> = {};
    for (let idx = 0; idx < headers.length; idx += 1) {
      const key = headers[idx];
      if (!key) continue;
      const cellVal = r.cells[idx] ?? '';
      // If duplicate header columns exist, keep the non-empty one
      if (!values[key] || cellVal !== '') {
        values[key] = cellVal;
      }
    }
    return { rowNumber: r.line, values };
  });

  return { rawHeaders, headers, rows };
}

/**
 * Escapes a single CSV cell according to RFC-4180.
 */
export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Serializes headers and rows into a CSV string.
 */
export function serializeCsv(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Triggers a browser download of a CSV template or export file.
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): void {
  const content = `\uFEFF${serializeCsv(headers, rows)}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Normalizes a date cell (`YYYY-MM-DD`, `DD/MM/YYYY`, or `DD-MM-YYYY`) into `YYYY-MM-DD`.
 * Returns `null` if the string is not a valid calendar date.
 */
export function normalizeDateCell(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (isDay(trimmed)) return trimmed;

  // Match DD/MM/YYYY or DD-MM-YYYY
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    const iso = `${year}-${month}-${day}`;
    if (isDay(iso)) return iso;
  }

  // Match YYYY/MM/DD
  const ymd = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(trimmed);
  if (ymd) {
    const year = ymd[1];
    const month = ymd[2].padStart(2, '0');
    const day = ymd[3].padStart(2, '0');
    const iso = `${year}-${month}-${day}`;
    if (isDay(iso)) return iso;
  }

  return null;
}

/**
 * Normalizes a billing period cell (`YYYY-MM`, `MM/YYYY`, or `YYYY/MM`) into `YYYY-MM`.
 */
export function normalizePeriodCell(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) return trimmed;

  const my = /^(0?[1-9]|1[0-2])[/-](\d{4})$/.exec(trimmed);
  if (my) {
    return `${my[2]}-${my[1].padStart(2, '0')}`;
  }

  const ym = /^(\d{4})\/(0?[1-9]|1[0-2])$/.exec(trimmed);
  if (ym) {
    return `${ym[1]}-${ym[2].padStart(2, '0')}`;
  }

  return null;
}

/**
 * Parses a semicolon-, pipe-, or comma-separated list inside a CSV cell:
 * e.g. `"Balcony; Parking; En-suite"` -> `["Balcony", "Parking", "En-suite"]`.
 */
export function splitListCell(input: string): string[] {
  if (!input.trim()) return [];
  const separator = input.includes(';') ? ';' : input.includes('|') ? '|' : ',';
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input.split(separator)) {
    const item = raw.trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

/**
 * Generates a clean 3–6 character uppercase property code (`A-Z0-9`) from a property name,
 * avoiding any codes already in `takenCodes`. Used when a CSV row omits `property_code`.
 */
export function derivePropertyCode(name: string, takenCodes: Set<string>): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let base = '';
  if (words.length >= 3) {
    base = words.slice(0, 4).map((w) => w[0]).join('');
  } else if (words.length === 2) {
    base = `${words[0].slice(0, 2)}${words[1].slice(0, 2)}`;
  } else if (words.length === 1) {
    const w = words[0];
    const consonants = w.replace(/[AEIOU]/g, '');
    base = (consonants.length >= 3 ? consonants : w).slice(0, 4);
  }
  if (base.length < 2) {
    base = (words.join('') + 'PRP').slice(0, 3);
  }
  base = base.slice(0, 6);

  if (!takenCodes.has(base)) {
    takenCodes.add(base);
    return base;
  }

  for (let n = 1; n <= 999; n += 1) {
    const candidate = `${base.slice(0, 6 - String(n).length)}${n}`;
    if (!takenCodes.has(candidate)) {
      takenCodes.add(candidate);
      return candidate;
    }
  }
  return base;
}
