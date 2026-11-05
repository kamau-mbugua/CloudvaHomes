import { homeText } from './rules';
import type { ConsolidatedOverview, ConsolidatedTenancy } from './types';

/**
 * The tenant portal's home switcher (tenant portal redesign): everything across all my
 * homes, or one home (a tenancy) and the landlord account it belongs to. Kept on this
 * device only, so it can never quietly follow the person to another device.
 */
export type HomeScope = { kind: 'all' } | { kind: 'home'; tenantId: string; tenancyId: string };

export interface HomeOption {
  tenantId: string;
  tenancyId: string;
  label: string;
}

export const ALL_HOMES: HomeScope = { kind: 'all' };

const lived = (t: ConsolidatedTenancy) => t.status === 'ACTIVE' || t.status === 'NOTICE';

/** Homes still lived in, "G1, Acacia Heights · Ivory Breeze". */
export function homeOptions(o: ConsolidatedOverview): HomeOption[] {
  return o.tenancies.filter(lived).map((t) => ({
    tenantId: t.tenantId,
    tenancyId: t.id,
    label: `${homeText(t)} · ${t.orgName}`,
  }));
}

export function scopeStorageKey(userId: string): string {
  return `kodihub:tenant-home:${userId}`;
}

export function serializeScope(s: HomeScope): string {
  return JSON.stringify(s);
}

/** A saved choice, if it still names one of the options; otherwise all homes. */
export function resolveScope(stored: string | null, options: readonly HomeOption[]): HomeScope {
  if (!stored) return ALL_HOMES;
  try {
    const s = JSON.parse(stored) as Partial<{ kind: string; tenantId: string; tenancyId: string }>;
    const match = s?.kind === 'home' ? options.find((o) => o.tenancyId === s.tenancyId) : undefined;
    return match ? { kind: 'home', tenantId: match.tenantId, tenancyId: match.tenancyId } : ALL_HOMES;
  } catch {
    return ALL_HOMES;
  }
}

/** The landlord accounts (tenant ids) a scope covers, in overview order. */
export function accountsInScope(o: ConsolidatedOverview, s: HomeScope): string[] {
  const all = [...new Set(o.tenancies.map((t) => t.tenantId))];
  for (const a of o.accounts) if (!all.includes(a.tenant.id)) all.push(a.tenant.id);
  return s.kind === 'all' ? all : all.filter((id) => id === s.tenantId);
}

/** With one home selected: the other homes the same landlord account covers ("B4, Palm Gardens"). */
export function otherHomesOnAccount(o: ConsolidatedOverview, s: HomeScope): string[] {
  if (s.kind === 'all') return [];
  return o.tenancies.filter((t) => lived(t) && t.tenantId === s.tenantId && t.id !== s.tenancyId).map((t) => homeText(t));
}

/** An old `?account=<tenantId>` link: that account's first home still lived in. */
export function legacyAccountScope(tenantId: string, o: ConsolidatedOverview): HomeScope {
  const first = o.tenancies.find((t) => lived(t) && t.tenantId === tenantId);
  return first ? { kind: 'home', tenantId, tenancyId: first.id } : ALL_HOMES;
}
