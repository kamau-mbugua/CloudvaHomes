import { describe, expect, it } from 'vitest';
import { viewBooking, type RawBookingForView } from './booking-view.js';

function sampleBooking(overrides: Partial<RawBookingForView> = {}): RawBookingForView {
  return {
    id: 'b-1',
    code: 'B00001',
    kind: 'STAY',
    status: 'CONFIRMED',
    source: 'HOST',
    unitId: 'u-1',
    propertyId: 'p-1',
    listingId: 'l-1',
    checkIn: new Date('2026-11-10T00:00:00.000Z'),
    checkOut: new Date('2026-11-13T00:00:00.000Z'),
    guests: 2,
    holdExpiresAt: null,
    requestExpiresAt: null,
    total: 900000n,
    dueNow: 900000n,
    balanceDueOn: null,
    amountPaid: 300000n,
    amountRefunded: 0n,
    amountWrittenOff: 0n,
    writtenOffAt: null,
    writeOffReason: null,
    lines: [{ kind: 'NIGHT', date: '2026-11-10', label: 'Night of 2026-11-10', amount: '300000' }],
    rules: {
      bookingMode: 'INSTANT',
      payWhen: 'FULL',
      depositPercent: null,
      depositFixed: null,
      balanceDue: 'ON_ARRIVAL',
      balanceDaysBefore: 0,
      cancellation: 'MODERATE',
      customFullRefundDays: null,
      customLatePercent: null,
    },
    guestNote: 'Late arrival',
    hostNote: 'VIP guest',
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    checkedInAt: null,
    checkedOutAt: null,
    createdAt: new Date('2026-11-01T10:00:00.000Z'),
    updatedAt: new Date('2026-11-01T10:00:00.000Z'),
    unit: { id: 'u-1', number: 'A1' },
    property: { id: 'p-1', code: 'CC', name: 'Cozy Court' },
    listing: { id: 'l-1', title: 'Sunny Studio A1' },
    guest: {
      id: 'g-1',
      name: 'Amina Guest',
      phone: '+254711222333',
      email: 'amina@example.invalid',
    },
    ...overrides,
  };
}

describe('viewBooking', () => {
  const caretakerPerms = new Set(['bookings:view', 'bookings:update', 'cleaning:view']);
  const ownerPerms = new Set([
    'bookings:view',
    'bookings:update',
    'stay-payments:view',
    'guests:view',
  ]);

  it('caretaker sees today’s guest phone when checkIn <= today <= checkOut, never total', () => {
    const view = viewBooking(sampleBooking(), { permissions: caretakerPerms }, '2026-11-10');
    expect(view.guest?.phone).toBe('+254711222333');
    expect(view.guest?.email).toBe('amina@example.invalid');
    expect('total' in view).toBe(false);
    expect('dueNow' in view).toBe(false);
    expect('amountPaid' in view).toBe(false);
    expect('amountRefunded' in view).toBe(false);
    expect('lines' in view).toBe(false);
  });

  it('caretaker does not see tomorrow’s guest phone or email', () => {
    const view = viewBooking(sampleBooking(), { permissions: caretakerPerms }, '2026-11-09');
    expect(view.guest?.name).toBe('Amina Guest');
    expect(view.guest?.phone).toBeNull();
    expect(view.guest?.email).toBeNull();
    expect('total' in view).toBe(false);
  });

  it('owner with stay-payments:view and guests:view sees money fields and future guest contact', () => {
    const view = viewBooking(sampleBooking(), { permissions: ownerPerms }, '2026-11-01');
    expect(view.total).toBe('900000');
    expect(view.dueNow).toBe('900000');
    expect(view.amountPaid).toBe('300000');
    expect(view.amountRefunded).toBe('0');
    expect(view.lines).toHaveLength(1);
    expect(view.guest?.phone).toBe('+254711222333');
    expect(view.guest?.email).toBe('amina@example.invalid');
  });
});
