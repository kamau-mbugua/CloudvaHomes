/**
 * The org app's (`/app`) navigation model — pure data and pure functions, no React and no
 * router, so the matching rules can be tested without mounting anything.
 *
 * One model drives the sidebar, the command palette, the routes and the top-bar title, so
 * the four can never disagree about what exists or where it lives.
 *
 * Structure follows docs/specs §6.3. `phase` is the delivery phase (§9) that builds the
 * screen; until then every entry routes to a placeholder that says so. `permission`
 * decides who sees the entry (`filterNav`) and who may open the page (`RequirePermission`).
 * `orgKinds` on a group limits it to some kinds of organisation: a landlord's own
 * organisation has no landlords to manage, so that whole group is for agencies only.
 */

import type { OrgKind } from '../lib/auth/types';

export type GroupId =
  | 'dashboard'
  | 'landlords'
  | 'properties'
  | 'tenants'
  | 'billing'
  | 'money'
  | 'expenses'
  | 'reports'
  | 'settings'
  // The platform admin area (`/admin`, phase 8).
  | 'admin-overview'
  | 'admin-organizations'
  | 'admin-plans'
  | 'admin-invoices'
  | 'admin-settings';

/** Live counts the menu can show beside an entry, keyed by what they count. */
export type NavBadge = 'unmatchedInbound';

export interface NavEntry {
  label: string;
  to: string;
  /** Delivery phase that builds this screen, e.g. "2" or "6b". */
  phase: string;
  /** One line shown under the title and in the command palette. */
  hint: string;
  /**
   * The permission needed to see this page (`resource:action`). Absent = anyone signed in
   * to an organisation (the dashboard). Hiding is a courtesy; the API enforces it.
   */
  permission?: string;
  /**
   * Match only this exact path, never its children. For `/app`, which is a prefix of
   * every other page and would otherwise light up for any unknown address.
   */
  exact?: boolean;
  /** A live count shown beside the entry (e.g. M-Pesa transactions waiting to be matched). */
  badge?: NavBadge;
}

export interface NavGroup {
  id: GroupId;
  label: string;
  /** Present when only these kinds of organisation have this group. Absent = every kind. */
  orgKinds?: OrgKind[];
  /** Present when the group is itself a page (Dashboard, Expenses, Reports). */
  entry?: NavEntry;
  children: NavEntry[];
}

export const APP_ROOT = '/app';

