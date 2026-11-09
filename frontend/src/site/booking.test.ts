import { describe, expect, it } from 'vitest';
import {
  amountDueNow,
  howToPayLine,
  bookingErrorMessage,
  STEP_LABELS,
  checkOutAfter,
  dateRangeProblem,
  nairobiToday,
  nextDay,
  holdTimeLeft,
  bookingSteps,
  guestStatusLabel,
  isNightDisabled,
  payLabel,
} from './booking';

describe('site/booking — steps, labels, date availability, and DATES_TAKEN error', () => {
  it('advances bookingSteps through dates -> details -> code -> review -> pay|sent', () => {
    expect(
      bookingSteps({
        hasDates: false,
        hasDetails: false,
        hasVerifiedCode: false,
        hasReviewed: false,
        bookingMode: 'INSTANT',
      }).next,
    ).toBe('dates');

    expect(
      bookingSteps({
        hasDates: true,
        hasDetails: false,
        hasVerifiedCode: false,
        hasReviewed: false,
        bookingMode: 'INSTANT',
      }).next,
    ).toBe('details');

    expect(
      bookingSteps({
        hasDates: true,
        hasDetails: true,
        hasVerifiedCode: false,
        hasReviewed: false,
        bookingMode: 'INSTANT',
      }).next,
    ).toBe('code');

    expect(
      bookingSteps({
        hasDates: true,
        hasDetails: true,
        hasVerifiedCode: true,
        hasReviewed: false,
        bookingMode: 'INSTANT',
      }).next,
    ).toBe('review');

    expect(
      bookingSteps({
        hasDates: true,
        hasDetails: true,
        hasVerifiedCode: true,
        hasReviewed: true,
        bookingMode: 'INSTANT',
      }).next,
    ).toBe('pay');

    expect(
      bookingSteps({
        hasDates: true,
        hasDetails: true,
        hasVerifiedCode: true,
        hasReviewed: true,
        bookingMode: 'REQUEST',
      }).next,
    ).toBe('sent');
  });

  it('formats payLabel for instant payment, request mode, and pay on arrival', () => {
    expect(payLabel('450000', 'FULL', 'INSTANT')).toBe('Pay KES 4,500 now');
    expect(payLabel('225000', 'DEPOSIT', 'INSTANT')).toBe('Pay KES 2,250 now');
    expect(payLabel('0', 'ON_ARRIVAL', 'INSTANT')).toBe('Book — pay on arrival');
    expect(payLabel('450000', 'FULL', 'REQUEST')).toBe('Send request');
  });

  it('disables dates present in unavailable or before minimum date', () => {
    const unavailable = new Set(['2026-12-10', '2026-12-11']);
    expect(isNightDisabled('2026-12-10', unavailable, '2026-12-01')).toBe(true);
    expect(isNightDisabled('2026-12-12', unavailable, '2026-12-01')).toBe(false);
    expect(isNightDisabled('2026-11-30', unavailable, '2026-12-01')).toBe(true);
  });

  it('maps DATES_TAKEN errors to the friendly guest message', () => {
    expect(bookingErrorMessage({ code: 'DATES_TAKEN', message: 'Conflict' })).toBe(
      'Those dates were just taken — pick other dates',
    );
    expect(bookingErrorMessage(new Error('Network down'))).toBe('Network down');
  });

  it('names every booking step and status in plain English for guests', () => {
    expect(STEP_LABELS).toEqual({
      dates: 'Dates',
      details: 'Your details',
      code: 'Confirm phone',
      review: 'Review',
      pay: 'Pay',
      sent: 'Request sent',
    });
    expect(guestStatusLabel('HELD')).toBe('Waiting for payment');
    expect(guestStatusLabel('REQUESTED')).toBe('Waiting for the host');
    expect(guestStatusLabel('CHECKED_IN')).toBe('Checked in');
    expect(guestStatusLabel('NO_SHOW')).toBe('No-show');
    expect(guestStatusLabel('SOMETHING_NEW')).toBe('Something new');
  });

  it('writes the hold time left the way people say it', () => {
    expect(holdTimeLeft(7197)).toBe('1 h 59 min');
    expect(holdTimeLeft(3600)).toBe('1 h 0 min');
    expect(holdTimeLeft(899)).toBe('14:59');
    expect(holdTimeLeft(5)).toBe('0:05');
    expect(holdTimeLeft(0)).toBe('0:00');
  });

  it('keeps stays at least one night and never in the past', () => {
    expect(nextDay('2026-11-08')).toBe('2026-11-09');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(nairobiToday(new Date('2026-11-07T22:30:00Z'))).toBe('2026-11-08');
    // Moving check-in on/after check-out pushes check-out to the next day; otherwise it stays.
    expect(checkOutAfter('2026-11-08', '2026-11-08')).toBe('2026-11-09');
    expect(checkOutAfter('2026-11-10', '2026-11-09')).toBe('2026-11-11');
    expect(checkOutAfter('2026-11-08', '2026-11-12')).toBe('2026-11-12');
    expect(checkOutAfter('2026-11-08', '')).toBe('');
    const today = '2026-11-08';
    expect(dateRangeProblem('2026-11-08', '2026-11-08', today)).toBe('Check-out must be at least one night after check-in.');
    expect(dateRangeProblem('2026-11-07', '2026-11-09', today)).toBe('Check-in can’t be in the past.');
    expect(dateRangeProblem('2026-11-08', '', today)).toBe('Choose a check-out date.');
    expect(dateRangeProblem('', '2026-11-09', today)).toBe('Choose a check-in date.');
    expect(dateRangeProblem('2026-11-08', '2026-11-10', today)).toBeNull();
  });
});

