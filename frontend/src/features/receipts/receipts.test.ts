import { describe, expect, it } from 'vitest';
import { rentReceiptRef, sendPlan, sentMessage, stayReceiptRef } from './receipts';

describe('receipts', () => {
  it('points at the right PDF and send paths', () => {
    const stay = stayReceiptRef('b1', { id: 'p1', number: 'SRC-2026-000006' }, { name: 'Achieng' });
    expect(stay.pdfPath).toBe('/host/bookings/b1/payments/p1/receipt');
    expect(stay.sendPath).toBe('/host/bookings/b1/payments/p1/receipt/send');
    const rent = rentReceiptRef({
      id: 'r1',
      number: 'RCT-2026-000012',
      tenant: { firstName: 'Pat', lastName: 'Mwangi', phone: '+254711000301' },
    });
    expect(rent.pdfPath).toBe('/payments/r1/receipt');
    expect(rent.sendPath).toBe('/payments/r1/receipt/send');
    expect(rent.recipient).toMatchObject({ name: 'Pat Mwangi', phone: '+254711000301' });
  });

  it('says what Send will do', () => {
    expect(
      sendPlan({ name: 'A', phone: '+254722000333', email: 'a@example.invalid', hasPhone: true, hasEmail: true }),
    ).toEqual([
      'SMS to +254722000333 with a link to the receipt.',
      'Email to a@example.invalid with the receipt PDF attached.',
    ]);
    expect(sendPlan({ name: 'A', hasPhone: true, hasEmail: false })).toEqual([
      'SMS with a link to the receipt.',
      'No email on file, so no email.',
    ]);
    expect(sendPlan({ name: 'A', phone: '+254711000301' })[1]).toBe(
      'Email with the receipt PDF attached, if there is an email on file.',
    );
  });

  it('says what went out', () => {
    expect(sentMessage('SRC-1', { sms: true, email: true })).toEqual({
      ok: true,
      text: 'Receipt SRC-1 sent by SMS and email.',
    });
    expect(sentMessage('SRC-1', { sms: false, email: true }).text).toBe('Receipt SRC-1 sent by email.');
    expect(sentMessage('SRC-1', { sms: false, email: false }).ok).toBe(false);
  });
});
