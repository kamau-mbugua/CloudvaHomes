import { describe, expect, it } from 'vitest';
import { bannerFor, bundleAmount, purchaseStkState, smsModeLabel, usageStatusLabel } from './rules';
import type { SmsAccountView } from './types';

const platform: SmsAccountView = {
  mode: 'PLATFORM',
  provider: null,
  senderId: null,
  balance: 100,
  unitsBought: 0,
  unitsUsed: 0,
  lowBalanceLevel: 50,
  fallbackToPlatform: false,
  unitPrice: '80',
  failing: null,
  canBuyInApp: true,
};
const own: SmsAccountView = { ...platform, mode: 'OWN', provider: 'TEXTSMS', senderId: 'MAKINI', balance: 0 };

describe('SMS page rules', () => {
  it('says plainly how messages are sent', () => {
    expect(smsModeLabel(platform)).toBe('KodiHub sends your SMS');
    expect(smsModeLabel(own)).toBe('Your own SMS account (sender ID MAKINI, TextSMS Kenya)');
    expect(smsModeLabel({ ...own, provider: 'HOSTPINNACLE' })).toBe('Your own SMS account (sender ID MAKINI, HostPinnacle)');
  });

  it('warns when units are out or low, and when the own account fails', () => {
    expect(bannerFor({ ...platform, balance: 0 })).toEqual({
      tone: 'danger',
      text: 'Out of SMS units — messages to your tenants and guests are not being sent.',
      action: 'buy',
    });
    expect(bannerFor({ ...platform, balance: 20, lowBalanceLevel: 50 })).toEqual({
      tone: 'warn',
      text: '20 SMS units left.',
      action: 'buy',
    });
    expect(bannerFor({ ...platform, balance: 500 })).toBeNull();
    expect(bannerFor({ ...own, failing: { since: '2026-11-08T10:00:00Z', reason: 'Invalid credentials' } })).toEqual({
      tone: 'danger',
      text: 'Your SMS account isn’t sending: Invalid credentials',
      action: 'check',
    });
    expect(bannerFor(own)).toBeNull();
  });

  it('prices bundles in whole shillings like the server', () => {
    expect(bundleAmount(500, 80)).toBe(40000);
    expect(bundleAmount(333, 80)).toBe(26700);
  });

  it('labels usage rows and follows purchases like an M-Pesa prompt', () => {
    expect(usageStatusLabel('SENT')).toBe('Sent');
    expect(usageStatusLabel('FAILED')).toBe('Failed');
    expect(usageStatusLabel('NO_UNITS')).toBe('Not sent — no SMS units');
    expect(purchaseStkState('PENDING')).toBe('PENDING');
    expect(purchaseStkState('PAID')).toBe('SUCCESS');
    expect(purchaseStkState('FAILED')).toBe('FAILED');
  });
});
