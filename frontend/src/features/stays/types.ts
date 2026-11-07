export type PaymentTerms =
  | { kind: 'FULL_UPFRONT' }
  | { kind: 'DEPOSIT'; depositPercent: number; balanceDueDaysBefore: number }
  | { kind: 'ON_ARRIVAL' };

export type CancellationRules =
  | { kind: 'FLEXIBLE' }
  | { kind: 'MODERATE' }
  | { kind: 'STRICT' }
  | {
      kind: 'CUSTOM';
      fullRefundDays: number;
      partialRefundDays: number;
      partialPercent: number;
    };

export interface StayRules {
  bookingMode: 'INSTANT' | 'REQUEST';
  payment: PaymentTerms;
  cancellation: CancellationRules;
}

export interface HostSite {
  slug: string | null;
  published: boolean;
  businessName: string;
  about: string | null;
  logoUploadId: string | null;
  logoUrl: string | null;
  contactPhone: string | null;
  whatsappPhone: string | null;
  rules: StayRules;
  houseRules: string | null;
  checkInTime: string;
  checkOutTime: string;
  address: string | null;
}

export interface SlugCheckResult {
  available: boolean;
  problem: string | null;
}

export interface ListingPhoto {
  id: string;
  uploadId: string;
  position: number;
  caption: string | null;
  url: string;
}

export interface SpecialPrice {
  id: string;
  fromDate: string;
  toDate: string;
  nightlyPrice: string;
  label: string | null;
}

export interface Listing {
  id: string;
  unitId: string;
  propertyId: string;
  unit: { id: string; number: string; floor: number };
  property: {
    id: string;
    code: string;
    name: string;
    location: string | null;
    county: string | null;
  };
  title: string;
  description: string | null;
  area: string | null;
  bedrooms: number;
  bathrooms: number;
  maxGuests: number;
  amenities: string[];
  nightlyPrice: string;
  weekendPrice: string | null;
  cleaningFee: string;
  weeklyDiscountBps: number | null;
  minNights: number;
  checkInInstructions: string | null;
  rulesOverride: StayRules | null;
  published: boolean;
  coverPhotoId: string | null;
  coverUploadId: string | null;
  coverUrl: string | null;
  photos: ListingPhoto[];
  specialPrices: SpecialPrice[];
  createdAt: string;
  updatedAt: string;
}

export type BookingStatus =
  | 'REQUESTED'
  | 'HELD'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'NO_SHOW';

export type BookingKind = 'STAY' | 'BLOCK';
export type BookingSource = 'GUEST' | 'HOST';

export type StayPaymentMethod = 'CASH' | 'BANK_ACCOUNT' | 'MPESA_PAYBILL' | 'MPESA_TILL';

export interface QuoteLine {
  kind: 'NIGHT' | 'DISCOUNT' | 'CLEANING' | 'ADJUSTMENT';
  date?: string;
  label: string;
  amount: string;
}

export interface BookingQuoteResponse {
  quote: {
    nights: number;
    lines: QuoteLine[];
    total: string;
  };
  rules: StayRules;
  dueNow: string;
  balanceDueOn: string | null;
  available: boolean;
  problems: string[];
}

export interface StayPaymentItem {
  id: string;
  number: string;
  kind: 'PAYMENT' | 'REFUND';
  method: StayPaymentMethod;
  channelId: string | null;
  amount: string;
  reference: string | null;
  receivedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
}

export interface Booking {
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
  payments?: StayPaymentItem[];
}

export interface CalendarUnit {
  unitId: string;
  listingId: string;
  unitNumber: string;
  title: string;
  property: { id: string; code: string; name: string };
}

export interface CalendarItem {
  id: string;
  unitId: string;
  listingId: string;
  kind: BookingKind;
  status: BookingStatus;
  checkIn: string;
  checkOut: string;
  guestName: string | null;
  hostNote: string | null;
  code: string;
}

export interface CalendarResponse {
  units: CalendarUnit[];
  items: CalendarItem[];
}
