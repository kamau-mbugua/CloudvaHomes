import { DarajaClient, type StkQueryResult } from '../src/modules/mpesa/daraja.client.js';
import { outbox } from '../src/modules/notifications/senders.js';
import {
  auth,
  createPlatformAdmin,
  createTestApp,
  login,
  onboardOrg,
  resetDb,
  type Session,
  stepUp,
  type TestApp,
} from './helpers.js';

const KES = (major: number) => major * 100;
const OWNER = { email: 'host-pay@example.invalid', phone: '+254700000180' };

class FakeDaraja extends DarajaClient {
  pushes: { checkoutRequestId: string; amountKes: number; phone: string; callbackUrl: string }[] =
    [];
  answers = new Map<string, StkQueryResult>();
  registered: { confirmationUrl: string }[] = [];
  private n = 0;

  stkPush(_t: unknown, r: { amountKes: number; phone: string; callbackUrl: string }) {
    const checkoutRequestId = `ws_CO_STAY_${++this.n}`;
    this.pushes.push({ checkoutRequestId, ...r });
    return Promise.resolve({ merchantRequestId: 'M', checkoutRequestId });
  }
  stkQuery(_t: unknown, q: { checkoutRequestId: string }) {
    return Promise.resolve(
      this.answers.get(q.checkoutRequestId) ?? { resultCode: null, resultDesc: 'Still processing' },
    );
  }
  registerC2b(_t: unknown, r: { confirmationUrl: string }) {
    this.registered.push(r);
    return Promise.resolve();
  }
}

