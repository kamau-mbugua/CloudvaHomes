import { describe, expect, it } from 'vitest';
import { renderStayReceiptPdf } from './stay-receipt-pdf.js';

const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

describe('stay receipt PDF', () => {
  it('is a single page (the footer never spills onto blank pages)', async () => {
    const pdf = await renderStayReceiptPdf({
      org: {
        name: 'Makini Homes',
        phone: '+254700000190',
        email: 'host@example.invalid',
        kraPin: null,
      },
      payment: {
        number: 'SRC-2026-000005',
        method: 'MPESA_PAYBILL',
        amount: 275_000n,
        reference: 'TKD12ABC34',
        receivedAt: 'Fri 13 Nov 2026, 13:18',
      },
      guest: { name: 'Guest Example', phone: '+254700000999' },
      booking: {
        code: 'B00006',
        listingTitle: 'Cozy 1BR with balcony',
        checkIn: 'Fri 13 Nov 2026',
        checkOut: 'Sat 14 Nov 2026',
        nights: 1,
        total: 550_000n,
        paid: 275_000n,
        owed: 275_000n,
      },
    });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pages(pdf)).toBe(1);
  });
});
