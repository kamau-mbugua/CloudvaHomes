import { describe, expect, it } from 'vitest';
import { broadcastSummary, counterLabel, smsSegments } from './rules';

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
