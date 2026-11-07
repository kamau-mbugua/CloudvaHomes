import { describe, expect, it } from 'vitest';
import {
  bookingErrorMessage,
  bookingSteps,
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
});
