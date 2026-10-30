import type { Response } from 'express';
import { toMajorString } from '../money/money.js';

/**
 * CSV for spreadsheets: UTF-8 with a BOM (so Excel reads "KES" and names correctly), CRLF
 * line endings, every field quoted when needed. Cells starting with = + - @ are prefixed with
 * an apostrophe so a spreadsheet never runs them as formulas (CSV injection).
 */
export type Cell = string | number | bigint | null | undefined;

export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'bigint' ? toMajorString(v) : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return `﻿${[headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function sendCsv(res: Response, filename: string, csv: string): string {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return csv;
}

export interface ParsedCsvRow {
  rowNumber: number;
  values: Record<string, string>;
}

/**
 * Parses a UTF-8 CSV string (RFC 4180: handles BOM, CRLF/LF, and quoted fields).
 * Header keys are normalised to lowercase alphanumeric (e.g. `Property Code` -> `propertycode`,
 * `rentAmount` -> `rentamount`) so templates with either camelCase or spaced headers work.
 */
export function parseCsv(raw: string): { headers: string[]; rows: ParsedCsvRow[] } {
  const text = raw.replace(/^\uFEFF/, '');
  const rawLines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      currentRow.push(currentField.trim());
      rawLines.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rawLines.push(currentRow);
  }

  if (rawLines.length === 0) return { headers: [], rows: [] };

  const normalizeHeader = (h: string) => h.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const rawHeaders = rawLines[0]!;
  const headers = rawHeaders.map(normalizeHeader);
  const rows: ParsedCsvRow[] = [];

  for (let idx = 1; idx < rawLines.length; idx++) {
    const cells = rawLines[idx]!;
    if (cells.every((c) => c === '')) continue;
    const values: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (key) values[key] = cells[c] ?? '';
    }
    rows.push({ rowNumber: idx + 1, values });
  }

  return { headers, rows };
}