type Res = { status: number; body: any };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('Stays — Payments, refunds, M-Pesa prompts and booking matching (e2e)', () => {
  let t: TestApp;
  let fake: FakeDaraja;
  let host: Session;
  let hostOrgId: string;

  const post = async (
    s: Session,
    path: string,
    body: object,
    status = 200,
    headers: Record<string, string> = {},
  ) => check(await t.http().post(`/api/v1${path}`).set(auth(s)).set(headers).send(body), status);
  const put = async (
    s: Session,
    path: string,
    body: object,
    status = 200,
    headers: Record<string, string> = {},
  ) => check(await t.http().put(`/api/v1${path}`).set(auth(s)).set(headers).send(body), status);
  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);
  const hook = (path: string, body: object) =>
    t.http().post(`/api/v1/hooks/pay/${path}`).send(body);

  beforeAll(async () => {
    process.env.MPESA_CALLBACK_IPS = '127.0.0.1,::1,::ffff:127.0.0.1';
    process.env.PUBLIC_API_URL = 'https://api.example.invalid';
    fake = new FakeDaraja();
    t = await createTestApp([], (b) => b.overrideProvider(DarajaClient).useValue(fake));
  });

  afterAll(async () => {
    delete process.env.MPESA_CALLBACK_IPS;
    delete process.env.PUBLIC_API_URL;
    await t?.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    fake.pushes = [];
    fake.answers.clear();
    fake.registered = [];
    await createPlatformAdmin(t.prisma);
    const admin = await login(t, 'admin@example.invalid');
    ({ orgId: hostOrgId, owner: host } = await onboardOrg(t, admin, {
      name: 'Coral Stays',
      kind: 'HOST',
      ownerEmail: OWNER.email,
      ownerPhone: OWNER.phone,
    }));
  });

  async function setUpHostWithMpesa() {
    const prop = (await post(host, '/properties', { name: 'Coral Gardens', code: 'CG' }, 201)).data;
    const listing = (
      await post(
        host,
        '/host/listings',
        {
          propertyId: prop.id,
          unitNumber: 'C1',
          title: 'Coral Studio',
          maxGuests: 2,
          bedrooms: 1,
          bathrooms: 1,
          nightlyPrice: String(KES(4000)),
          cleaningFee: '0',
          minNights: 1,
        },
        201,
      )
    ).data;

    const channel = (
      await post(
        host,
        '/payment-channels',
        { kind: 'MPESA_PAYBILL', name: 'Coral Paybill', shortcode: '600111' },
        201,
      )
    ).data;
    const header = await stepUp(t, host, OWNER.phone);
    const configured = (
      await put(
        host,
        `/payment-channels/${channel.id}/daraja`,
        {
          environment: 'SANDBOX',
          consumerKey: 'test-consumer-key',
          consumerSecret: 'test-consumer-secret',
          passkey: 'test-passkey',
        },
        200,
        { 'X-Step-Up': header },
      )
    ).data;
    const token = /hooks\/pay\/([^/]+)\//.exec(configured.daraja.callbackUrls.stk)![1]!;

    return { listing, channel: configured, token };
  }

  const stkCallback = (
    checkoutRequestId: string,
    resultCode: number,
    receipt?: string,
    amountKes?: number,
  ) => ({
    Body: {
      stkCallback: {
        MerchantRequestID: 'M',
        CheckoutRequestID: checkoutRequestId,
        ResultCode: resultCode,
        ResultDesc:
          resultCode === 0
            ? 'The service request is processed successfully.'
            : 'Request cancelled by user',
        ...(receipt
          ? {
              CallbackMetadata: {
                Item: [
                  { Name: 'Amount', Value: amountKes },
                  { Name: 'MpesaReceiptNumber', Value: receipt },
                  { Name: 'TransactionDate', Value: 20261110101500 },
                  { Name: 'PhoneNumber', Value: 254712345678 },
                ],
              },
            }
          : {}),
      },
    },
  });

  const c2b = (receipt: string, amount: number, ref: string | null, msisdn = '254712345678') => ({
    TransactionType: 'Pay Bill',
    TransID: receipt,
    TransTime: '20261110101500',
    TransAmount: (amount / 100).toFixed(2),
    BusinessShortCode: '600111',
    BillRefNumber: ref ?? '',
    MSISDN: msisdn,
    FirstName: 'Amina',
    LastName: 'Hassan',
  });

  it('HELD booking + STK success callback for dueNow -> CONFIRMED, one StayPayment (SRC-2026-000001), replay is idempotent', async () => {
    const { listing, token } = await setUpHostWithMpesa();

    // Seed a booking and set to HELD with dueNow = 8,000 KES (800000 minor)
    const created = (
      await post(
        host,
        '/host/bookings',
        {
          listingId: listing.id,
          checkIn: '2026-12-10',
          checkOut: '2026-12-12',
          guests: 2,
          guest: { name: 'Amina Hassan', phone: '+254712345678' },
          confirm: true,
        },
        201,
      )
    ).data;

    await t.prisma.booking.update({
      where: { id: created.id },
      data: {
        status: 'HELD',
        holdExpiresAt: new Date(Date.now() + 12 * 3600_000),
      },
    });

    // Send M-Pesa prompt for the booking
    const promptRes = (await post(host, `/host/bookings/${created.id}/mpesa-prompt`, {})).data;
    expect(promptRes.accountRef).toBe(created.code);
    expect(fake.pushes).toHaveLength(1);
    const checkoutId = fake.pushes[0]!.checkoutRequestId;
    expect(fake.pushes[0]!.amountKes).toBe(8000);

    // Daraja confirms success on re-query
    fake.answers.set(checkoutId, { resultCode: '0', resultDesc: 'Success' });

    // Deliver STK callback
    await hook(`${token}/stk`, stkCallback(checkoutId, 0, 'SJR111222A', 8000)).expect(200);

    const after = (await get(host, `/host/bookings/${created.id}`)).data;
    expect(after.status).toBe('CONFIRMED');
    expect(after.amountPaid).toBe('800000');
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0]).toMatchObject({
      number: 'SRC-2026-000001',
      kind: 'PAYMENT',
      method: 'MPESA_PAYBILL',
      amount: '800000',
      reference: 'SJR111222A',
    });

    // Replay callback -> still one StayPayment
    await hook(`${token}/stk`, stkCallback(checkoutId, 0, 'SJR111222A', 8000)).expect(200);
    const afterReplay = (await get(host, `/host/bookings/${created.id}`)).data;
    expect(afterReplay.payments).toHaveLength(1);
    expect(afterReplay.amountPaid).toBe('800000');
  });

  it('C2B confirmation with account B00001 links payment automatically, and manual cash + refund > paid -> 422', async () => {
    const { listing, token } = await setUpHostWithMpesa();

    const b1 = (
      await post(
        host,
        '/host/bookings',
        {
          listingId: listing.id,
          checkIn: '2026-12-15',
          checkOut: '2026-12-17',
          guests: 1,
          guest: { name: 'Brian Otieno', phone: '+254722111222' },
          confirm: true,
        },
        201,
      )
    ).data;
    expect(b1.code).toBe('B00001');

    // C2B callback with account ref B00001
    await hook(`${token}/c2b/confirm`, c2b('C2B999888Z', KES(3000), 'B00001')).expect(200);

    const b1AfterC2b = (await get(host, `/host/bookings/${b1.id}`)).data;
    expect(b1AfterC2b.amountPaid).toBe('300000');
    expect(b1AfterC2b.payments).toHaveLength(1);
    expect(b1AfterC2b.payments[0].reference).toBe('C2B999888Z');

    const inbound = await t.prisma.inboundTransaction.findFirstOrThrow({
      where: { providerRef: 'C2B999888Z' },
    });
    expect(inbound.matchStatus).toBe('MATCHED');
    expect(inbound.bookingId).toBe(b1.id);
    expect(inbound.stayPaymentId).toBe(b1AfterC2b.payments[0].id);

    // Manual cash payment of KES 5,000
    const manualRes = (
      await post(
        host,
        `/host/bookings/${b1.id}/payments`,
        {
          method: 'CASH',
          amount: String(KES(5000)),
          reference: 'CASH-01',
        },
        201,
      )
    ).data;
    expect(manualRes.number).toBe('SRC-2026-000002');
    expect(
      outbox.some(
        (m) =>
          m.channel === 'sms' &&
          m.to === '+254722111222' &&
          m.text.includes('we received KES 5,000 for booking B00001. Fully paid, thank you.'),
      ),
    ).toBe(true);

    // Refund of KES 9,000 (> 8,000 paid) -> 422
    await post(
      host,
      `/host/bookings/${b1.id}/refunds`,
      {
        method: 'CASH',
        amount: String(KES(9000)),
      },
      422,
    );

    // Valid refund of KES 2,000 -> 201
    await post(
      host,
      `/host/bookings/${b1.id}/refunds`,
      {
        method: 'CASH',
        amount: String(KES(2000)),
        note: 'Partial goodwill refund',
      },
      201,
    );

    const b1Final = (await get(host, `/host/bookings/${b1.id}`)).data;
    expect(b1Final.amountPaid).toBe('800000');
    expect(b1Final.amountRefunded).toBe('200000');
  });

  it('payment arriving after hold EXPIRED: confirms when nights are free, or stays EXPIRED with hostNote & staff notification when nights were taken', async () => {
    const { listing, token } = await setUpHostWithMpesa();

    // Case 1: EXPIRED booking whose nights are still free
    const bFree = (
      await post(
        host,
        '/host/bookings',
        {
          listingId: listing.id,
          checkIn: '2026-12-20',
          checkOut: '2026-12-22',
          guests: 1,
          guest: { name: 'Grace Wanjiku', phone: '+254733111222' },
          confirm: true,
        },
        201,
      )
    ).data;

    await t.prisma.booking.update({
      where: { id: bFree.id },
      data: { status: 'EXPIRED', holdExpiresAt: new Date(Date.now() - 3600_000) },
    });

    await hook(`${token}/c2b/confirm`, c2b('LATEFREE01', KES(8000), bFree.code)).expect(200);
    const bFreeAfter = (await get(host, `/host/bookings/${bFree.id}`)).data;
    expect(bFreeAfter.status).toBe('CONFIRMED');
    expect(bFreeAfter.amountPaid).toBe('800000');

    // Case 2: EXPIRED booking whose nights have since been taken by another booking
    const bExpired = (
      await post(
        host,
        '/host/bookings',
        {
          listingId: listing.id,
          checkIn: '2026-12-24',
          checkOut: '2026-12-26',
          guests: 1,
          guest: { name: 'Late Payer', phone: '+254744111222' },
          confirm: true,
        },
        201,
      )
    ).data;

    await t.prisma.booking.update({
      where: { id: bExpired.id },
      data: { status: 'EXPIRED', holdExpiresAt: new Date(Date.now() - 3600_000) },
    });

    // Someone else books 2026-12-24 -> 2026-12-26 while bExpired is EXPIRED
    await post(
      host,
      '/host/bookings',
      {
        listingId: listing.id,
        checkIn: '2026-12-24',
        checkOut: '2026-12-26',
        guests: 2,
        guest: { name: 'New Guest', phone: '+254755111222' },
        confirm: true,
      },
      201,
    );

    // Now Late Payer sends money via C2B with bExpired.code
    await hook(`${token}/c2b/confirm`, c2b('LATETAKEN1', KES(8000), bExpired.code)).expect(200);

    const bExpiredAfter = (await get(host, `/host/bookings/${bExpired.id}`)).data;
    expect(bExpiredAfter.status).toBe('EXPIRED');
    expect(bExpiredAfter.amountPaid).toBe('800000');
    expect(bExpiredAfter.hostNote).toBe(
      'Paid after the hold ended and the dates were taken — refund the guest',
    );

    const staffNotifications = await t.prisma.userNotification.findMany({
      where: { orgId: hostOrgId },
    });
    expect(
      staffNotifications.some((n) =>
        n.body.includes('Paid after the hold ended and the dates were taken'),
      ),
    ).toBe(true);
  });

  it('money on a cancelled booking or an expired, never-accepted request does not bring it back', async () => {
    const { listing, token } = await setUpHostWithMpesa();

    // Host cancels a confirmed booking; the guest pays anyway.
    const cancelled = (
      await post(
        host,
        '/host/bookings',
        {
          listingId: listing.id,
          checkIn: '2027-01-05',
          checkOut: '2027-01-07',
          guests: 1,
          guest: { name: 'Cancelled Guest', phone: '+254766111222' },
          confirm: true,
        },
        201,
      )
    ).data;
    await post(host, `/host/bookings/${cancelled.id}/cancel`, { reason: 'Owner using the unit' });
    await hook(`${token}/c2b/confirm`, c2b('CANCPAID01', KES(8000), cancelled.code)).expect(200);

    const cancelledAfter = (await get(host, `/host/bookings/${cancelled.id}`)).data;
    expect(cancelledAfter.status).toBe('CANCELLED');
    expect(cancelledAfter.amountPaid).toBe('800000');
    expect(cancelledAfter.hostNote).toBe('Paid after the booking was cancelled — refund the guest');

    // A request the host never answered expired (no hold); a payment must not skip the host's approval.
    const request = (
      await post(
        host,
        '/host/bookings',
        {
          listingId: listing.id,
          checkIn: '2027-01-10',
          checkOut: '2027-01-12',
          guests: 1,
          guest: { name: 'Request Guest', phone: '+254777111222' },
          confirm: true,
        },
        201,
      )
    ).data;
    await t.prisma.booking.update({
      where: { id: request.id },
      data: {
        status: 'EXPIRED',
        holdExpiresAt: null,
        requestExpiresAt: new Date(Date.now() - 3600_000),
      },
    });
    await hook(`${token}/c2b/confirm`, c2b('REQPAID01', KES(8000), request.code)).expect(200);

    const requestAfter = (await get(host, `/host/bookings/${request.id}`)).data;
    expect(requestAfter.status).toBe('EXPIRED');
    expect(requestAfter.hostNote).toBe('Paid after the booking expired — refund the guest');
  });

  describe('Reconciliation for hosts', () => {
    const unmatched = async (receipt: string) => {
      const list = (await get(host, '/inbound-transactions?status=UNMATCHED')).data as {
        id: string;
        providerRef: string;
      }[];
      return list.find((r) => r.providerRef === receipt)!;
    };
    const bookingFor = async (
      listingId: string,
      phone: string,
      name: string,
      checkIn: string,
      checkOut: string,
    ) =>
      (
        await post(
          host,
          '/host/bookings',
          { listingId, checkIn, checkOut, guests: 1, guest: { name, phone }, confirm: true },
          201,
        )
      ).data;

    it('assigns an unmatched payment to a booking by hand, suggesting the booking by guest phone', async () => {
      const { listing, token } = await setUpHostWithMpesa();
      const b = await bookingFor(
        listing.id,
        '+254722111222',
        'Brian Otieno',
        '2026-12-15',
        '2026-12-17',
      );
      // Wrong account number: lands in Reconciliation.
      await hook(
        `${token}/c2b/confirm`,
        c2b('RECBK00001', KES(3000), 'WRONG', '254722111222'),
      ).expect(200);
      const row = await unmatched('RECBK00001');
      expect(row).toBeTruthy();

      const detail = (await get(host, `/inbound-transactions/${row.id}`)).data;
      expect(detail.suggestions).toEqual([]);
      expect(detail.bookingSuggestions).toEqual([
        expect.objectContaining({
          booking: expect.objectContaining({ id: b.id, code: b.code, guestName: 'Brian Otieno' }),
          reason: 'Guest phone matches',
        }),
      ]);

      const assigned = (
        await post(host, `/inbound-transactions/${row.id}/assign`, { bookingId: b.id }, 200)
      ).data;
      expect(assigned).toMatchObject({
        matchStatus: 'MATCHED',
        matchedBy: 'MANUAL',
        booking: { id: b.id, code: b.code, guestName: 'Brian Otieno' },
      });
      const after = (await get(host, `/host/bookings/${b.id}`)).data;
      expect(after.amountPaid).toBe(String(KES(3000)));

      // Twice: refused, nothing recorded again.
      const again = await t
        .http()
        .post(`/api/v1/inbound-transactions/${row.id}/assign`)
        .set(auth(host))
        .send({ bookingId: b.id });
      expect(again.status).toBe(409);
      expect((await get(host, `/host/bookings/${b.id}`)).data.amountPaid).toBe(String(KES(3000)));

      // Voiding the payment on the booking puts it back in Reconciliation.
      const payments = (await get(host, `/host/bookings/${b.id}`)).data.payments as {
        id: string;
      }[];
      await post(
        host,
        `/host/bookings/${b.id}/payments/${payments[0]!.id}/void`,
        { reason: 'Wrong booking' },
        200,
      );
      expect(await unmatched('RECBK00001')).toBeTruthy();
    });

    it('suggests an open booking that owes exactly the amount paid', async () => {
      const { listing, token } = await setUpHostWithMpesa();
      const b = await bookingFor(
        listing.id,
        '+254733000444',
        'Carol Wambui',
        '2026-12-20',
        '2026-12-22',
      );
      const owed = Number(b.total);
      await hook(`${token}/c2b/confirm`, c2b('RECBK00002', owed, 'XYZ', '254799999999')).expect(
        200,
      );
      const row = await unmatched('RECBK00002');
      const detail = (await get(host, `/inbound-transactions/${row.id}`)).data;
      expect(detail.bookingSuggestions).toEqual([
        expect.objectContaining({
          booking: expect.objectContaining({ id: b.id }),
          reason: 'Owes exactly this amount',
        }),
      ]);
    });

    it('needs exactly one of a tenant or a booking', async () => {
      const { listing, token } = await setUpHostWithMpesa();
      const b = await bookingFor(
        listing.id,
        '+254722111333',
        'Dan Kip',
        '2026-12-24',
        '2026-12-26',
      );
      await hook(
        `${token}/c2b/confirm`,
        c2b('RECBK00003', KES(1000), 'NOPE', '254700000123'),
      ).expect(200);
      const row = await unmatched('RECBK00003');
      const send = (body: object) =>
        t.http().post(`/api/v1/inbound-transactions/${row.id}/assign`).set(auth(host)).send(body);
      expect((await send({})).status).toBe(422);
      expect((await send({ bookingId: b.id, tenantId: b.id })).status).toBe(422);
      expect((await send({ bookingId: '01a1b704-0985-7488-97a2-f0d7b945b075' })).status).toBe(404);
    });
  });
});
