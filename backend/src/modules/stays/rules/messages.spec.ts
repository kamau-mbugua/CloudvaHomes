import { isGsm7, smsSegments } from '../../tenant-portal/broadcast-rules.js';
import { guestSms } from './messages.js';

describe('stays/rules/messages — guestSms', () => {
  const base = {
    biz: 'Diani Stays',
    unit: 'Coral Reef Villa',
    checkIn: '2026-12-12',
    checkOut: '2026-12-15',
    code: 'B00001',
    link: 'https://diani.kodihub.co.ke/b/tok123',
  };

  it('formats REQUESTED', () => {
    expect(guestSms('REQUESTED', base)).toBe(
      "Diani Stays: we got your request for Coral Reef Villa, 12 Dec to 15 Dec. We'll reply within 24 hours. Booking B00001: https://diani.kodihub.co.ke/b/tok123",
    );
  });

  it('formats CONFIRMED with and without link', () => {
    expect(guestSms('CONFIRMED', base)).toBe(
      'Diani Stays: your stay at Coral Reef Villa, 12 Dec to 15 Dec is confirmed. Booking B00001: https://diani.kodihub.co.ke/b/tok123',
    );
    expect(guestSms('CONFIRMED', { ...base, link: '' })).toBe(
      'Diani Stays: your stay at Coral Reef Villa, 12 Dec to 15 Dec is confirmed. Booking B00001.',
    );
  });

  it('formats PAY_NOW', () => {
    expect(
      guestSms('PAY_NOW', {
        ...base,
        amount: 650000n,
      }),
    ).toBe(
      'Diani Stays: your request is accepted. Pay KES 6,500 within 12 hours to keep the dates: https://diani.kodihub.co.ke/b/tok123',
    );
  });

  it('formats HELD (instant booking) with the real hold window, not the 12-hour request window', () => {
    expect(guestSms('HELD', { ...base, amount: 650000n, window: '15 minutes' })).toBe(
      'Diani Stays: we are holding Coral Reef Villa, 12 Dec to 15 Dec for you. Pay KES 6,500 within 15 minutes to confirm. Booking B00001: https://diani.kodihub.co.ke/b/tok123',
    );
    expect(guestSms('HELD', { ...base, amount: 650000n, window: '2 hours', link: '' })).toBe(
      'Diani Stays: we are holding Coral Reef Villa, 12 Dec to 15 Dec for you. Pay KES 6,500 within 2 hours to confirm. Booking B00001.',
    );
  });

  it('formats PAYMENT', () => {
    expect(
      guestSms('PAYMENT', {
        ...base,
        amount: 400000n,
        due: 900000n,
      }),
    ).toBe('Diani Stays: we received KES 4,000 for booking B00001. Still to pay: KES 9,000.');
  });

  it('formats DECLINED', () => {
    expect(guestSms('DECLINED', base)).toBe(
      "Diani Stays: sorry, Coral Reef Villa isn't available for 12 Dec to 15 Dec.",
    );
  });

  it('formats EXPIRED', () => {
    expect(guestSms('EXPIRED', base)).toBe(
      "Diani Stays: your booking B00001 wasn't paid in time, so the dates were released.",
    );
  });

  it('formats CANCELLED', () => {
    expect(
      guestSms('CANCELLED', {
        ...base,
        refund: 650000n,
      }),
    ).toBe('Diani Stays: booking B00001 is cancelled. Refund: KES 6,500.');
  });

  it('formats BALANCE_DUE', () => {
    expect(
      guestSms('BALANCE_DUE', {
        ...base,
        due: 900000n,
      }),
    ).toBe(
      'Diani Stays: KES 9,000 is due for your stay on 12 Dec. Pay here: https://diani.kodihub.co.ke/b/tok123',
    );
  });

  it('formats CHECKIN_INFO', () => {
    expect(
      guestSms('CHECKIN_INFO', {
        ...base,
        time: '14:00',
        instructions: 'Ask for Joseph at the gate.',
      }),
    ).toBe('Diani Stays: welcome on 12 Dec! Check-in from 14:00. Ask for Joseph at the gate.');
  });

  it('keeps every guest SMS in the plain SMS alphabet (160 characters a unit, not 70)', () => {
    const events = [
      'REQUESTED',
      'CONFIRMED',
      'HELD',
      'PAY_NOW',
      'PAYMENT',
      'DECLINED',
      'EXPIRED',
      'CANCELLED',
      'BALANCE_DUE',
      'CHECKIN_INFO',
    ] as const;
    for (const e of events) {
      const data = { ...base, amount: 650000n, due: 900000n, refund: 0n, time: '14:00' };
      const text = guestSms(e, data);
      expect(isGsm7(text), `${e}: ${text}`).toBe(true);
      // Without a booking link every one fits a single SMS.
      expect(smsSegments(guestSms(e, { ...data, link: '' })), e).toBe(1);
    }
  });

  it('shows cents only when an amount has them', () => {
    expect(guestSms('PAYMENT', { ...base, amount: 400050n, due: 0n })).toBe(
      'Diani Stays: we received KES 4,000.50 for booking B00001. Still to pay: KES 0.',
    );
  });
});
