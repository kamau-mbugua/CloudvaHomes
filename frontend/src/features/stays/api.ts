import { ApiError } from '../../lib/api/client';
import type { StayRules } from './types';

export const DEFAULT_STAY_RULES: StayRules = {
  bookingMode: 'INSTANT',
  payment: { kind: 'FULL_UPFRONT' },
  cancellation: { kind: 'MODERATE' },
};

export function validateStayRules(rules: StayRules): string | null {
  if (rules.bookingMode !== 'INSTANT' && rules.bookingMode !== 'REQUEST') {
    return 'Booking mode must be Instant or Request';
  }
  const p = rules.payment;
  if (p.kind === 'DEPOSIT') {
    if (!Number.isInteger(p.depositPercent) || p.depositPercent < 1 || p.depositPercent > 100) {
      return 'Deposit percent must be an integer between 1 and 100';
    }
    if (!Number.isInteger(p.balanceDueDaysBefore) || p.balanceDueDaysBefore < 0) {
      return 'Balance due days before check-in must be 0 or more';
    }
  } else if (p.kind !== 'FULL_UPFRONT' && p.kind !== 'ON_ARRIVAL') {
    return 'Choose a valid payment rule';
  }

  const c = rules.cancellation;
  if (c.kind === 'CUSTOM') {
    if (!Number.isInteger(c.fullRefundDays) || c.fullRefundDays < 0) {
      return 'Full refund days must be 0 or more';
    }
    if (!Number.isInteger(c.partialRefundDays) || c.partialRefundDays < 0) {
      return 'Partial refund days must be 0 or more';
    }
    if (c.partialRefundDays > c.fullRefundDays) {
      return 'Partial refund cutoff cannot be earlier than full refund cutoff';
    }
    if (!Number.isInteger(c.partialPercent) || c.partialPercent < 0 || c.partialPercent > 100) {
      return 'Partial refund percent must be between 0 and 100';
    }
  } else if (c.kind !== 'FLEXIBLE' && c.kind !== 'MODERATE' && c.kind !== 'STRICT') {
    return 'Choose a valid cancellation rule';
  }

  return null;
}

export const staysKeys = {
  all: ['stays'] as const,
  site: ['stays', 'site'] as const,
  listings: ['stays', 'listings'] as const,
  listing: (id: string) => ['stays', 'listings', id] as const,
  bookings: ['stays', 'bookings'] as const,
  booking: (id: string) => ['stays', 'bookings', id] as const,
  calendar: ['stays', 'calendar'] as const,
  guests: ['stays', 'guests'] as const,
  cleaning: ['stays', 'cleaning'] as const,
  reports: ['stays', 'reports'] as const,
};

export function staysErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.details && error.details.length > 0) {
      return error.details[0].message;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export const COMMON_AMENITIES = [
  'Wi-Fi',
  'Kitchen',
  'Free parking',
  'Air conditioning',
  'Washing machine',
  'TV',
  'Hot water',
  'Workspace',
  'Pool',
  'Gym',
  'Balcony',
  'Backup power',
  '24-hour security',
  'Elevator',
] as const;
