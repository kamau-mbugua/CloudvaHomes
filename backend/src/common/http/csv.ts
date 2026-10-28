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
