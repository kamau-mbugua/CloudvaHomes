import type { TrendPoint } from '../reports/types';

export interface HostReportUnitRow {
  unitId: string;
  listingId: string;
  unitNumber: string;
  title: string;
  property: { id: string; code: string; name: string };
  received: string;
  refunded: string;
  bookedValue: string;
  unitExpenses: string;
  sharedExpenses: string;
  expenses: string;
  profit: string;
  nights: number;
  occupancy: number;
  adr: string;
}

export interface HostReportTotals {
  received: string;
  refunded: string;
  bookedValue: string;
  unitExpenses: string;
  sharedExpenses: string;
  expenses: string;
  profit: string;
  nights: number;
  occupancy: number;
  adr: string;
}

export interface HostReportMonthly {
  period: string;
  received: string;
  refunded: string;
  expenses: string;
  profit: string;
  bookedValue: string;
}

export interface HostReportSummary {
  rows: HostReportUnitRow[];
  totals: HostReportTotals;
  sharedByProperty: {
    property: { id: string; code: string; name: string };
    sharedExpenses: string;
  }[];
  monthly: HostReportMonthly[];
}

export interface HostGuestRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  doNotAccept: boolean;
  idNumberHint: string | null;
  stays: number;
  /** Missing without stay-payments:view. */
  totalPaid?: string;
  lastStay: string | null;
}

export interface HostGuestStay {
  id: string;
  code: string;
  status: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  total?: string;
  amountPaid?: string;
  amountRefunded?: string;
  listing: { id: string; title: string };
  unit: { id: string; number: string };
  property: { id: string; code: string; name: string };
}

export interface HostGuestDetail {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  doNotAccept: boolean;
  idNumberHint: string | null;
  totalPaid?: string;
  staysCount: number;
  stays: HostGuestStay[];
}

export interface HostCleaningTask {
  id: string;
  status: 'OPEN' | 'DONE';
  unit: { id: string; number: string; title: string };
  property: { id: string; code: string; name: string };
  booking?: { id: string; code: string; checkOut: string } | null;
  since: string;
  nextCheckIn: string | null;
  note: string | null;
  doneAt: string | null;
  doneById: string | null;
}

export function verifyTotalsRowMatchesApi(summary: HostReportSummary): boolean {
  let received = 0n;
  let refunded = 0n;
  let bookedValue = 0n;
  let expenses = 0n;
  let profit = 0n;
  let nights = 0;

  for (const r of summary.rows) {
    received += BigInt(r.received || '0');
    refunded += BigInt(r.refunded || '0');
    bookedValue += BigInt(r.bookedValue || '0');
    expenses += BigInt(r.expenses || '0');
    profit += BigInt(r.profit || '0');
    nights += r.nights;
  }

  return (
    received.toString() === summary.totals.received &&
    refunded.toString() === summary.totals.refunded &&
    bookedValue.toString() === summary.totals.bookedValue &&
    expenses.toString() === summary.totals.expenses &&
    profit.toString() === summary.totals.profit &&
    nights === summary.totals.nights
  );
}

export function toHostTrendPoints(monthly: HostReportMonthly[]): TrendPoint[] {
  return monthly.map((m) => ({
    period: m.period,
    invoiced: Number(m.bookedValue || '0'),
    collected: Number(m.received || '0'),
    expenses: Number(m.expenses || '0'),
  }));
}

export function formatGuestIdDisplay(guest: { idNumberHint: string | null }): string {
  return guest.idNumberHint ? guest.idNumberHint : 'Not recorded';
}
