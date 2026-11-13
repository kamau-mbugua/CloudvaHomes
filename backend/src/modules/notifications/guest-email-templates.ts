import type { EmailTemplateDefinition, EmailTemplateVariable } from './email-templates.js';

/** Emails to short-stay guests: one for each booking SMS, in the host's name. */
export const GUEST_EMAIL_TEMPLATE_KEYS = [
  'guest_booking_requested',
  'guest_booking_held',
  'guest_booking_accepted',
  'guest_booking_confirmed',
  'guest_payment_received',
  'guest_balance_due',
  'guest_checkin_info',
  'guest_booking_declined',
  'guest_booking_expired',
  'guest_booking_cancelled',
] as const;

export type GuestEmailTemplateKey = (typeof GUEST_EMAIL_TEMPLATE_KEYS)[number];

const v = (key: string, description: string, sample: string): EmailTemplateVariable => ({
  key,
  description,
  sample,
});

/** Filled in for every guest email. */
const COMMON: EmailTemplateVariable[] = [
  v('guestName', 'Guest’s first name', 'Achieng'),
  v('businessName', 'The host’s business name', 'Makini Homes'),
  v('bookingCode', 'Booking code', 'B00006'),
  v('listingTitle', 'The place booked', 'Cozy 1BR with balcony'),
  v('checkInDate', 'Check-in day', 'Fri 13 Nov 2026'),
  v('checkOutDate', 'Check-out day', 'Sat 14 Nov 2026'),
  v(
    'bookingSummary',
    'The booking in lines: place, address, map, dates, guests, total, paid, balance',
    'Booking: B00006\nPlace: Cozy 1BR with balcony\nAddress: Makini Court, Argwings Kodhek Rd, Nairobi\nMap: https://www.google.com/maps/search/?api=1&query=-1.292066,36.787194\nCheck-in: Fri 13 Nov 2026 from 14:00\nCheck-out: Sat 14 Nov 2026 by 10:00\nGuests: 2\nTotal: KES 5,500\nPaid: KES 2,750\nStill to pay: KES 2,750',
  ),
  v(
    'bookingLinkLine',
    'The guest’s booking page link, as a line (empty for host-made bookings)',
    'Your booking page: https://makini.kodihub.co.ke/b/…',
  ),
  v(
    'hostContactLine',
    'How to reach the host, as a line',
    'Questions? Call or WhatsApp Makini Homes on 0712 000 000.',
  ),
];

const tpl = (
  key: GuestEmailTemplateKey,
  name: string,
  description: string,
  defaultSubject: string,
  defaultBody: string,
  extra: EmailTemplateVariable[] = [],
): EmailTemplateDefinition => ({
  key,
  name,
  category: 'Guest Communications',
  description,
  defaultSubject,
  defaultBody,
  variables: [...COMMON, ...extra],
});

const AMOUNT = v('amount', 'The amount (to pay, or received)', 'KES 2,750');
const PAY_LINES = v(
  'payLines',
  'How to pay: the booking page and the host’s M-Pesa paybill, as lines',
  'Pay on your booking page: https://makini.kodihub.co.ke/b/…\nM-Pesa paybill: 600111, account B00006',
);
const GETTING_THERE = v(
  'gettingThere',
  'Address, map link, check-in time and the host’s instructions, as lines',
  'Address: Makini Court, Argwings Kodhek Rd, Nairobi\nMap: https://www.google.com/maps/search/?api=1&query=-1.292066,36.787194\nCheck-in: from 14:00\nInstructions: Collect keys from the guard.',
);
const RECEIPTS_LINE = v(
  'receiptsLine',
  'Which receipts are attached, as a line (empty when none)',
  'Your receipts SRC-2026-000004 and SRC-2026-000005 are attached.',
);

