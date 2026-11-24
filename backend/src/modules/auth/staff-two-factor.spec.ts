import { staffNeedsSecondCode } from './staff-two-factor.js';

describe('staffNeedsSecondCode', () => {
  it('follows each organisation’s rule', () => {
    expect(staffNeedsSecondCode([])).toBe(false);
    expect(staffNeedsSecondCode([{ rule: 'OFF', permissions: ['payments:refund'] }])).toBe(false);
    expect(staffNeedsSecondCode([{ rule: 'ALL_STAFF', permissions: [] }])).toBe(true);
    expect(staffNeedsSecondCode([{ rule: 'MONEY_ROLES', permissions: ['tenants:view'] }])).toBe(
      false,
    );
    expect(staffNeedsSecondCode([{ rule: 'MONEY_ROLES', permissions: ['channels:manage'] }])).toBe(
      true,
    );
    // Any one organisation asking is enough.
    expect(
      staffNeedsSecondCode([
        { rule: 'OFF', permissions: [] },
        { rule: 'MONEY_ROLES', permissions: ['remittances:pay'] },
      ]),
    ).toBe(true);
  });
});
