import { describe, expect, it } from 'vitest';
import {
  ALL_HOMES,
  accountsInScope,
  homeOptions,
  legacyAccountScope,
  otherHomesOnAccount,
  resolveScope,
} from './scope';
import type { ConsolidatedOverview, ConsolidatedTenancy } from './types';

const home = (id: string, tenantId: string, unit: string, property: string, orgName: string, status = 'ACTIVE') =>
  ({
    id,
    tenantId,
    tenantCode: 'T1',
    orgName,
    unit: { number: unit },
    property: { name: property },
    rentAmount: 1,
    billingDay: 1,
    status,
    startDate: '2026-01-01',
    endDate: null,
  }) as ConsolidatedTenancy;

const overview = {
  balance: 0,
  credit: 0,
  depositHeld: 0,
  homes: 3,
  tenancies: [
    home('ty1', 'acc1', 'G1', 'Acacia Heights', 'Ivory Breeze'),
    home('ty2', 'acc1', 'B4', 'Palm Gardens', 'Ivory Breeze', 'NOTICE'),
    home('ty3', 'acc2', 'Shop 2', 'Ruaka Mall', 'Ruaka Estates'),
    home('ty0', 'acc2', 'Old 1', 'Ruaka Mall', 'Ruaka Estates', 'ENDED'),
  ],
  openInvoices: [],
  accounts: [],
} as ConsolidatedOverview;

describe('home switcher', () => {
  it('lists homes still lived in, named with their landlord', () => {
    expect(homeOptions(overview)).toEqual([
      { tenantId: 'acc1', tenancyId: 'ty1', label: 'G1, Acacia Heights · Ivory Breeze' },
      { tenantId: 'acc1', tenancyId: 'ty2', label: 'B4, Palm Gardens · Ivory Breeze' },
      { tenantId: 'acc2', tenancyId: 'ty3', label: 'Shop 2, Ruaka Mall · Ruaka Estates' },
    ]);
  });

  it('restores the server defaultHomeId when still lived in, and falls back to all for an ended or absent one', () => {
    const options = homeOptions(overview);
    expect(resolveScope('ty3', options)).toEqual({ kind: 'home', tenantId: 'acc2', tenancyId: 'ty3' });
    expect(resolveScope('ty0', options)).toEqual(ALL_HOMES);
    expect(resolveScope('unknown', options)).toEqual(ALL_HOMES);
    expect(resolveScope(null, options)).toEqual(ALL_HOMES);
    expect(resolveScope(undefined, options)).toEqual(ALL_HOMES);
  });

  it('knows which landlord accounts a scope covers', () => {
    expect(accountsInScope(overview, { kind: 'all' })).toEqual(['acc1', 'acc2']);
    expect(accountsInScope(overview, { kind: 'home', tenantId: 'acc2', tenancyId: 'ty3' })).toEqual(['acc2']);
  });

  it('names the other homes on the same landlord account', () => {
    expect(otherHomesOnAccount(overview, { kind: 'home', tenantId: 'acc1', tenancyId: 'ty1' })).toEqual(['B4, Palm Gardens']);
    expect(otherHomesOnAccount(overview, { kind: 'home', tenantId: 'acc2', tenancyId: 'ty3' })).toEqual([]);
    expect(otherHomesOnAccount(overview, { kind: 'all' })).toEqual([]);
  });

  it('turns an old ?account= link into that account’s first home', () => {
    expect(legacyAccountScope('acc2', overview)).toEqual({ kind: 'home', tenantId: 'acc2', tenancyId: 'ty3' });
    expect(legacyAccountScope('nope', overview)).toEqual({ kind: 'all' });
  });
});