export const GUEST_EMAIL_TEMPLATES: Record<GuestEmailTemplateKey, EmailTemplateDefinition> = {
  guest_booking_requested: tpl(
    'guest_booking_requested',
    'Guest: Booking request received',
    'Sent to the guest when they ask to book a place that needs the host’s approval.',
    '{{businessName}}: we got your booking request {{bookingCode}}',
    'Hi {{guestName}},\n\n' +
      'Thank you for asking to stay at {{listingTitle}}. {{businessName}} will reply within 24 hours. Nothing is due until they accept.\n\n' +
      '--- Your request ---\n{{bookingSummary}}\n\n' +
      '{{bookingLinkLine}}\n\n{{hostContactLine}}',
  ),
  guest_booking_held: tpl(
    'guest_booking_held',
    'Guest: Place held, pay to confirm',
    'Sent when a guest books on the host’s site and the place is held until they pay.',
    '{{businessName}}: pay {{amount}} within {{window}} to confirm booking {{bookingCode}}',
    'Hi {{guestName}},\n\n' +
      'We are holding {{listingTitle}} for you. Pay {{amount}} within {{window}} to confirm your booking. After that the dates are released.\n\n' +
      '--- How to pay ---\n{{payLines}}\n\n' +
      '--- Your booking ---\n{{bookingSummary}}\n\n{{hostContactLine}}',
    [AMOUNT, v('window', 'How long the place is held', '2 hours'), PAY_LINES],
  ),
  guest_booking_accepted: tpl(
    'guest_booking_accepted',
    'Guest: Request accepted, pay to confirm',
    'Sent when the host accepts a booking request that needs a payment to confirm.',
    '{{businessName}} accepted your request: pay {{amount}} to confirm {{bookingCode}}',
    'Hi {{guestName}},\n\n' +
      'Good news: {{businessName}} accepted your request for {{listingTitle}}. Pay {{amount}} within 12 hours to keep the dates.\n\n' +
      '--- How to pay ---\n{{payLines}}\n\n' +
      '--- Your booking ---\n{{bookingSummary}}\n\n{{hostContactLine}}',
    [AMOUNT, PAY_LINES],
  ),
  guest_booking_confirmed: tpl(
    'guest_booking_confirmed',
    'Guest: Booking confirmed',
    'Sent when a booking is confirmed, with every receipt so far attached.',
    'Booking confirmed: {{listingTitle}}, {{checkInDate}}',
    'Hi {{guestName}},\n\n' +
      'Your stay at {{listingTitle}} is confirmed. We look forward to hosting you.\n\n' +
      '--- Your booking ---\n{{bookingSummary}}\n\n' +
      '{{receiptsLine}}\n\n{{bookingLinkLine}}\n\n{{hostContactLine}}',
    [RECEIPTS_LINE],
  ),
  guest_payment_received: tpl(
    'guest_payment_received',
    'Guest: Payment receipt',
    'Sent for every payment on a booking with its receipt PDF; once fully paid, every receipt is attached.',
    'Receipt {{receiptNumber}}: {{amount}} received for booking {{bookingCode}}',
    'Hi {{guestName}},\n\n' +
      'Thank you. {{businessName}} has received {{amount}} for booking {{bookingCode}}. {{statusLine}}\n\n' +
      '--- Payment ---\n' +
      'Receipt number: {{receiptNumber}}\n' +
      'Amount: {{amount}}\n' +
      'Method: {{paymentMethod}}\n' +
      'Date: {{receivedAt}}\n\n' +
      '--- Your booking ---\n{{bookingSummary}}\n\n' +
      '{{receiptsLine}}\n\n{{hostContactLine}}',
    [
      AMOUNT,
      v('receiptNumber', 'Receipt number', 'SRC-2026-000005'),
      v('paymentMethod', 'How it was paid', 'M-Pesa paybill'),
      v('receivedAt', 'When it was received', 'Fri 13 Nov 2026, 13:18'),
      v('statusLine', 'Where the booking stands now', 'Still to pay: KES 2,750.'),
      RECEIPTS_LINE,
    ],
  ),
  guest_balance_due: tpl(
    'guest_balance_due',
    'Guest: Balance due',
    'Sent on the day the rest of a booking’s price is due.',
    '{{amount}} is due for your stay on {{checkInDate}}',
    'Hi {{guestName}},\n\n' +
      'A balance of {{amount}} is due today for your stay at {{listingTitle}}.\n\n' +
      '--- How to pay ---\n{{payLines}}\n\n' +
      '--- Your booking ---\n{{bookingSummary}}\n\n{{hostContactLine}}',
    [AMOUNT, PAY_LINES],
  ),
  guest_checkin_info: tpl(
    'guest_checkin_info',
    'Guest: Check-in details',
    'Sent up to two days before check-in: address, map link, time and the host’s instructions.',
    'Check-in details for {{listingTitle}}, {{checkInDate}}',
    'Hi {{guestName}},\n\n' +
      'We look forward to welcoming you on {{checkInDate}}. Here is how to get in.\n\n' +
      '--- Getting there ---\n{{gettingThere}}\n\n' +
      '--- Your booking ---\n{{bookingSummary}}\n\n{{hostContactLine}}',
    [GETTING_THERE],
  ),
  guest_booking_declined: tpl(
    'guest_booking_declined',
    'Guest: Request declined',
    'Sent when the host declines a booking request.',
    '{{businessName}} couldn’t take your request {{bookingCode}}',
    'Hi {{guestName}},\n\n' +
      'Sorry, {{listingTitle}} isn’t available from {{checkInDate}} to {{checkOutDate}}. Nothing was charged.\n\n' +
      '{{hostContactLine}}',
  ),
  guest_booking_expired: tpl(
    'guest_booking_expired',
    'Guest: Booking released (not paid in time)',
    'Sent when a held booking or an unanswered request lapses.',
    'Booking {{bookingCode}} released',
    'Hi {{guestName}},\n\n' +
      'Your booking {{bookingCode}} for {{listingTitle}} wasn’t paid in time, so the dates were released. You are welcome to book again.\n\n' +
      '{{hostContactLine}}',
  ),
  guest_booking_cancelled: tpl(
    'guest_booking_cancelled',
    'Guest: Booking cancelled',
    'Sent when a booking is cancelled, by the guest or the host, with the refund due.',
    'Booking {{bookingCode}} cancelled',
    'Hi {{guestName}},\n\n' +
      'Your booking {{bookingCode}} for {{listingTitle}} ({{checkInDate}} to {{checkOutDate}}) is cancelled.\n' +
      'Refund: {{refund}}\n\n' +
      '{{hostContactLine}}',
    [v('refund', 'The refund due to the guest', 'KES 2,750')],
  ),
};
