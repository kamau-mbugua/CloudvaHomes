/**
 * Host booking sites: theme presets and starter legal pages.
 *
 * The legal texts are plain-English STARTER templates in Markdown (## section headings, - bullet
 * lists) that the host can edit in Site settings. They are not legal advice; KodiHub Legal should
 * review them once, and hosts are told to review theirs. A host's own text
 * (HostSite.termsText / termsOfUseText / privacyText) replaces them.
 */

export const THEME_PRESETS = [
  'forest',
  'ocean',
  'sunset',
  'terracotta',
  'plum',
  'charcoal',
] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

export const LEGAL_DOCS = [
  { key: 'terms', title: 'Terms and Conditions', field: 'termsText' },
  { key: 'terms-of-use', title: 'Terms of Use', field: 'termsOfUseText' },
  { key: 'privacy', title: 'Privacy Policy', field: 'privacyText' },
] as const;
export type LegalDocKey = (typeof LEGAL_DOCS)[number]['key'];

export interface LegalContext {
  businessName: string;
  contactPhone: string | null;
  siteAddress: string | null;
}

function contactLine(c: LegalContext): string {
  const parts = [
    c.contactPhone ? `phone or WhatsApp ${c.contactPhone}` : null,
    c.siteAddress,
  ].filter(Boolean);
  return parts.length > 0
    ? `contact ${c.businessName} (${parts.join(', ')})`
    : `contact ${c.businessName} using the details on this website`;
}

export function legalTemplate(doc: LegalDocKey, c: LegalContext): string {
  const biz = c.businessName;
  const contact = contactLine(c);

  if (doc === 'terms') {
    return `These terms apply when you book a stay with ${biz} ("we", "us") through this website.

## 1. Your booking
A booking is confirmed when you receive a confirmation message from us. If a stay needs approval, it is only confirmed once we accept it. The total price, what is due now and the cancellation policy are shown before you book and in your booking page.

## 2. Payment
Payments go directly to ${biz}. Pay the amount shown by the date shown. If payment is not received in time, held dates may be released.

## 3. Cancellations and refunds
The cancellation policy shown at booking applies to your stay. Refunds, where due, are paid back by the method you paid with or another method we agree with you.

## 4. Check-in and check-out
Check-in and check-out times are shown on this website and in your booking. You may be asked for a valid ID at check-in.

## 5. During your stay
Please follow the house rules and treat the property with care. You are responsible for damage caused during your stay by you or your guests, beyond normal wear and tear. The number of guests must not exceed what you booked.

## 6. Changes on our side
If something outside our control stops us from hosting you, we will tell you as soon as possible and refund what you paid for the affected nights or offer a suitable alternative.

## 7. Contact
For questions about these terms or your booking, ${contact}.`;
  }

  if (doc === 'terms-of-use') {
    return `These terms apply to your use of the ${biz} booking website.

## 1. Using this website
You may use this website to look at our stays, check availability and make bookings for yourself or people travelling with you. Please do not misuse it, for example by trying to disrupt it or by making bookings you do not intend to keep.

## 2. Information on this website
We try to keep descriptions, photos, prices and availability accurate and up to date. Prices and availability can change until a booking is confirmed.

## 3. Messages and links
Buttons such as WhatsApp or call links open other apps or services, which have their own terms.

## 4. The platform
This website runs on KodiHub, a software platform. ${biz} is responsible for the stays, prices and bookings offered here.

## 5. Changes
We may update these terms from time to time. The version on this page applies when you use the website.

## 6. Contact
For questions about this website, ${contact}.`;
  }

  return `This policy explains how ${biz} ("we", "us") uses your personal information when you use this website or book a stay with us.

## 1. What we collect
- Your name, phone number and, if you give it, your email address.
- Booking details: dates, number of guests, notes you send us and payments you make.
- If we ask for it at check-in, your ID or passport number, which is stored encrypted.

## 2. Why we use it
- To manage your booking, confirm your phone number by SMS and send you booking messages.
- To take and record payments, including M-Pesa payments.
- To keep accurate records and meet our legal obligations.

## 3. Who we share it with
- KodiHub, the platform that runs this website, which processes your information for us.
- Safaricom (M-Pesa) and SMS providers, only as needed to take payments and send messages.
- Authorities, when the law requires it.
We do not sell your personal information.

## 4. How long we keep it
We keep booking and payment records for as long as the law and our accounting needs require, and delete or anonymise information we no longer need.

## 5. Your rights
Under the Data Protection Act, 2019 (Kenya) you may ask to see the information we hold about you, to correct it, or to delete it where the law allows, and you may object to how we use it.

## 6. Contact
To use these rights or ask a question about your information, ${contact}.`;
}