describe('amount due now (same rule as the server’s M-Pesa prompt)', () => {
  const b = (status: string, dueNow: number, paid: number, refunded: number, owed: number) => ({
    status,
    dueNow: String(dueNow),
    amountPaid: String(paid),
    amountRefunded: String(refunded),
    owed: String(owed),
  });

  it('takes a part payment off the deposit while dates are held', () => {
    expect(amountDueNow(b('HELD', 500000, 200000, 0, 800000))).toBe(300000n);
    expect(amountDueNow(b('HELD', 500000, 0, 0, 1000000))).toBe(500000n);
  });

  it('counts refunds back in', () => {
    expect(amountDueNow(b('HELD', 500000, 200000, 50000, 850000))).toBe(350000n);
  });

  it('asks for the rest of the stay once the deposit is covered or the stay is confirmed', () => {
    expect(amountDueNow(b('HELD', 500000, 500000, 0, 500000))).toBe(500000n);
    expect(amountDueNow(b('CONFIRMED', 500000, 500000, 0, 500000))).toBe(500000n);
    expect(amountDueNow(b('CONFIRMED', 500000, 1000000, 0, 0))).toBe(0n);
  });
});

describe('how to pay when the host takes no payments in the site', () => {
  const contact = { businessName: 'Makini Homes', phone: '+254712000001', whatsappPhone: null };

  it('tells the guest the host will say how to pay, with a way to reach them', () => {
    expect(howToPayLine({ canPayInApp: false, paybill: null, contact })).toBe(
      'Makini Homes will tell you how to pay. Call +254712000001 if you have not heard from them.',
    );
    expect(howToPayLine({ canPayInApp: false, paybill: null, contact: { ...contact, phone: null, whatsappPhone: '+254700000002' } })).toBe(
      'Makini Homes will tell you how to pay. WhatsApp +254700000002 if you have not heard from them.',
    );
    expect(howToPayLine({ canPayInApp: false, paybill: null, contact: { ...contact, phone: null } })).toBe(
      'Makini Homes will tell you how to pay.',
    );
  });

  it('says nothing when the guest can pay by M-Pesa here', () => {
    expect(howToPayLine({ canPayInApp: true, paybill: null, contact })).toBeNull();
    expect(howToPayLine({ canPayInApp: false, paybill: { number: '522522', accountRef: 'B00012' }, contact })).toBeNull();
  });
});

