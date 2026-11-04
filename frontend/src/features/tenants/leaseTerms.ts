import { formatDay } from '../../lib/dates';
import { formatKES, parseAmount } from '../../lib/money';
import { formatPeriod } from '../../lib/periods';

/**
 * Lease end dates and scheduled rent changes (phase 13): validation for the "Renew lease"
 * and "Change rent" sheets, and how they read on tenancy rows.
 */

export interface RentChangeDraft {
  newRent: string;
  /** YYYY-MM */
  effectivePeriod: string;
  note: string;
  notifyTenant: boolean;
}

export type CheckedRentChange =
  | { ok: true; body: { newRent: number; effectivePeriod: string; note?: string; notifyTenant: boolean } }
  | { ok: false; errors: Partial<Record<'newRent' | 'effectivePeriod', string>> };

export function checkRentChange(d: RentChangeDraft): CheckedRentChange {
  const errors: Partial<Record<'newRent' | 'effectivePeriod', string>> = {};
  const rent = parseAmount(d.newRent);
  if (!rent.ok) errors.newRent = rent.error;
  else if (rent.minor <= 0) errors.newRent = 'Enter a rent above zero.';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(d.effectivePeriod)) errors.effectivePeriod = 'Choose the first month at the new rent.';
  if (Object.keys(errors).length || !rent.ok) return { ok: false, errors };
  const note = d.note.trim();
  return { ok: true, body: { newRent: rent.minor, effectivePeriod: d.effectivePeriod, ...(note ? { note } : {}), notifyTenant: d.notifyTenant } };
}

export interface RenewalDraft {
  leaseEndDate: string;
  changeRent: boolean;
  newRent: string;
  effectivePeriod: string;
  notifyTenant: boolean;
}

type RenewalField = 'leaseEndDate' | 'newRent' | 'effectivePeriod';
export type CheckedRenewal =
  | { ok: true; body: { leaseEndDate: string; newRent?: number; effectivePeriod?: string; notifyTenant?: boolean } }
  | { ok: false; errors: Partial<Record<RenewalField, string>> };

export function checkRenewal(d: RenewalDraft, startDate: string): CheckedRenewal {
  const errors: Partial<Record<RenewalField, string>> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.leaseEndDate)) errors.leaseEndDate = 'Choose the new lease end date.';
  else if (d.leaseEndDate <= startDate) errors.leaseEndDate = `The lease must end after the move-in date (${formatDay(startDate)}).`;
  let rentChange: CheckedRentChange | null = null;
  if (d.changeRent) {
    rentChange = checkRentChange({ newRent: d.newRent, effectivePeriod: d.effectivePeriod, note: '', notifyTenant: d.notifyTenant });
    if (!rentChange.ok) Object.assign(errors, rentChange.errors);
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  if (rentChange?.ok) {
    return {
      ok: true,
      body: { leaseEndDate: d.leaseEndDate, newRent: rentChange.body.newRent, effectivePeriod: rentChange.body.effectivePeriod, notifyTenant: d.notifyTenant },
    };
  }
  return { ok: true, body: { leaseEndDate: d.leaseEndDate } };
}

/** "Lease ends 20 Dec 2026"; `soon` = ended or ending within 60 days (worth flagging). */
export function leaseEndText(leaseEndDate: string | null | undefined, today: string): { text: string; soon: boolean } {
  if (!leaseEndDate) return { text: 'No end date', soon: false };
  const days = Math.round((Date.parse(`${leaseEndDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return {
    text: `${days < 0 ? 'Lease ended' : 'Lease ends'} ${formatDay(leaseEndDate)}`,
    soon: days <= 60,
  };
}

export function pendingChangeText(c: { effectivePeriod: string; newRent: number }): string {
  return `Rent changes to ${formatKES(c.newRent)} from ${formatPeriod(c.effectivePeriod)}`;
}
