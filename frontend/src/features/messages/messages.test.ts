import { describe, expect, it } from 'vitest';
import { broadcastSummary, counterLabel, noticeSmsText, smsSegments } from './rules';
import { unitsLine } from './rules';

describe('smsSegments', () => {
  it('matches the server: 160/153 for plain text, 70/67 otherwise', () => {
    expect(smsSegments('a'.repeat(160))).toBe(1);
    expect(smsSegments('a'.repeat(161))).toBe(2);
    expect(smsSegments('✓'.repeat(71))).toBe(2);
    expect(smsSegments('€'.repeat(81))).toBe(2);
  });
});

describe('counterLabel', () => {
  it('shows length, SMS per tenant and the total', () => {
    expect(counterLabel('Water off Saturday.', 23)).toBe('19 / 480 characters · 1 SMS per tenant · about 23 SMS');
    expect(counterLabel('a'.repeat(161), 23)).toBe('161 / 480 characters · 2 SMS per tenant · about 46 SMS');
    expect(counterLabel('', 23)).toBe('0 / 480 characters');
    // The name in front counts: 150 typed + "Makini Homes: " goes over one SMS.
    expect(counterLabel('a'.repeat(150), 10, 'Makini Homes')).toBe('150 / 480 characters · 2 SMS per tenant · about 20 SMS');
  });
});

describe('broadcastSummary', () => {
  it('reads the counts in plain words', () => {
    expect(broadcastSummary({ status: 'DONE', recipients: 3, sent: 2, failed: 1, emailed: 1, notified: 2, alsoEmail: true }))
      .toBe('2 of 3 texts sent · 1 failed · 1 emailed · 2 in the tenant app');
    expect(broadcastSummary({ status: 'SENDING', recipients: 3, sent: 0, failed: 0, emailed: 0, notified: 0, alsoEmail: false }))
      .toBe('Sending to 3 tenants…');
    expect(broadcastSummary({ status: 'DONE', recipients: 1, sent: 1, failed: 0, emailed: 0, notified: 0, alsoEmail: false }))
      .toBe('1 of 1 text sent');
  });
});

describe('SMS units before a notice goes out', () => {
  const platform = { mode: 'PLATFORM' as const, balance: 5 };
  it('says how many units it needs against the balance', () => {
    expect(unitsLine(2, 3, platform)).toEqual({ text: 'About 6 SMS units · you have 5', short: true });
    expect(unitsLine(1, 3, platform)).toEqual({ text: 'About 3 SMS units · you have 5', short: false });
  });
  it('says nothing about units on the organisation’s own SMS account', () => {
    expect(unitsLine(2, 3, { mode: 'OWN', balance: 0 })).toEqual({ text: 'Sent from your own SMS account', short: false });
    expect(unitsLine(2, 3, null)).toBeNull();
  });
});

describe('noticeSmsText', () => {
  it('puts the organisation name in front unless the notice starts with it', () => {
    expect(noticeSmsText('Makini Homes', ' Water off Saturday. ')).toBe('Makini Homes: Water off Saturday.');
    expect(noticeSmsText('Makini Homes', 'Makini Homes - water off.')).toBe('Makini Homes - water off.');
    expect(noticeSmsText('', 'Water off.')).toBe('Water off.');
  });
});
