import { describe, expect, it } from 'vitest';
import {
  monthRange,
  niceMax,
  presetRange,
  rateText,
  share,
  smsStatus,
  smsTypeLabel,
} from './smsLog';

describe('smsTypeLabel', () => {
  it('names known types plainly', () => {
    expect(smsTypeLabel('login_otp')).toBe('Sign-in code');
    expect(smsTypeLabel('rent_reminder')).toBe('Rent reminder');
  });
  it('turns an unknown type into words', () => {
    expect(smsTypeLabel('late_fee_notice')).toBe('Late fee notice');
    expect(smsTypeLabel('')).toBe('Message');
  });
});

describe('smsStatus', () => {
  it('labels each status with a tone', () => {
    expect(smsStatus('SENT')).toEqual({ label: 'Sent', tone: 'ok' });
    expect(smsStatus('FAILED')).toEqual({ label: 'Failed', tone: 'bad' });
    expect(smsStatus('NO_UNITS')).toEqual({ label: 'No units', tone: 'warn' });
    expect(smsStatus('LOGGED')).toEqual({ label: 'Not sent: no provider', tone: 'warn' });
  });
});

describe('rateText', () => {
  it('shows a percentage, or a dash with no messages', () => {
    expect(rateText(0.965)).toBe('96.5%');
    expect(rateText(1)).toBe('100%');
    expect(rateText(0.6)).toBe('60%');
    expect(rateText(null)).toBe('—');
  });
});

describe('monthRange', () => {
  it('covers a past month to its last day', () => {
    expect(monthRange('2026-02', '2026-11-13')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2024-02', '2026-11-13')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });
  it('stops the current month at today', () => {
    expect(monthRange('2026-11', '2026-11-13')).toEqual({ from: '2026-11-01', to: '2026-11-13' });
  });
});

describe('presetRange', () => {
  const today = '2026-11-13';
  it('gives each preset its days', () => {
    expect(presetRange('month', today)).toEqual({ from: '2026-11-01', to: today });
    expect(presetRange('7d', today)).toEqual({ from: '2026-11-07', to: today });
    expect(presetRange('30d', today)).toEqual({ from: '2026-10-15', to: today });
    expect(presetRange('lastMonth', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
  it('crosses the year for last month in January', () => {
    expect(presetRange('lastMonth', '2027-01-05')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});

describe('niceMax', () => {
  it('rounds an axis top up to a readable number', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(23)).toBe(25);
    expect(niceMax(140)).toBe(200);
    expect(niceMax(1000)).toBe(1000);
  });
});

describe('share', () => {
  it('is a percentage of the whole, 0 for nothing', () => {
    expect(share(1, 4)).toBe(25);
    expect(share(1, 3)).toBe(33.3);
    expect(share(5, 0)).toBe(0);
  });
});
