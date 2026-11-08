export class PublicSiteApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'PublicSiteApiError';
    this.status = status;
    this.code = code;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/public${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => null)) as
    | { data?: T; error?: { code?: string; message?: string } }
    | null;
  if (!res.ok) {
    const code = json?.error?.code ?? 'REQUEST_FAILED';
    const message = json?.error?.message ?? `Request failed (${res.status})`;
    throw new PublicSiteApiError(res.status, code, message);
  }
  return (json?.data ?? (json as unknown as T)) as T;
}

export interface PublicListingSummary {
  id: string;
  title: string;
  area: string | null;
  coverUrl: string | null;
  fromPrice: string;
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  totalPrice?: string;
  nights?: number;
}

export interface PublicSiteData {
  redirectTo?: string;
  slug: string;
  businessName: string;
  about: string | null;
  logoUrl: string | null;
  contactPhone: string | null;
  whatsappPhone: string | null;
  houseRules: string | null;
  checkInTime: string;
  checkOutTime: string;
  theme?: { preset: string; brandColor: string | null };
  legalPages?: { key: string; title: string }[];
  listings: PublicListingSummary[];
}

export interface PublicLegalPage {
  key: string;
  title: string;
  text: string;
  updatedAt: string | null;
}

export interface PublicListingDetail {
  id: string;
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
  weeklyDiscountBps: number;
  minNights: number;
  photoUrls: string[];
  photos: { id: string; url: string; caption: string | null; position: number }[];
  cancellationText: string;
  payWhenText: string;
  bookingMode: 'INSTANT' | 'REQUEST';
}

export interface PublicQuoteLine {
  kind: string;
  label: string;
  amount: string;
}

export interface PublicQuoteResponse {
  nights: number;
  lines: PublicQuoteLine[];
  total: string;
  dueNow: string;
  balanceDueOn: string | null;
  payWhen?: 'FULL' | 'DEPOSIT' | 'ON_ARRIVAL';
  payWhenText: string;
  cancellationText: string;
  bookingMode: 'INSTANT' | 'REQUEST';
  canPayInApp: boolean;
  /** False when the dates can't be booked as chosen; `problems` says why, in plain words. */
  available: boolean;
  problems: string[];
}

export interface PublicBookingDetail {
  code: string;
  status: string;
  listing: {
    id: string;
    title: string;
    area: string | null;
  };
  dates: {
    checkIn: string;
    checkOut: string;
    nights: number;
  };
  guests: number;
  lines: PublicQuoteLine[];
  total: string;
  amountPaid: string;
  amountRefunded: string;
  owed: string;
  dueNow: string;
  balanceDueOn: string | null;
  payWhenText: string;
  cancellationText: string;
  holdExpiresAt: string | null;
  checkInInstructions: string | null;
  address: string | null;
  paybill: { number: string; accountRef: string } | null;
  canPayInApp: boolean;
  contact: {
    businessName: string;
    phone: string | null;
    whatsappPhone: string | null;
    checkInTime: string;
    checkOutTime: string;
  };
}

export const publicSiteApi = {
  getSite: (slug: string) => req<PublicSiteData>(`/sites/${encodeURIComponent(slug)}`),

  legal: (slug: string, doc: string) =>
    req<PublicLegalPage>(`/sites/${encodeURIComponent(slug)}/legal/${encodeURIComponent(doc)}`),

  getAvailable: (slug: string, checkIn: string, checkOut: string, guests: number) =>
    req<{ listings: PublicListingSummary[] }>(
      `/sites/${encodeURIComponent(slug)}/available?checkIn=${encodeURIComponent(checkIn)}&checkOut=${encodeURIComponent(checkOut)}&guests=${guests}`,
    ),

  getListing: (slug: string, listingId: string) =>
    req<PublicListingDetail>(
      `/sites/${encodeURIComponent(slug)}/listings/${encodeURIComponent(listingId)}`,
    ),

  getAvailability: (slug: string, listingId: string, from: string, to: string) =>
    req<{ unavailable: string[] }>(
      `/sites/${encodeURIComponent(slug)}/listings/${encodeURIComponent(listingId)}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),

  quote: (
    slug: string,
    listingId: string,
    body: { checkIn: string; checkOut: string; guests: number },
  ) =>
    req<PublicQuoteResponse>(
      `/sites/${encodeURIComponent(slug)}/listings/${encodeURIComponent(listingId)}/quote`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  verifyPhone: (slug: string, phone: string) =>
    req<{ sent: boolean }>(`/sites/${encodeURIComponent(slug)}/verify`, {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  createBooking: (
    slug: string,
    body: {
      listingId: string;
      checkIn: string;
      checkOut: string;
      guests: number;
      name: string;
      phone: string;
      email?: string;
      note?: string;
      code: string;
    },
  ) =>
    req<{ code: string; status: string; link: string }>(
      `/sites/${encodeURIComponent(slug)}/bookings`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  getBooking: (token: string) =>
    req<PublicBookingDetail>(`/bookings/${encodeURIComponent(token)}`),

  payBooking: (token: string, phone?: string) =>
    req<{ id: string; status: string }>(`/bookings/${encodeURIComponent(token)}/pay`, {
      method: 'POST',
      body: JSON.stringify(phone ? { phone } : {}),
    }),

  requestCancelCode: (token: string) =>
    req<{ sent: boolean }>(`/bookings/${encodeURIComponent(token)}/cancel/verify`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  cancelBooking: (token: string, code: string) =>
    req<{ refund: string }>(`/bookings/${encodeURIComponent(token)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
};

/** A smaller WebP size of a public photo (the API makes 160, 480 and 1024 px). */
export function photoSrc(url: string | null, width: 160 | 480 | 1024): string | null {
  return url ? `${url}?w=${width}` : null;
}
