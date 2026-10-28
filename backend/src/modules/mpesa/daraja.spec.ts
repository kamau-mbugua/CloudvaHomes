import { ipAllowed } from './callback-ips.js';
import {
  darajaTimestamp,
  kesToCents,
  normalizeAccountRef,
  parseC2bConfirmation,
  parseDarajaTime,
  parseStkCallback,
  stkPassword,
  stkStateFor,
} from './daraja.js';

describe('Daraja helpers', () => {
  it('formats and parses Nairobi timestamps', () => {
    expect(darajaTimestamp(new Date('2026-10-27T11:30:15Z'))).toBe('20261027143015');
    expect(parseDarajaTime('20261027143015').toISOString()).toBe('2026-10-27T11:30:15.000Z');
    expect(() => parseDarajaTime('2026')).toThrow();
  });

  it('builds the STK password', () => {
    expect(stkPassword('174379', 'key', '20261027143015')).toBe(
      Buffer.from('174379key20261027143015').toString('base64'),
    );
  });

  it('converts shillings without floats and normalises references', () => {
    expect(kesToCents('10.00')).toBe(1000n);
    expect(kesToCents(25000)).toBe(2500000n);
    expect(normalizeAccountRef(' klc-a4 ')).toBe('KLCA4');
  });

  it('parses STK callbacks', () => {
    const ok = parseStkCallback({
      Body: {
        stkCallback: {
          MerchantRequestID: 'm1',
          CheckoutRequestID: 'ws_CO_1',
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 1500 },
              { Name: 'MpesaReceiptNumber', Value: 'TEST000001' },
              { Name: 'TransactionDate', Value: 20261027143015 },
              { Name: 'PhoneNumber', Value: 254700000001 },
            ],
          },
        },
      },
    });
    expect(ok).toMatchObject({
      checkoutRequestId: 'ws_CO_1',
      resultCode: '0',
      receipt: 'TEST000001',
      amount: 150000n,
      phone: '+254700000001',
    });
    const cancelled = parseStkCallback({
      Body: {
        stkCallback: {
          CheckoutRequestID: 'ws_CO_2',
          ResultCode: 1032,
          ResultDesc: 'Request cancelled by user',
        },
      },
    });
    expect(cancelled).toMatchObject({ resultCode: '1032', receipt: null });
    expect(stkStateFor('1032')).toBe('CANCELLED');
    expect(stkStateFor('1037')).toBe('TIMEOUT');
    expect(stkStateFor('2001')).toBe('FAILED');
    expect(parseStkCallback({})).toBeNull();
  });

  it('parses C2B confirmations, dropping masked phone numbers', () => {
    const c = parseC2bConfirmation({
      TransID: 'TEST000002',
      TransTime: '20261027143015',
      TransAmount: '25000.00',
      BusinessShortCode: '600000',
      BillRefNumber: 'T00001',
      MSISDN: '2547 ***** 001',
      FirstName: 'Pat',
      LastName: 'Payer',
    });
    expect(c).toMatchObject({
      receipt: 'TEST000002',
      amount: 2500000n,
      accountRef: 'T00001',
      phone: null,
      payerName: 'Pat Payer',
    });
    expect(
      parseC2bConfirmation({
        TransID: 'X',
        TransAmount: '1',
        TransTime: '20261027143015',
        MSISDN: '254700000001',
      })?.phone,
    ).toBe('+254700000001');
  });

  it('checks callback addresses', () => {
    expect(ipAllowed('::ffff:196.201.214.200', ['196.201.214.200'])).toBe(true);
    expect(ipAllowed('10.0.0.1', ['196.201.214.200'])).toBe(false);
    expect(ipAllowed(undefined, ['x'])).toBe(false);
  });
});
