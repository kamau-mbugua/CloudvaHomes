import { formatDateOnly, formatDateOnlyOrNull } from '../../../common/dates/date-only.js';
import type {
  BookingKind,
  BookingSource,
  BookingStatus,
} from '../../../generated/prisma/client.js';
import type { QuoteLine } from '../rules/pricing.js';
import type { StayRules } from '../rules/terms.js';

export interface RawBookingPaymentForView {
  id: string;
  number: string;
  kind: 'PAYMENT' | 'REFUND';
  method: string;
  channelId: string | null;
  amount: bigint;
  reference: string | null;
  receivedAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
  createdAt: Date;
}

export interface RawBookingForView {
  id: string;
  code: string;
  kind: BookingKind;
  status: BookingStatus;
  source: BookingSource;
  unitId: string;
  propertyId: string;
  listingId: string;
  checkIn: Date;
  checkOut: Date;
  guests: number;
  holdExpiresAt: Date | null;
  requestExpiresAt: Date | null;
  total: bigint;
  dueNow: bigint;
  balanceDueOn: Date | null;
  amountPaid: bigint;
  amountRefunded: bigint;
  lines: unknown;
  rules: unknown;
  guestNote: string | null;
  hostNote: string | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  unit: { id: string; number: string };
  property: { id: string; code: string; name: string };
  listing: { id: string; title: string };
  guest: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
  } | null;
  payments?: RawBookingPaymentForView[];
}

export interface BookingView {
  id: string;
  code: string;
  kind: BookingKind;
  status: BookingStatus;
  source: BookingSource;
  unitId: string;
  propertyId: string;
  listingId: string;
  unit: { id: string; number: string };
  property: { id: string; code: string; name: string };
  listing: { id: string; title: string };
  checkIn: string;
  checkOut: string;
  guests: number;
  holdExpiresAt: string | null;
  requestExpiresAt: string | null;
  balanceDueOn: string | null;
  rules: StayRules;
  guestNote: string | null;
  hostNote: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  createdAt: string;
  updatedAt: string;
  guest: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  } | null;
  total?: string;
  dueNow?: string;
  amountPaid?: string;
  amountRefunded?: string;
  lines?: QuoteLine[];
  payments?: {
    id: string;
    number: string;
    kind: 'PAYMENT' | 'REFUND';
    method: string;
    channelId: string | null;
    amount: string;
    reference: string | null;
    receivedAt: string;
    voidedAt: string | null;
    voidReason: string | null;
    createdAt: string;
  }[];
}

export function nairobiToday(now = new Date()): string {
  // Africa/Nairobi is UTC+3 year-round.
  const eat = new Date(now.getTime() + 3 * 3600_000);
  return eat.toISOString().slice(0, 10);
}

export function viewBooking(
  b: RawBookingForView,
  caller: { permissions: ReadonlySet<string> },
  today: string,
): BookingView {
  const checkIn = formatDateOnly(b.checkIn);
  const checkOut = formatDateOnly(b.checkOut);
  const canSeePayments = caller.permissions.has('stay-payments:view');
  const canSeeGuests = caller.permissions.has('guests:view');
  const isActiveToday = checkIn <= today && today <= checkOut;
  const showGuestContact = canSeeGuests || isActiveToday;

  const base: BookingView = {
    id: b.id,
    code: b.code,
    kind: b.kind,
    status: b.status,
    source: b.source,
    unitId: b.unitId,
    propertyId: b.propertyId,
    listingId: b.listingId,
    unit: b.unit,
    property: b.property,
    listing: b.listing,
    checkIn,
    checkOut,
    guests: b.guests,
    holdExpiresAt: b.holdExpiresAt ? b.holdExpiresAt.toISOString() : null,
    requestExpiresAt: b.requestExpiresAt ? b.requestExpiresAt.toISOString() : null,
    balanceDueOn: formatDateOnlyOrNull(b.balanceDueOn),
    rules: b.rules as StayRules,
    guestNote: b.guestNote,
    hostNote: b.hostNote,
    cancelledAt: b.cancelledAt ? b.cancelledAt.toISOString() : null,
    cancelledBy: b.cancelledBy,
    cancelReason: b.cancelReason,
    checkedInAt: b.checkedInAt ? b.checkedInAt.toISOString() : null,
    checkedOutAt: b.checkedOutAt ? b.checkedOutAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    guest: b.guest
      ? {
          id: b.guest.id,
          name: b.guest.name,
          phone: showGuestContact ? b.guest.phone : null,
          email: showGuestContact ? b.guest.email : null,
        }
      : null,
  };

  if (!canSeePayments) {
    return base;
  }

  return {
    ...base,
    total: b.total.toString(),
    dueNow: b.dueNow.toString(),
    amountPaid: b.amountPaid.toString(),
    amountRefunded: b.amountRefunded.toString(),
    lines: (Array.isArray(b.lines) ? b.lines : []) as QuoteLine[],
    ...(b.payments
      ? {
          payments: b.payments.map((p) => ({
            id: p.id,
            number: p.number,
            kind: p.kind,
            method: p.method,
            channelId: p.channelId,
            amount: p.amount.toString(),
            reference: p.reference,
            receivedAt: p.receivedAt.toISOString(),
            voidedAt: p.voidedAt ? p.voidedAt.toISOString() : null,
            voidReason: p.voidReason,
            createdAt: p.createdAt.toISOString(),
          })),
        }
      : {}),
  };
}
