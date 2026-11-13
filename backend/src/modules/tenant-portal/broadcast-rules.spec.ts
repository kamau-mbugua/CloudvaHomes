import { describe, expect, it } from 'vitest';
import { broadcastRecipients, noticeSmsText, smsSegments } from './broadcast-rules.js';

describe('broadcastRecipients', () => {
  const row = (tenantId: string, status: 'ACTIVE' | 'NOTICE' | 'ENDED') => ({
    tenantId,
    phone: `+2547110000${tenantId.slice(-2)}`,
    email: null,
    userId: null,
    firstName: 'T',
    status,
  });

  it('includes each current tenant once, even with two units', () => {
    expect(
      broadcastRecipients([
        row('t-01', 'ACTIVE'),
        row('t-01', 'NOTICE'),
        row('t-02', 'ACTIVE'),
      ]).map((r) => r.tenantId),
    ).toEqual(['t-01', 't-02']);
  });

  it('leaves out tenants who have moved out', () => {
    expect(broadcastRecipients([row('t-03', 'ENDED')])).toEqual([]);
  });
});

describe('smsSegments', () => {
  it('counts GSM-7 messages as 160 then 153 characters', () => {
    expect(smsSegments('')).toBe(0);
    expect(smsSegments('a'.repeat(160))).toBe(1);
    expect(smsSegments('a'.repeat(161))).toBe(2);
    expect(smsSegments('a'.repeat(306))).toBe(2);
    expect(smsSegments('a'.repeat(307))).toBe(3);
  });

  it('counts text with other characters as 70 then 67', () => {
    expect(smsSegments('✓'.repeat(70))).toBe(1);
    expect(smsSegments('✓'.repeat(71))).toBe(2);
  });

  it('counts GSM extension characters as two', () => {
    expect(smsSegments('€'.repeat(80))).toBe(1);
    expect(smsSegments('€'.repeat(81))).toBe(2);
  });
});

describe('noticeSmsText', () => {
  it('puts the organisation name in front so tenants know who sent it', () => {
    expect(noticeSmsText('Makini Homes', ' Water off on Saturday. ')).toBe(
      'Makini Homes: Water off on Saturday.',
    );
  });
  it('leaves a notice that already starts with the name alone', () => {
    expect(noticeSmsText('Makini Homes', 'MAKINI HOMES - water off on Saturday.')).toBe(
      'MAKINI HOMES - water off on Saturday.',
    );
  });
});