export const ORG_NAV: NavGroup[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    entry: { label: 'Dashboard', to: '/app', phase: '6', hint: 'Collections, arrears and occupancy at a glance', exact: true },
    children: [],
  },
  {
    id: 'landlords',
    label: 'Landlords',
    orgKinds: ['AGENCY'],
    children: [
      { label: 'Landlords', to: '/app/landlords', permission: 'landlords:view', phase: '2', hint: 'Property owners your agency manages for' },
      { label: 'Agreements', to: '/app/agreements', permission: 'agreements:view', phase: '6b', hint: 'Management terms: commission and remittance day' },
      { label: 'Owner statements', to: '/app/owner-statements', permission: 'landlords:view', phase: '6b', hint: 'What was collected and paid out per landlord' },
      { label: 'Remittances', to: '/app/remittances', permission: 'remittances:view', phase: '6b', hint: 'Payouts of net collections to landlords' },
    ],
  },
  {
    id: 'properties',
    label: 'Properties',
    children: [
      { label: 'Properties', to: '/app/properties', permission: 'properties:view', phase: '2', hint: 'Buildings and compounds' },
      { label: 'Units', to: '/app/units', permission: 'units:view', phase: '2', hint: 'Rentable spaces in each property' },
      { label: 'Unit setup', to: '/app/unit-categories', permission: 'unit-categories:view', phase: '2', hint: 'Categories, types and features, e.g. Executive · 2 Bedroom · Balcony' },
    ],
  },
  {
    id: 'tenants',
    label: 'Tenants',
    children: [
      { label: 'Tenants', to: '/app/tenants', permission: 'tenants:view', phase: '2', hint: 'People renting your units' },
      { label: 'Tenancies', to: '/app/tenancies', permission: 'tenancies:view', phase: '2', hint: 'Move-ins, move-outs and occupancy history' },
    ],
  },
  {
    id: 'billing',
    label: 'Billing',
    children: [
      { label: 'Invoices', to: '/app/invoices', permission: 'invoices:view', phase: '3', hint: 'Rent and charges billed to tenants' },
      { label: 'Invoice run', to: '/app/invoices/run', permission: 'invoices:view', phase: '3', hint: 'Generate this period’s invoices' },
      { label: 'Meter readings', to: '/app/meter-readings', permission: 'meters:view', phase: '3', hint: 'Water and power readings for metered charges' },
      { label: 'Charges', to: '/app/charges', permission: 'charges:view', phase: '3', hint: 'Recurring and move-in charge types' },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    children: [
      { label: 'Payments', to: '/app/payments', permission: 'payments:view', phase: '4', hint: 'Money received and how it was allocated' },
      { label: 'Reconciliation', to: '/app/reconciliation', permission: 'reconciliation:view', phase: '5', hint: 'Match M-Pesa and bank transactions to tenants', badge: 'unmatchedInbound' },
      { label: 'Payment channels', to: '/app/payment-channels', permission: 'channels:view', phase: '4', hint: 'Paybills, tills, bank accounts and cash' },
    ],
  },
  {
    id: 'expenses',
    label: 'Expenses',
    entry: { label: 'Expenses', to: '/app/expenses', permission: 'expenses:view', phase: '6', hint: 'Recurring and one-off property expenses' },
    children: [],
  },
  {
    id: 'reports',
    label: 'Reports',
    entry: { label: 'Reports', to: '/app/reports', permission: 'reports:view', phase: '6', hint: 'Property P&L, arrears, aging and occupancy' },
    children: [],
  },
  {
    id: 'settings',
    label: 'Settings',
    children: [
      { label: 'Organisation', to: '/app/settings/organization', permission: 'settings:view', phase: '1', hint: 'Name, contacts and defaults' },
      { label: 'Users', to: '/app/settings/users', permission: 'users:view', phase: '1', hint: 'Who can sign in to this organisation' },
      { label: 'Roles', to: '/app/settings/roles', permission: 'roles:view', phase: '1', hint: 'Named sets of permissions' },
      { label: 'Audit log', to: '/app/settings/audit', permission: 'audit:view', phase: '1', hint: 'Who changed what, and when' },
      { label: 'Plan & billing', to: '/app/settings/plan', permission: 'settings:view', phase: '8', hint: 'Your Hodi plan and invoices' },
      { label: 'Payouts', to: '/app/settings/payouts', permission: 'settings:view', phase: '10', hint: 'The M-Pesa B2C account that pays landlords' },
    ],
  },
];

/** "/app/invoices/run/" → ["app", "invoices", "run"]. Empty segments are dropped. */
export function segments(path: string): string[] {
  return path.split('?')[0].split('#')[0].split('/').filter(Boolean);
}

/**
 * How well an entry matches a path: the number of leading path segments they share when
 * the entry's path is a whole-segment prefix of the address, otherwise -1.
 *
 * Whole segments, not characters: `/app/unit` must not match `/app/units`.
 */
export function matchScore(entry: Pick<NavEntry, 'to' | 'exact'>, path: string): number {
  const want = segments(entry.to);
  const have = segments(path);

  if (want.length > have.length) return -1;
  if (entry.exact && want.length !== have.length) return -1;

  for (let i = 0; i < want.length; i += 1) {
    if (want[i] !== have[i]) return -1;
  }

  return want.length;
}

export interface NavMatch {
  group: NavGroup;
  entry: NavEntry;
}

/**
 * The single entry that best describes `path`: the longest path-segment prefix wins, and
 * ties go to whichever was declared first.
 *
 * One winner decides both which group opens and which line is highlighted, so two entries
 * can never be lit at once — `/app/invoices/run` lights "Invoice run", not also "Invoices".
 */
export function bestEntry(groups: NavGroup[], path: string): NavMatch | null {
  let best: NavMatch | null = null;
  let bestScore = -1;

  for (const group of groups) {
    for (const entry of entriesOf(group)) {
      const score = matchScore(entry, path);
      if (score > bestScore) {
        bestScore = score;
        best = { group, entry };
      }
    }
  }

  return best;
}

/** A group's own page (if any) followed by its children. */
export function entriesOf(group: NavGroup): NavEntry[] {
  return group.entry ? [group.entry, ...group.children] : group.children;
}

export interface Destination extends NavEntry {
  groupLabel: string;
  /** The group's `orgKinds`, carried so a route can refuse the wrong kind of organisation. */
  orgKinds?: OrgKind[];
}

