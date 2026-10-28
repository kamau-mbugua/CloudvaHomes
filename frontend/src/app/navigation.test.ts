import { describe, expect, it } from 'vitest';
import {
  ORG_NAV, availableTo, badgeCount, countText, groupBadgeCount, bestEntry, destinations, filterNav, matchScore, searchDestinations, segments,
} from './navigation';
import type { NavGroup } from './navigation';

const here = (path: string) => {
  const match = bestEntry(ORG_NAV, path);
  return match ? `${match.group.id}:${match.entry.to}` : null;
};

describe('segments', () => {
  it('splits on slashes and ignores empty parts, query and hash', () => {
    expect(segments('/app/invoices/run/')).toEqual(['app', 'invoices', 'run']);
    expect(segments('/app/units?page=2#top')).toEqual(['app', 'units']);
    expect(segments('/')).toEqual([]);
  });
});

describe('matchScore', () => {
  it('counts shared leading segments when the entry is a prefix', () => {
    expect(matchScore({ to: '/app/units' }, '/app/units')).toBe(2);
    expect(matchScore({ to: '/app/units' }, '/app/units/42/edit')).toBe(2);
  });

  it('matches whole segments only', () => {
    expect(matchScore({ to: '/app/unit' }, '/app/units')).toBe(-1);
    expect(matchScore({ to: '/app/units' }, '/app/unit-categories')).toBe(-1);
  });

  it('never matches a path shorter than the entry', () => {
    expect(matchScore({ to: '/app/invoices/run' }, '/app/invoices')).toBe(-1);
  });

  it('respects exact entries', () => {
    expect(matchScore({ to: '/app', exact: true }, '/app')).toBe(1);
    expect(matchScore({ to: '/app', exact: true }, '/app/')).toBe(1);
    expect(matchScore({ to: '/app', exact: true }, '/app/units')).toBe(-1);
  });
});

describe('bestEntry', () => {
  it('matches the dashboard only at /app itself', () => {
    expect(here('/app')).toBe('dashboard:/app');
    expect(here('/app/does-not-exist')).toBeNull();
  });

  it('matches each child page and its sub-pages', () => {
    expect(here('/app/units')).toBe('properties:/app/units');
    expect(here('/app/units/42')).toBe('properties:/app/units');
    expect(here('/app/unit-categories')).toBe('properties:/app/unit-categories');
    expect(here('/app/settings/roles/7')).toBe('settings:/app/settings/roles');
  });

  it('lets the longest segment prefix win', () => {
    expect(here('/app/invoices')).toBe('billing:/app/invoices');
    expect(here('/app/invoices/123')).toBe('billing:/app/invoices');
    expect(here('/app/invoices/run')).toBe('billing:/app/invoices/run');
    expect(here('/app/invoices/run/2026-11')).toBe('billing:/app/invoices/run');
  });

  it('matches groups that are themselves pages', () => {
    expect(here('/app/expenses')).toBe('expenses:/app/expenses');
    expect(here('/app/reports/arrears')).toBe('reports:/app/reports');
  });

  it('ignores the query string', () => {
    expect(here('/app/payments?status=unallocated')).toBe('money:/app/payments');
  });

  it('breaks ties by declaration order', () => {
    const groups: NavGroup[] = [
      { id: 'tenants', label: 'A', children: [{ label: 'First', to: '/x', phase: '1', hint: '' }] },
      { id: 'money', label: 'B', children: [{ label: 'Second', to: '/x', phase: '1', hint: '' }] },
    ];
    expect(bestEntry(groups, '/x/1')?.entry.label).toBe('First');
  });

  it('returns null outside the app', () => {
    expect(here('/login')).toBeNull();
  });
});

describe('the model', () => {
  const all = destinations(ORG_NAV);

  it('has unique paths, all under /app', () => {
    const paths = all.map((d) => d.to);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every((p) => p === '/app' || p.startsWith('/app/'))).toBe(true);
  });

  it('resolves every destination to itself', () => {
    for (const d of all) expect(bestEntry(ORG_NAV, d.to)?.entry.to).toBe(d.to);
  });

  it('lists the groups in the agreed order', () => {
    expect(ORG_NAV.map((g) => g.label)).toEqual([
      'Dashboard', 'Landlords', 'Properties', 'Tenants', 'Billing', 'Money', 'Expenses', 'Reports', 'Settings',
    ]);
  });

  it('searches by label, group and hint', () => {
    expect(searchDestinations(all, 'remit').map((d) => d.label)).toContain('Remittances');
    expect(searchDestinations(all, 'SETTINGS').length).toBe(5);
    expect(searchDestinations(all, 'm-pesa').map((d) => d.label)).toEqual(['Reconciliation']);
    expect(searchDestinations(all, '   ')).toHaveLength(all.length);
  });
});

