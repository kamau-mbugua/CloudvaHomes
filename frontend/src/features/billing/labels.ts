import type { Label } from '../portfolio/labels';
import type { ChargeKind, InvoiceKind, InvoiceStatus, LineKind, MoveInKind } from './types';

/** Words and badge tones for billing states — one place, so "Part paid" reads the same everywhere. */

export const INVOICE_STATUS: Record<InvoiceStatus, Label> = {
  ISSUED: { label: 'Issued', tone: 'ad__badge--info' },
  PARTIALLY_PAID: { label: 'Part paid', tone: 'ad__badge--warn' },
  PAID: { label: 'Paid', tone: 'ad__badge--ok' },
  VOID: { label: 'Void', tone: 'ad__badge--off' },
};

export const OVERDUE: Label = { label: 'Overdue', tone: 'ad__badge--alert' };

export const INVOICE_KIND: Record<InvoiceKind, Label> = {
  MONTHLY: { label: 'Monthly', tone: 'ad__badge--off' },
  MOVE_IN: { label: 'Move-in', tone: 'ad__badge--off' },
  ADHOC: { label: 'One-off', tone: 'ad__badge--off' },
};

export const CHARGE_KIND: Record<ChargeKind, Label> = {
  FIXED: { label: 'Fixed', tone: 'ad__badge--info' },
  VARIABLE: { label: 'Variable', tone: 'ad__badge--warn' },
  METERED: { label: 'Metered', tone: 'ad__badge--ok' },
};

export const CHARGE_KIND_HINT: Record<ChargeKind, string> = {
  FIXED: 'The same amount every month, e.g. garbage or service charge.',
  VARIABLE: 'An amount you enter per unit each month.',
  METERED: 'Billed from meter readings: consumption × rate.',
};

export const MOVE_IN_KIND: Record<MoveInKind, Label> = {
  DEPOSIT: { label: 'Deposit', tone: 'ad__badge--info' },
  FEE: { label: 'Fee', tone: 'ad__badge--off' },
};

export const LINE_KIND: Record<LineKind, string> = {
  RENT: 'Rent',
  CHARGE: 'Charge',
  MOVE_IN: 'Move-in',
  ADJUSTMENT: 'Adjustment',
};
