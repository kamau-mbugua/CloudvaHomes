import { describe, expect, it } from 'vitest';
import { tenancyActionLayout, tenantPrimaryAction, type ActionPermissions } from './actionLayout';

const ALL: ActionPermissions = { view: true, update: true, delete: true, invoice: true };

describe('tenancyActionLayout', () => {
  it('shows notice and move-out for an active tenancy, everything else in More, delete last', () => {
    const { buttons, menu } = tenancyActionLayout('ACTIVE', ALL);
    expect(buttons).toEqual(['notice', 'moveOut']);
    expect(menu).toEqual(['leasePdf', 'attachLease', 'inspectIn', 'renew', 'rentChange', 'moveInInvoice', 'delete']);
  });

  it('shows move-out and change-notice while on notice; withdrawing notice goes in More', () => {
    const { buttons, menu } = tenancyActionLayout('NOTICE', ALL);
    expect(buttons).toEqual(['moveOut', 'changeNotice']);
    // No renewal or rent change for someone leaving: withdraw the notice first.
    expect(menu).toEqual(['withdrawNotice', 'leasePdf', 'attachLease', 'inspectIn', 'inspectOut', 'moveInInvoice', 'delete']);
    // …but a change scheduled before the notice can still be opened to cancel it.
    expect(tenancyActionLayout('NOTICE', ALL, { pendingRentChanges: 1 }).menu).toContain('rentChange');
  });

  it('offers only the lease PDF on an ended tenancy for someone who can only view', () => {
    expect(tenancyActionLayout('ENDED', { view: true, update: false, delete: false, invoice: false }))
      .toEqual({ buttons: [], menu: ['leasePdf', 'inspectIn', 'inspectOut'] });
  });

  it('lets a viewer open an attached signed lease', () => {
    expect(tenancyActionLayout('ENDED', { view: true, update: false, delete: false, invoice: false }, { hasSignedLease: true }).menu)
      .toEqual(['leasePdf', 'attachLease', 'inspectIn', 'inspectOut']);
  });

  it('leaves out what the person may not do', () => {
    const { buttons, menu } = tenancyActionLayout('ACTIVE', { view: true, update: false, delete: false, invoice: false });
    expect(buttons).toEqual([]);
    expect(menu).toEqual(['leasePdf', 'inspectIn']);
    expect(tenancyActionLayout('ACTIVE', { ...ALL, delete: false }).menu).not.toContain('delete');
  });

  it('never shows more than two buttons', () => {
    for (const status of ['ACTIVE', 'NOTICE', 'ENDED'] as const) {
      expect(tenancyActionLayout(status, ALL).buttons.length).toBeLessThanOrEqual(2);
    }
  });
});

describe('tenantPrimaryAction', () => {
  it('is Record payment for a current tenant and Move in otherwise', () => {
    expect(tenantPrimaryAction('CURRENT')).toBe('recordPayment');
    expect(tenantPrimaryAction('PAST')).toBe('moveIn');
    expect(tenantPrimaryAction('PROSPECT')).toBe('moveIn');
  });
});
