import { useOutletContext } from 'react-router-dom';
import type { TenantOf } from '../../lib/auth/types';
import { accountsInScope, otherHomesOnAccount, type HomeScope } from './scope';
import type { ConsolidatedOverview } from './types';

/**
 * What the tenant shell hands every tenant page (tenant portal redesign): the consolidated
 * overview, the home switcher's choice, and — for the pages that work per landlord
 * account — the account in scope (the selected home's, or the first).
 */
export interface TenantContext {
  overview: ConsolidatedOverview;
  scope: HomeScope;
  setScope: (s: HomeScope) => void;
  /** Every landlord account the person rents from. */
  accounts: TenantOf[];
  /** The selected home's account, or the first one when showing all homes. */
  account: TenantOf;
  /** Kept for old links; always '' now that the choice lives on the device. */
  search: string;
  count: number;
}

export function useTenantContext(): TenantContext {
  return useOutletContext<TenantContext>();
}

/**
 * The landlord accounts the current scope covers, each with the note to show when one home
 * is selected but the account also covers other homes ("This account also covers B4, …").
 */
export function useScopedAccounts(): { account: TenantOf; heading: boolean; note: string | null; tenancyId?: string }[] {
  const { overview, scope, accounts } = useTenantContext();
  const ids = accountsInScope(overview, scope);
  const list = accounts.filter((a) => ids.includes(a.tenantId));
  const others = otherHomesOnAccount(overview, scope);
  return list.map((account) => ({
    account,
    heading: list.length > 1,
    note: others.length > 0 ? `This account with ${account.organization.name} also covers ${others.join(', ')}.` : null,
    tenancyId: scope.kind === 'home' ? scope.tenancyId : undefined,
  }));
}
