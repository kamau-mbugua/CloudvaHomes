import { describe, expect, it } from 'vitest';
import { orgSettingsTabs, paymentCopy } from './audience';

describe('payment wording per kind of organisation', () => {
  it('talks about guests and booking numbers to hosts', () => {
    const c = paymentCopy('HOST');
    expect(c.emptyChannels).toContain('guests pay you');
    expect(c.emptyChannels).not.toMatch(/tenant/i);
    expect(c.mpesaPrompts).toBe('guests’ phones');
    expect(c.bankMatching).toContain('booking number like B00012');
    expect(c.bankMatching).not.toMatch(/tenant/i);
  });

  it('keeps tenants, tenant codes and invoices for landlords and agencies', () => {
    for (const kind of ['LANDLORD', 'AGENCY'] as const) {
      const c = paymentCopy(kind);
      expect(c.emptyChannels).toContain('tenants pay you');
      expect(c.mpesaPrompts).toBe('tenants’ phones');
      expect(c.bankMatching).toContain('T00001');
    }
    expect(paymentCopy(null).emptyChannels).toContain('tenants pay you');
  });

  it('gives hosts only the organisation details tab; rent tabs are for landlords and agencies', () => {
    expect(orgSettingsTabs('HOST').map((t) => t.key)).toEqual(['details']);
    expect(orgSettingsTabs('LANDLORD').map((t) => t.key)).toEqual(['details', 'billing', 'reminders', 'late-fees']);
    expect(orgSettingsTabs('AGENCY').map((t) => t.key)).toEqual(['details', 'billing', 'reminders', 'late-fees']);
  });
});
