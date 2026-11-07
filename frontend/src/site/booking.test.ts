import { describe, expect, it } from 'vitest';
import {
  bookingErrorMessage,
  STEP_LABELS,
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
});
