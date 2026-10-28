import type { LandlordKind, Occupancy, RecordStatus, TenancyStatus, TenantStatus } from './types';

/**
 * Words and badge tones for the portfolio's states, in one place so a unit reads
 * "On notice" on every screen. Unknown values (a newer server) fall back to the raw value
 * in a neutral badge rather than breaking the row.
 */

export interface Label {
  label: string;
  tone: string;
}

export const OCCUPANCY: Record<Occupancy, Label> = {
  OCCUPIED: { label: 'Occupied', tone: 'ad__badge--ok' },
  NOTICE: { label: 'On notice', tone: 'ad__badge--warn' },
  VACANT: { label: 'Vacant', tone: 'ad__badge--info' },
};

export const TENANCY_STATUS: Record<TenancyStatus, Label> = {
  ACTIVE: { label: 'Active', tone: 'ad__badge--ok' },
  NOTICE: { label: 'On notice', tone: 'ad__badge--warn' },
  ENDED: { label: 'Ended', tone: 'ad__badge--off' },
};

export const TENANT_STATUS: Record<TenantStatus, Label> = {
  CURRENT: { label: 'Current', tone: 'ad__badge--ok' },
  PAST: { label: 'Past', tone: 'ad__badge--off' },
  PROSPECT: { label: 'Prospect', tone: 'ad__badge--info' },
};

export const RECORD_STATUS: Record<RecordStatus, Label> = {
  ACTIVE: { label: 'Active', tone: 'ad__badge--ok' },
  INACTIVE: { label: 'Inactive', tone: 'ad__badge--off' },
};

export const LANDLORD_KIND: Record<LandlordKind, string> = {
  INDIVIDUAL: 'Individual',
  COMPANY: 'Company',
};

/** The label for `value` in `table`, or the raw value in a neutral tone. */
export function labelFor<K extends string>(table: Record<K, Label>, value: string): Label {
  return (table as Record<string, Label | undefined>)[value] ?? { label: value, tone: 'ad__badge--off' };
}

/** Options for a filter `<select>`, in the table's order. */
export function optionsOf<K extends string>(table: Record<K, Label>): { value: K; label: string }[] {
  return (Object.keys(table) as K[]).map((value) => ({ value, label: table[value].label }));
}

/** "Wanjiru Kamau". */
export function personName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

/** "A4 · Kilimani Court". */
export function unitLabel(unit: { number: string; property: { name: string } }): string {
  return `${unit.number} · ${unit.property.name}`;
}

/** Billing day defaults to the start date's day of the month, capped at 28 so every month has it. */
export function defaultBillingDay(startDate: string): number | null {
  const match = /^\d{4}-\d{2}-(\d{2})$/.exec(startDate);
  if (!match) return null;
  const day = Number(match[1]);
  if (day < 1 || day > 31) return null;
  return Math.min(day, 28);
}
