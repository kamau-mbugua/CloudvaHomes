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
const OWNER = { email: 'host-pub@example.invalid', phone: '+254700000190' };
const TINY_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
]);

class FakeDaraja extends DarajaClient {
  pushes: { checkoutRequestId: string; amountKes: number; phone: string; callbackUrl: string }[] =
    [];
  answers = new Map<string, StkQueryResult>();
  registered: { confirmationUrl: string }[] = [];
  private n = 0;

  stkPush(_t: unknown, r: { amountKes: number; phone: string; callbackUrl: string }) {
    const checkoutRequestId = `ws_CO_PUB_${++this.n}`;
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

type Res = { status: number; body: any; headers: Record<string, string> };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

function latestOtpFromSms(phone: string): string {
  for (let i = outbox.length - 1; i >= 0; i--) {
    const s = outbox[i]!;
    if (s.channel === 'sms' && s.to === phone) {
      const m = /\b(\d{6})\b/.exec(s.text);
      if (m) return m[1]!;
    }
  }
  throw new Error(`No 6-digit OTP found in outbox for ${phone}`);
}

describe('Stays — Public booking site API (e2e)', () => {
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
  const patch = async (s: Session, path: string, body: object, status = 200) =>
    check(await t.http().patch(`/api/v1${path}`).set(auth(s)).send(body), status);
  const put = async (
    s: Session,
    path: string,
    body: object,
    status = 200,
    headers: Record<string, string> = {},
  ) => check(await t.http().put(`/api/v1${path}`).set(auth(s)).set(headers).send(body), status);
  const hook = (path: string, body: object) =>
    t.http().post(`/api/v1/hooks/pay/${path}`).send(body);

  beforeAll(async () => {
    process.env.MPESA_CALLBACK_IPS = '127.0.0.1,::1,::ffff:127.0.0.1';
    process.env.PUBLIC_API_URL = 'https://api.example.invalid';
    process.env.SITE_DOMAIN = 'kodihub.co.ke';
    fake = new FakeDaraja();
    t = await createTestApp([], (b) => b.overrideProvider(DarajaClient).useValue(fake));
  });

  afterAll(async () => {
    delete process.env.MPESA_CALLBACK_IPS;
    delete process.env.PUBLIC_API_URL;
    delete process.env.SITE_DOMAIN;
    await t?.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    fake.pushes = [];
    fake.answers.clear();
    fake.registered = [];
    outbox.length = 0;
    await createPlatformAdmin(t.prisma);
    const admin = await login(t, 'admin@example.invalid');
    ({ orgId: hostOrgId, owner: host } = await onboardOrg(t, admin, {
      name: 'Cozy Homes',
      kind: 'HOST',
      ownerEmail: OWNER.email,
      ownerPhone: OWNER.phone,
    }));
  });

  async function setUpPublishedSite(opts?: {
    bookingMode?: 'INSTANT' | 'REQUEST';
    withMpesa?: boolean;
    publishedListing?: boolean;
  }) {
    const bookingMode = opts?.bookingMode ?? 'INSTANT';
    const withMpesa = opts?.withMpesa ?? true;
    const publishedListing = opts?.publishedListing ?? true;

    await patch(host, '/host/site', {
      slug: 'cozy-homes',
      businessName: 'Cozy Homes',
      published: true,
      contactPhone: '+254700000190',
      rules: {
        bookingMode,
        payWhen: 'FULL',
        cancellation: 'FLEXIBLE',
      },
    });

    const prop = (
      await post(
        host,
        '/properties',
        { name: 'Riverside', code: 'RS', location: '14 Riverside Drive, Westlands' },
        201,
      )
    ).data;

    const listing = (
      await post(
        host,
        '/host/listings',
        {
          propertyId: prop.id,
          unitNumber: 'R1',
          title: 'Riverside Suite',
          area: 'Westlands',
          maxGuests: 2,
          bedrooms: 1,
          bathrooms: 1,
          nightlyPrice: String(KES(3000)),
          cleaningFee: String(KES(500)),
          minNights: 1,
          checkInInstructions: 'Lockbox code 9876',
        },
        201,
      )
    ).data;

    const photoRes = check(
      await t
        .http()
        .post(`/api/v1/host/listings/${listing.id}/photos`)
        .set(auth(host))
        .attach('file', TINY_JPEG, { filename: 'cover.jpg', contentType: 'image/jpeg' }),
      201,
    ).data;

    if (publishedListing) {
      await patch(host, `/host/listings/${listing.id}`, { published: true });
    }

    let stkCallbackToken = '';
    if (withMpesa) {
      const channel = (
        await post(
          host,
          '/payment-channels',
          { kind: 'MPESA_PAYBILL', name: 'Cozy Paybill', shortcode: '600222' },
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
      stkCallbackToken = /hooks\/pay\/([^/]+)\//.exec(configured.daraja.callbackUrls.stk)![1]!;
    }

    return { listing, uploadId: photoRes.uploadId as string, stkCallbackToken };
  }

  const stkCallback = (checkoutRequestId: string, receipt: string, amountKes: number) => ({
    Body: {
      stkCallback: {
        MerchantRequestID: 'M',
        CheckoutRequestID: checkoutRequestId,
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.',
        CallbackMetadata: {
          Item: [
            { Name: 'Amount', Value: amountKes },
            { Name: 'MpesaReceiptNumber', Value: receipt },
            { Name: 'TransactionDate', Value: 20261110101500 },
            { Name: 'PhoneNumber', Value: 254711000111 },
          ],
        },
      },
    },
  });

  it('runs the full instant flow (verify -> book -> HELD -> STK callback -> CONFIRMED -> guest cancel)', async () => {
    const { listing, uploadId, stkCallbackToken } = await setUpPublishedSite();

    // Browse site & listing & public photo
    const siteRes = check(await t.http().get('/api/v1/public/sites/cozy-homes'), 200).data;
    expect(siteRes.businessName).toBe('Cozy Homes');
    expect(siteRes.listings).toHaveLength(1);

    const photoRes = await t.http().get(`/api/v1/public/photos/${uploadId}`);
    expect(photoRes.status).toBe(200);
    expect(photoRes.headers['cache-control']).toBe('public, max-age=86400');

    // Verify phone
    const guestPhone = '+254711000111';
    check(
      await t.http().post('/api/v1/public/sites/cozy-homes/verify').send({ phone: guestPhone }),
      202,
    );
    const otp = latestOtpFromSms(guestPhone);
    expect(
      outbox.some(
        (s) =>
          s.channel === 'sms' &&
          s.to === guestPhone &&
          s.text.includes('Your Cozy Homes booking code is'),
      ),
    ).toBe(true);

    // Book (2 nights = 6000 + 500 cleaning = 6500 KES)
    const bookRes = check(
      await t.http().post('/api/v1/public/sites/cozy-homes/bookings').send({
        listingId: listing.id,
        checkIn: '2026-12-10',
        checkOut: '2026-12-12',
        guests: 2,
        name: 'Wanjiku Guest',
        phone: guestPhone,
        code: otp,
      }),
      201,
    ).data;

    expect(bookRes.status).toBe('HELD');
    expect(bookRes.link).toMatch(/^https:\/\/cozy-homes\.kodihub\.co\.ke\/b\/[A-Za-z0-9_-]+$/);
    expect(fake.pushes).toHaveLength(1);
    expect(fake.pushes[0]!.amountKes).toBe(6500);

    const token = bookRes.link.split('/b/')[1]!;

    // While HELD, checkInInstructions and address are null
    const heldView = check(await t.http().get(`/api/v1/public/bookings/${token}`), 200).data;
    expect(heldView.status).toBe('HELD');
    expect(heldView.checkInInstructions).toBeNull();
    expect(heldView.address).toBeNull();

    // STK callback confirms the booking
    const cid = fake.pushes[0]!.checkoutRequestId;
    fake.answers.set(cid, {
      resultCode: '0',
      resultDesc: 'Success',
    });
    check(await hook(`${stkCallbackToken}/stk`, stkCallback(cid, 'QWE123456', 6500)), 200);

    const confView = check(await t.http().get(`/api/v1/public/bookings/${token}`), 200).data;
    expect(confView.status).toBe('CONFIRMED');
    expect(confView.checkInInstructions).toBe('Lockbox code 9876');
    expect(confView.address).toBe('14 Riverside Drive, Westlands');

    // Availability lists only the booked nights and exposes no guest names
    const availRes = check(
      await t
        .http()
        .get(
          `/api/v1/public/sites/cozy-homes/listings/${listing.id}/availability?from=2026-12-01&to=2026-12-31`,
        ),
      200,
    ).data;
    expect(availRes).toEqual({ unavailable: ['2026-12-10', '2026-12-11'] });
    expect(JSON.stringify(availRes)).not.toContain('Wanjiku');

    // Guest cancel with wrong code -> 422, right code -> cancelled with refund
    check(await t.http().post(`/api/v1/public/bookings/${token}/cancel/verify`).send({}), 202);
    const cancelOtp = latestOtpFromSms(guestPhone);

    const wrongCancel = await t
      .http()
      .post(`/api/v1/public/bookings/${token}/cancel`)
      .send({ code: '000000' });
    expect(wrongCancel.status).toBe(422);

    const cancelRes = check(
      await t.http().post(`/api/v1/public/bookings/${token}/cancel`).send({ code: cancelOtp }),
      200,
    ).data;
    expect(cancelRes.refund).toBe(String(KES(6500)));
  });

  it('rejects one of two parallel bookings for the same nights with 409 DATES_TAKEN', async () => {
    const { listing } = await setUpPublishedSite({ withMpesa: false });

    const p1 = '+254711000201';
    const p2 = '+254711000202';
    check(await t.http().post('/api/v1/public/sites/cozy-homes/verify').send({ phone: p1 }), 202);
    const otp1 = latestOtpFromSms(p1);
    check(await t.http().post('/api/v1/public/sites/cozy-homes/verify').send({ phone: p2 }), 202);
    const otp2 = latestOtpFromSms(p2);

    const [r1, r2] = await Promise.all([
      t.http().post('/api/v1/public/sites/cozy-homes/bookings').send({
        listingId: listing.id,
        checkIn: '2026-12-15',
        checkOut: '2026-12-17',
        guests: 1,
        name: 'Guest One',
        phone: p1,
        code: otp1,
      }),
      t.http().post('/api/v1/public/sites/cozy-homes/bookings').send({
        listingId: listing.id,
        checkIn: '2026-12-15',
        checkOut: '2026-12-17',
        guests: 1,
        name: 'Guest Two',
        phone: p2,
        code: otp2,
      }),
    ]);

    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);
    const conflict = r1.status === 409 ? r1 : r2;
    expect(conflict.body.error.code).toBe('DATES_TAKEN');
  });

  it('enforces 404 on unknown tokens/unpublished listings/photos, 429 on 6th verify, and REQUESTED for request mode or doNotAccept guests', async () => {
    const { listing, uploadId } = await setUpPublishedSite({
      bookingMode: 'INSTANT',
      withMpesa: false,
      publishedListing: false,
    });

    // Unpublished listing and its photo return 404
    const unpubListing = await t
      .http()
      .get(`/api/v1/public/sites/cozy-homes/listings/${listing.id}`);
    expect(unpubListing.status).toBe(404);
    const unpubPhoto = await t.http().get(`/api/v1/public/photos/${uploadId}`);
    expect(unpubPhoto.status).toBe(404);

    // Random booking token -> 404
    const randBooking = await t.http().get('/api/v1/public/bookings/not-a-valid-token-at-all');
    expect(randBooking.status).toBe(404);

    // Publish listing
    await patch(host, `/host/listings/${listing.id}`, { published: true });

    // OpenGraph HTML preview endpoint
    const siteHtml = await t
      .http()
      .get(`/api/v1/public/site-html?host=cozy-homes.kodihub.co.ke&path=/u/${listing.id}`);
    expect(siteHtml.status).toBe(200);
    expect(siteHtml.text).toContain('property="og:title"');
    expect(siteHtml.text).toContain('Riverside Suite · Cozy Homes');

    const badHostHtml = await t.http().get('/api/v1/public/site-html?host=evil.com&path=/');
    expect(badHostHtml.status).toBe(404);

    // Mark a guest doNotAccept in the DB -> booking on INSTANT site becomes REQUESTED
    const blockedPhone = '+254711000301';
    await t.prisma.guest.create({
      data: {
        orgId: hostOrgId,
        name: 'Troublesome Guest',
        phone: blockedPhone,
        doNotAccept: true,
      },
    });
    check(
      await t.http().post('/api/v1/public/sites/cozy-homes/verify').send({ phone: blockedPhone }),
      202,
    );
    const blockedOtp = latestOtpFromSms(blockedPhone);
    const blockedBook = check(
      await t.http().post('/api/v1/public/sites/cozy-homes/bookings').send({
        listingId: listing.id,
        checkIn: '2026-12-20',
        checkOut: '2026-12-22',
        guests: 1,
        name: 'Troublesome Guest',
        phone: blockedPhone,
        code: blockedOtp,
      }),
      201,
    ).data;
    expect(blockedBook.status).toBe('REQUESTED');
    expect(fake.pushes).toHaveLength(0);

    // Switch site to REQUEST mode -> normal guest also gets REQUESTED
    await patch(host, '/host/site', {
      rules: {
        bookingMode: 'REQUEST',
        payWhen: 'FULL',
        cancellation: 'FLEXIBLE',
      },
    });
    const reqPhone = '+254711000302';
    check(
      await t.http().post('/api/v1/public/sites/cozy-homes/verify').send({ phone: reqPhone }),
      202,
    );
    const reqOtp = latestOtpFromSms(reqPhone);
    const reqBook = check(
      await t.http().post('/api/v1/public/sites/cozy-homes/bookings').send({
        listingId: listing.id,
        checkIn: '2026-12-23',
        checkOut: '2026-12-25',
        guests: 1,
        name: 'Polite Guest',
        phone: reqPhone,
        code: reqOtp,
      }),
      201,
    ).data;
    expect(reqBook.status).toBe('REQUESTED');

    // Another booking's token cannot cancel the first booking with the second guest's OTP
    const token1 = blockedBook.link.split('/b/')[1]!;
    check(await t.http().post(`/api/v1/public/bookings/${token1}/cancel/verify`).send({}), 202);
    check(
      await t.http().post('/api/v1/public/sites/cozy-homes/verify').send({ phone: reqPhone }),
      202,
    );
    const otherPhoneOtp = latestOtpFromSms(reqPhone);
    const crossCancel = await t
      .http()
      .post(`/api/v1/public/bookings/${token1}/cancel`)
      .send({ code: otherPhoneOtp });
    expect(crossCancel.status).toBe(422);

    // 6th verify within 10 min for the same phone -> 429
    const spamPhone = '+254711000399';
    for (let i = 0; i < 5; i++) {
      check(
        await t.http().post('/api/v1/public/sites/cozy-homes/verify').send({ phone: spamPhone }),
        202,
      );
    }
    const sixth = await t
      .http()
      .post('/api/v1/public/sites/cozy-homes/verify')
      .send({ phone: spamPhone });
    expect(sixth.status).toBe(429);
  });

  async function bookOnSite(listingId: string, phone: string, checkIn: string, checkOut: string) {
    check(await t.http().post('/api/v1/public/sites/cozy-homes/verify').send({ phone }), 202);
    const code = latestOtpFromSms(phone);
    return check(
      await t.http().post('/api/v1/public/sites/cozy-homes/bookings').send({
        listingId,
        checkIn,
        checkOut,
        guests: 1,
        name: 'Site Guest',
        phone,
        code,
      }),
      201,
    ).data as { code: string; status: string; link: string };
  }
  const smsTo = (phone: string) =>
    outbox.filter((m) => m.channel === 'sms' && m.to === phone).map((m) => m.text);

  it('texts the real hold window on instant bookings, and a working pay link after a request is accepted', async () => {
    const { listing } = await setUpPublishedSite({ bookingMode: 'INSTANT', withMpesa: true });

    // Instant booking with M-Pesa: 15-minute hold, and the text says so.
    const instantPhone = '+254711000401';
    const instant = await bookOnSite(listing.id, instantPhone, '2027-02-01', '2027-02-03');
    expect(instant.status).toBe('HELD');
    const instantText = smsTo(instantPhone).at(-1)!;
    expect(instantText).toContain('within 15 minutes');
    expect(instantText).not.toContain('12 hours');
    expect(instantText).toContain(instant.link);

    // Request mode: the request text carries the booking code.
    await patch(host, '/host/site', {
      rules: { bookingMode: 'REQUEST', payWhen: 'FULL', cancellation: 'FLEXIBLE' },
    });
    const reqPhone = '+254711000402';
    const req = await bookOnSite(listing.id, reqPhone, '2027-02-10', '2027-02-12');
    expect(req.status).toBe('REQUESTED');
    expect(smsTo(reqPhone).at(-1)).toContain(`Booking ${req.code}: ${req.link}`);

    // Host accepts: the guest must get a link they can actually pay from.
    const row = await t.prisma.booking.findFirstOrThrow({ where: { code: req.code } });
    await post(host, `/host/bookings/${row.id}/accept`, {});
    const payNow = smsTo(reqPhone).at(-1)!;
    expect(payNow).toContain('your request is accepted');
    const link = /https:\/\/cozy-homes\.kodihub\.co\.ke\/b\/([A-Za-z0-9_-]+)/.exec(payNow);
    expect(link).not.toBeNull();
    const page = check(await t.http().get(`/api/v1/public/bookings/${link![1]}`), 200).data;
    expect(page.code).toBe(req.code);
    expect(page.status).toBe('HELD');
  });

  it('refuses to send an M-Pesa prompt for a cancelled booking', async () => {
    const { listing } = await setUpPublishedSite({ bookingMode: 'INSTANT', withMpesa: true });
    const phone = '+254711000403';
    const booking = await bookOnSite(listing.id, phone, '2027-03-01', '2027-03-03');
    const token = booking.link.split('/b/')[1]!;
    const row = await t.prisma.booking.findFirstOrThrow({ where: { code: booking.code } });
    await post(host, `/host/bookings/${row.id}/cancel`, {});
    fake.pushes = [];

    const res = await t.http().post(`/api/v1/public/bookings/${token}/pay`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOKING_NOT_PAYABLE');
    expect(fake.pushes).toHaveLength(0);
  });

  it('texts check-in details as soon as a site booking for tomorrow is paid', async () => {
    const { listing, stkCallbackToken } = await setUpPublishedSite({ withMpesa: true });
    const nairobiDay = (offset: number) =>
      new Date(Date.now() + 3 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);
    const phone = '+254711000404';
    const booking = await bookOnSite(listing.id, phone, nairobiDay(1), nairobiDay(3));
    expect(booking.status).toBe('HELD');
    expect(smsTo(phone).some((m) => m.includes('welcome on'))).toBe(false);

    const cid = fake.pushes.at(-1)!.checkoutRequestId;
    fake.answers.set(cid, { resultCode: '0', resultDesc: 'Success' });
    const amountKes = fake.pushes.at(-1)!.amountKes;
    check(await hook(`${stkCallbackToken}/stk`, stkCallback(cid, 'CHK123456', amountKes)), 200);

    const info = smsTo(phone).filter((m) => m.includes('welcome on'));
    expect(info).toHaveLength(1);
    expect(info[0]).toContain('Lockbox code 9876');
    const row = await t.prisma.booking.findFirstOrThrow({ where: { code: booking.code } });
    expect(row.status).toBe('CONFIRMED');
    expect(row.infoSentAt).not.toBeNull();
  });
});
