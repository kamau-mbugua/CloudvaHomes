import { formatKES } from '../../lib/money';
import { homeText } from './rules';
import { accountsInScope, type HomeScope } from './scope';
import type { ConsolidatedOverview } from './types';

/**
 * Pure rules behind the tenant dashboard (tenant portal redesign). Money stays per
 * landlord: owed and credit are never netted across different landlords.
 */

export interface LandlordToPay {
  tenantId: string;
  orgName: string;
  owed: number;
  credit: number;
  canPayInApp: boolean;
}

/** One row per landlord account in scope; those owing first, biggest first. */
export function toPayByLandlord(o: ConsolidatedOverview, s: HomeScope): LandlordToPay[] {
  const ids = accountsInScope(o, s);
  return o.accounts
    .filter((a) => ids.includes(a.tenant.id))
    .map((a) => ({
      tenantId: a.tenant.id,
      orgName: a.organization.name,
      owed: Math.max(0, a.balance),
      credit: a.credit,
      canPayInApp: a.canPayInApp,
    }))
    .sort((a, b) => b.owed - a.owed);
}

/** What the hero shows as "to pay": the sum of what each landlord is owed. */
export function heroTotal(rows: readonly LandlordToPay[]): number {
  return rows.reduce((sum, r) => sum + r.owed, 0);
}

export interface TodoItem {
  kind: 'OVERDUE' | 'INSPECTION' | 'LEASE_ENDING';
  text: string;
  link: string;
}

const LEASE_WARNING_DAYS = 60;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Things waiting on the tenant in scope: overdue homes, unchecked inspections, leases ending soon. */
export function todoItems(
  o: ConsolidatedOverview,
  s: HomeScope,
  inspections: readonly { tenancyId: string; kind: string; tenantAcknowledgedAt: string | null }[],
  today: string,
): TodoItem[] {
  const homes = o.tenancies.filter((t) =>
    (t.status === 'ACTIVE' || t.status === 'NOTICE') && (s.kind === 'all' || t.id === s.tenancyId));
  const ids = new Set(homes.map((t) => t.id));
  const name = new Map(homes.map((t) => [t.id, homeText(t)]));
  const out: TodoItem[] = [];
  for (const t of homes) {
    if ((t.overdue ?? 0) > 0) {
      const late = t.daysLate ? `, ${t.daysLate} day${t.daysLate === 1 ? '' : 's'} late` : '';
      out.push({ kind: 'OVERDUE', text: `${homeText(t)}: ${formatKES(t.overdue!)} overdue${late}`, link: '/tenant/invoices' });
    }
  }
  for (const i of inspections) {
    if (!ids.has(i.tenancyId) || i.tenantAcknowledgedAt) continue;
    const what = i.kind === 'MOVE_OUT' ? 'move-out' : 'move-in';
    out.push({ kind: 'INSPECTION', text: `Check your ${what} inspection for ${name.get(i.tenancyId)}`, link: '/tenant/documents' });
  }
  for (const t of homes) {
    if (!t.leaseEndDate) continue;
    const left = daysBetween(today, t.leaseEndDate);
    if (left >= 0 && left <= LEASE_WARNING_DAYS) {
      out.push({ kind: 'LEASE_ENDING', text: `Your lease for ${homeText(t)} ends in ${left} day${left === 1 ? '' : 's'}`, link: '/tenant/documents' });
    }
  }
  return out;
}

export interface PayButton {
  label: 'Pay now' | 'Pay in advance' | 'How to pay';
  /** prompt = M-Pesa prompt for the one landlord; details = paybill / bank details; chooser = pick a landlord. */
  opens: 'prompt' | 'details' | 'chooser';
}

/**
 * The hero's pay button. Always there when the person rents from someone: without in-app
 * M-Pesa it opens the landlord's paybill / bank details instead of a prompt.
 */
export function payButton(rows: readonly LandlordToPay[]): PayButton | null {
  if (rows.length === 0) return null;
  const owed = heroTotal(rows) > 0;
  if (rows.length > 1) return { label: owed ? 'Pay now' : 'Pay in advance', opens: 'chooser' };
  const [only] = rows;
  if (only!.canPayInApp) return { label: owed ? 'Pay now' : 'Pay in advance', opens: 'prompt' };
  return { label: owed ? 'Pay now' : 'How to pay', opens: 'details' };
}
