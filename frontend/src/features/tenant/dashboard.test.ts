import { describe, expect, it } from 'vitest';
import { heroTotal, toPayByLandlord, todoItems } from './dashboard';
import type { ConsolidatedOverview, ConsolidatedTenancy, TenantOverview } from './types';

const account = (id: string, org: string, balance: number, credit = 0, canPayInApp = true) =>
  ({ tenant: { id, code: id, firstName: 'A', lastName: 'B' }, organization: { name: org, phone: null, email: null }, balance, credit, depositHeld: 0, tenancies: [], openInvoices: [], howToPay: [], canPayInApp }) as TenantOverview;

const home = (id: string, tenantId: string, extra: Partial<ConsolidatedTenancy> = {}) =>
  ({ id, tenantId, tenantCode: 'T', orgName: 'Org', unit: { number: id.toUpperCase() }, property: { name: 'Court' }, rentAmount: 1, billingDay: 1, status: 'ACTIVE', startDate: '2026-01-01', endDate: null, ...extra }) as ConsolidatedTenancy;

const overview = {
  balance: 4150000, credit: 100000, depositHeld: 0, homes: 3,
  tenancies: [home('g1', 'a1'), home('b4', 'a1'), home('s2', 'a2')],
  openInvoices: [],
  accounts: [account('a1', 'Ivory Breeze', 1600000), account('a2', 'Ruaka Estates', 2550000), account('a3', 'Old Landlord', 0, 100000)],
} as ConsolidatedOverview;

describe('toPayByLandlord', () => {
  it('keeps each landlord separate and never nets credit against another landlord', () => {
    const rows = toPayByLandlord(overview, { kind: 'all' });
    expect(rows.map((r) => [r.orgName, r.owed, r.credit])).toEqual([
      ['Ruaka Estates', 2550000, 0],
      ['Ivory Breeze', 1600000, 0],
      ['Old Landlord', 0, 100000],
    ]);
    expect(heroTotal(rows)).toBe(4150000);
  });

  it('shows only the selected home’s landlord', () => {
    const rows = toPayByLandlord(overview, { kind: 'home', tenantId: 'a1', tenancyId: 'g1' });
    expect(rows.map((r) => r.orgName)).toEqual(['Ivory Breeze']);
  });
});

describe('todoItems', () => {
  const TODAY = '2026-11-05';
  it('lists unchecked inspections, overdue homes and leases ending within 60 days', () => {
    const o = {
      ...overview,
      tenancies: [
        home('g1', 'a1', { overdue: 900000, daysLate: 9, leaseEndDate: '2026-12-05' }),
        home('b4', 'a1', { leaseEndDate: '2027-03-01' }),
      ],
    } as ConsolidatedOverview;
    const items = todoItems(o, { kind: 'all' }, [
      { tenancyId: 'b4', kind: 'MOVE_IN', tenantAcknowledgedAt: null },
      { tenancyId: 'g1', kind: 'MOVE_IN', tenantAcknowledgedAt: '2026-10-01T00:00:00Z' },
    ], TODAY);
    expect(items.map((i) => i.kind)).toEqual(['OVERDUE', 'INSPECTION', 'LEASE_ENDING']);
    expect(items[0]!.text).toContain('G1, Court');
    expect(items[1]!.link).toBe('/tenant/documents');
  });

  it('only covers the selected home', () => {
    const o = { ...overview, tenancies: [home('g1', 'a1', { overdue: 5 }), home('s2', 'a2', { overdue: 5 })] } as ConsolidatedOverview;
    expect(todoItems(o, { kind: 'home', tenantId: 'a2', tenancyId: 's2' }, [], TODAY)).toHaveLength(1);
  });
});

describe('payButton', () => {
  const row = (owed: number, canPayInApp: boolean, id = 'a1') => ({ tenantId: id, orgName: id, owed, credit: 0, canPayInApp });
  it('one landlord with in-app M-Pesa: straight to the prompt', async () => {
    const { payButton } = await import('./dashboard');
    expect(payButton([row(1600000, true)])).toEqual({ label: 'Pay now', opens: 'prompt' });
    expect(payButton([row(0, true)])).toEqual({ label: 'Pay in advance', opens: 'prompt' });
  });
  it('without in-app M-Pesa it still shows, and opens the paybill / bank details', async () => {
    const { payButton } = await import('./dashboard');
    expect(payButton([row(1600000, false)])).toEqual({ label: 'Pay now', opens: 'details' });
    expect(payButton([row(0, false)])).toEqual({ label: 'How to pay', opens: 'details' });
  });
  it('several landlords: the chooser', async () => {
    const { payButton } = await import('./dashboard');
    expect(payButton([row(1, true), row(2, false, 'a2')])).toEqual({ label: 'Pay now', opens: 'chooser' });
  });
  it('no landlord account: no button', async () => {
    const { payButton } = await import('./dashboard');
    expect(payButton([])).toBeNull();
  });
});