/** Every page, flattened in menu order — for routes and the command palette. */
export function destinations(groups: NavGroup[]): Destination[] {
  return groups.flatMap((group) =>
    entriesOf(group).map((entry) => ({ ...entry, groupLabel: group.label, orgKinds: group.orgKinds })),
  );
}

/** Case-insensitive filter over label, group and hint, for the command palette. */
export function searchDestinations(all: Destination[], term: string): Destination[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return all;

  return all.filter((d) =>
    d.label.toLowerCase().includes(needle)
    || d.groupLabel.toLowerCase().includes(needle)
    || d.hint.toLowerCase().includes(needle));
}

/** Whether an organisation of `kind` has this group at all. Unknown kind = only unrestricted groups. */
export function availableTo(group: Pick<NavGroup, 'orgKinds'>, kind: OrgKind | null | undefined): boolean {
  if (!group.orgKinds) return true;
  return Boolean(kind && group.orgKinds.includes(kind));
}

/**
 * The navigation a person may see: groups their kind of organisation has, entries whose
 * permission they hold, and only the groups left with something in them. A group that is
 * itself a page keeps its children only if its own page is visible too.
 */
export function filterNav(groups: NavGroup[], permissions: Iterable<string>, orgKind?: OrgKind | null): NavGroup[] {
  const held = new Set(permissions);
  const allowed = (entry: NavEntry) => !entry.permission || held.has(entry.permission);

  return groups.flatMap((group) => {
    if (!availableTo(group, orgKind)) return [];
    if (group.entry && !allowed(group.entry)) return [];
    const children = group.children.filter(allowed);
    if (!group.entry && children.length === 0) return [];
    return [{ ...group, children }];
  });
}

/** The count to show beside an entry, or 0 when it has none (or nothing is waiting). */
export function badgeCount(entry: Pick<NavEntry, 'badge'>, counts: Partial<Record<NavBadge, number>>): number {
  const count = entry.badge ? counts[entry.badge] : undefined;
  return typeof count === 'number' && Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
}

/** What a group shows while it is closed: the sum of its entries' counts. */
export function groupBadgeCount(group: NavGroup, counts: Partial<Record<NavBadge, number>>): number {
  return entriesOf(group).reduce((sum, entry) => sum + badgeCount(entry, counts), 0);
}

/** "7", "99+", or null for nothing to show. */
export function countText(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

/**
 * The platform admin area (`/admin`, phase 8): its own shell and menu, for platform admins
 * only (`RequireAdmin`). No permissions — being a platform admin is the permission.
 */
export const ADMIN_ROOT = '/admin';

export const ADMIN_NAV: NavGroup[] = [
  {
    id: 'admin-overview',
    label: 'Overview',
    entry: { label: 'Overview', to: '/admin', phase: '8', hint: 'Organisations, units billed and money owed to Hodi', exact: true },
    children: [],
  },
  {
    id: 'admin-organizations',
    label: 'Organisations',
    entry: { label: 'Organisations', to: '/admin/organizations', phase: '8', hint: 'Every organisation on Hodi: status, plan and price' },
    children: [],
  },
  {
    id: 'admin-plans',
    label: 'Plans',
    entry: { label: 'Plans', to: '/admin/plans', phase: '8', hint: 'Prices per let unit, minimums and trial days' },
    children: [],
  },
  {
    id: 'admin-invoices',
    label: 'Invoices',
    entry: { label: 'Invoices', to: '/admin/invoices', phase: '8', hint: 'Hodi’s monthly invoices to organisations' },
    children: [],
  },
  {
    id: 'admin-settings',
    label: 'Settings',
    entry: { label: 'Settings', to: '/admin/settings', phase: '8', hint: 'Due and suspension days, default plan, Hodi’s paybill' },
    children: [],
  },
];

/** The account page inside the admin area, for admins with no organisation. */
export const ADMIN_ACCOUNT_ENTRY: NavEntry = {
  label: 'My account',
  to: '/admin/account',
  phase: '8',
  hint: 'Your name and password',
};

/**
 * Pages that exist but are not in the menu — reached from the account menu. Kept here so
 * the top bar can title them the same way.
 */
export const ACCOUNT_ENTRY: NavEntry = {
  label: 'My account',
  to: '/app/account',
  phase: '1',
  hint: 'Your name and password',
};