describe('filterNav', () => {
  const labels = (groups: NavGroup[]) => groups.map((g) => `${g.label}:${g.children.map((c) => c.label).join(',')}`);

  it('leaves only the dashboard when no permissions are held', () => {
    expect(labels(filterNav(ORG_NAV, []))).toEqual(['Dashboard:']);
  });

  it('keeps entries whose permission is held and drops emptied groups', () => {
    const groups = filterNav(ORG_NAV, ['units:view', 'users:view', 'audit:view']);
    expect(labels(groups)).toEqual([
      'Dashboard:',
      'Properties:Units',
      'Settings:Users,Audit log',
    ]);
  });

  it('labels the catalogue page "Unit setup"', () => {
    const properties = filterNav(ORG_NAV, ['unit-categories:view']).find((g) => g.id === 'properties');
    expect(properties?.children.map((c) => c.label)).toEqual(['Unit setup']);
  });

  it('drops a page-group whose own permission is missing', () => {
    expect(filterNav(ORG_NAV, ['reports:view']).map((g) => g.id)).toEqual(['dashboard', 'reports']);
    expect(filterNav(ORG_NAV, ['expenses:view']).map((g) => g.id)).toEqual(['dashboard', 'expenses']);
  });

  it('shows both invoice pages for invoices:view', () => {
    const billing = filterNav(ORG_NAV, ['invoices:view']).find((g) => g.id === 'billing');
    expect(billing?.children.map((c) => c.label)).toEqual(['Invoices', 'Invoice run']);
  });

  it('keeps everything when every permission is held', () => {
    const every = destinations(ORG_NAV).flatMap((d) => (d.permission ? [d.permission] : []));
    expect(destinations(filterNav(ORG_NAV, every, 'AGENCY'))).toHaveLength(destinations(ORG_NAV).length);
  });

  it('does not mutate the model', () => {
    filterNav(ORG_NAV, []);
    expect(ORG_NAV.find((g) => g.id === 'settings')?.children.length).toBe(5);
  });

  it('gives every page except the dashboard a resource:action permission', () => {
    for (const d of destinations(ORG_NAV)) {
      if (d.to === '/app') expect(d.permission).toBeUndefined();
      else expect(d.permission).toMatch(/^[a-z-]+:view$/);
    }
  });
});

describe('organisation kinds', () => {
  const every = destinations(ORG_NAV).flatMap((d) => (d.permission ? [d.permission] : []));
  const ids = (groups: NavGroup[]) => groups.map((g) => g.id);

  it('shows the landlords group to agencies', () => {
    expect(ids(filterNav(ORG_NAV, every, 'AGENCY'))).toContain('landlords');
  });

  it('hides the whole landlords group from a landlord organisation, whatever its permissions', () => {
    const groups = filterNav(ORG_NAV, every, 'LANDLORD');
    expect(ids(groups)).not.toContain('landlords');
    expect(destinations(groups).some((d) => d.to.startsWith('/app/landlords') || d.to === '/app/remittances')).toBe(false);
    // Everything else is still there.
    expect(ids(groups)).toEqual(ids(ORG_NAV).filter((id) => id !== 'landlords'));
  });

  it('hides restricted groups when the kind is unknown, and keeps the rest', () => {
    expect(ids(filterNav(ORG_NAV, every))).not.toContain('landlords');
    expect(ids(filterNav(ORG_NAV, every, null))).toContain('properties');
  });

  it('answers availableTo per group', () => {
    expect(availableTo({}, 'LANDLORD')).toBe(true);
    expect(availableTo({}, null)).toBe(true);
    expect(availableTo({ orgKinds: ['AGENCY'] }, 'AGENCY')).toBe(true);
    expect(availableTo({ orgKinds: ['AGENCY'] }, 'LANDLORD')).toBe(false);
    expect(availableTo({ orgKinds: ['AGENCY'] }, undefined)).toBe(false);
  });

  it('carries the group restriction onto each destination', () => {
    const landlords = destinations(ORG_NAV).find((d) => d.to === '/app/landlords');
    expect(landlords?.orgKinds).toEqual(['AGENCY']);
    expect(destinations(ORG_NAV).find((d) => d.to === '/app/units')?.orgKinds).toBeUndefined();
  });
});

describe('menu counts', () => {
  const money = ORG_NAV.find((g) => g.id === 'money')!;
  const reconciliation = money.children.find((c) => c.to === '/app/reconciliation')!;

  it('puts the unmatched M-Pesa count on Reconciliation only', () => {
    expect(reconciliation.badge).toBe('unmatchedInbound');
    expect(destinations(ORG_NAV).filter((d) => d.badge).map((d) => d.to)).toEqual(['/app/reconciliation']);
  });

  it('counts an entry only when something is waiting', () => {
    expect(badgeCount(reconciliation, { unmatchedInbound: 4 })).toBe(4);
    expect(badgeCount(reconciliation, { unmatchedInbound: 0 })).toBe(0);
    expect(badgeCount(reconciliation, {})).toBe(0);
    expect(badgeCount(reconciliation, { unmatchedInbound: Number.NaN })).toBe(0);
    expect(badgeCount({}, { unmatchedInbound: 4 })).toBe(0);
  });

  it('a closed group carries its children’s counts', () => {
    expect(groupBadgeCount(money, { unmatchedInbound: 3 })).toBe(3);
    expect(groupBadgeCount(ORG_NAV.find((g) => g.id === 'billing')!, { unmatchedInbound: 3 })).toBe(0);
  });

  it('caps the text at 99+', () => {
    expect(countText(0)).toBeNull();
    expect(countText(12)).toBe('12');
    expect(countText(150)).toBe('99+');
  });
});
