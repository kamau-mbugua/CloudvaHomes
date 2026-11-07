import { outbox } from '../src/modules/notifications/senders.js';
import {
  auth,
  createPlatformAdmin,
  createTestApp,
  login,
  onboardOrg,
  resetDb,
  type Session,
  type TestApp,
} from './helpers.js';

const KES = (major: number) => major * 100;
const OWNER = { email: 'host-jobs@example.invalid', phone: '+254700000195' };
const JOB_SECRET = 'stays-jobs-test-secret-0123456789abcdef';

type Res = { status: number; body: any };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('Stays — Expiry and daily reminder jobs (e2e)', () => {
  let t: TestApp;
  let host: Session;
  let hostOrgId: string;

  const post = async (s: Session, path: string, body: object, status = 200) =>
    check(await t.http().post(`/api/v1${path}`).set(auth(s)).send(body), status);

  const jobPost = async (path: string, body: object = {}, status = 200) =>
    check(
      await t
        .http()
        .post(`/api/v1/internal/jobs/${path}`)
        .set('Authorization', `Bearer ${JOB_SECRET}`)
        .send(body),
      status,
    );

  beforeAll(async () => {
    process.env.JOBS_SHARED_SECRET = JOB_SECRET;
    t = await createTestApp();
  });

  afterAll(async () => {
    delete process.env.JOBS_SHARED_SECRET;
    await t?.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    outbox.length = 0;
    await createPlatformAdmin(t.prisma);
    const admin = await login(t, 'admin@example.invalid');
    ({ orgId: hostOrgId, owner: host } = await onboardOrg(t, admin, {
      name: 'Savannah Stays',
      kind: 'HOST',
      ownerEmail: OWNER.email,
      ownerPhone: OWNER.phone,
    }));
  });

  it('expires HELD bookings past holdExpiresAt, releases their nights, and is idempotent on second run', async () => {
    const prop = (await post(host, '/properties', { name: 'Savannah', code: 'SV' }, 201)).data;
    const listing = (
      await post(
        host,
        '/host/listings',
        {
          propertyId: prop.id,
          unitNumber: 'S1',
          title: 'Savannah Tent',
          maxGuests: 2,
          bedrooms: 1,
          bathrooms: 1,
          nightlyPrice: String(KES(3000)),
          cleaningFee: '0',
          minNights: 1,
        },
        201,
      )
    ).data;

    // Create a booking and set it to HELD expiring 16 minutes before `now`
    const b1 = (
      await post(
        host,
        '/host/bookings',
        {
          listingId: listing.id,
          checkIn: '2026-12-10',
          checkOut: '2026-12-12',
          guests: 2,
          guest: { name: 'Halima Guest', phone: '+254711000401' },
        },
        201,
      )
    ).data;

    const now = new Date('2026-12-01T12:00:00.000Z');
    await t.prisma.booking.update({
      where: { id: b1.id },
      data: {
        status: 'HELD',
        holdExpiresAt: new Date(now.getTime() - 16 * 60_000),
      },
    });
    outbox.length = 0;

    // First run expires the HELD booking and sends EXPIRED SMS
    const run1 = (await jobPost('stays-expiry', { now: now.toISOString() })).data;
    expect(run1).toEqual({ held: 1, requests: 0 });
    expect(
      outbox.some(
        (m) =>
          m.channel === 'sms' &&
          m.to === '+254711000401' &&
          m.text.includes("wasn't paid in time, so the dates were released"),
      ),
    ).toBe(true);

    // Second run is idempotent -> { held: 0, requests: 0 }
    const run2 = (await jobPost('stays-expiry', { now: now.toISOString() })).data;
    expect(run2).toEqual({ held: 0, requests: 0 });

    // The nights 2026-12-10 -> 2026-12-12 are bookable again
    const b2 = (
      await post(
        host,
        '/host/bookings',
        {
          listingId: listing.id,
          checkIn: '2026-12-10',
          checkOut: '2026-12-12',
          guests: 2,
          guest: { name: 'Second Guest', phone: '+254711000402' },
        },
        201,
      )
    ).data;
    expect(b2.status).toBe('CONFIRMED');
  });

  it('sends one CHECKIN_INFO per tomorrow check-in even when stays-daily runs twice, plus BALANCE_DUE and STAY_REQUEST_EXPIRING', async () => {
    const prop = (await post(host, '/properties', { name: 'Savannah', code: 'SV' }, 201)).data;
    const listing = (
      await post(
        host,
        '/host/listings',
        {
          propertyId: prop.id,
          unitNumber: 'S1',
          title: 'Savannah Tent',
          maxGuests: 2,
          bedrooms: 1,
          bathrooms: 1,
          nightlyPrice: String(KES(3000)),
          cleaningFee: '0',
          minNights: 1,
          checkInInstructions: 'Ask for Joseph at the main gate',
        },
        201,
      )
    ).data;

    // Booking checking in tomorrow (2026-12-15 when today = 2026-12-14), balanceDueOn = 2026-12-14
    const b1 = (
      await post(
        host,
        '/host/bookings',
        {
          listingId: listing.id,
          checkIn: '2026-12-15',
          checkOut: '2026-12-17',
          guests: 1,
          guest: { name: 'Checkin Guest', phone: '+254711000411' },
        },
        201,
      )
    ).data;

    await t.prisma.booking.update({
      where: { id: b1.id },
      data: {
        infoSentAt: null,
        balanceDueOn: new Date('2026-12-14T00:00:00.000Z'),
      },
    });

    // Also create a REQUESTED booking with 3 hours left
    const bReq = (
      await post(
        host,
        '/host/bookings',
        {
          listingId: listing.id,
          checkIn: '2026-12-20',
          checkOut: '2026-12-22',
          guests: 1,
          guest: { name: 'Request Guest', phone: '+254711000412' },
        },
        201,
      )
    ).data;
    await t.prisma.booking.update({
      where: { id: bReq.id },
      data: {
        status: 'REQUESTED',
        requestExpiresAt: new Date(Date.now() + 3 * 3600_000),
      },
    });

    outbox.length = 0;

    // First daily run for 2026-12-14
    await jobPost('stays-daily', { today: '2026-12-14' });

    const checkinSms1 = outbox.filter(
      (m) =>
        m.channel === 'sms' &&
        m.to === '+254711000411' &&
        m.text.includes('Ask for Joseph at the main gate'),
    );
    expect(checkinSms1).toHaveLength(1);

    const balanceSms1 = outbox.filter(
      (m) =>
        m.channel === 'sms' && m.to === '+254711000411' && m.text.includes('is due for your stay'),
    );
    expect(balanceSms1).toHaveLength(1);

    const expiringNotifs = await t.prisma.userNotification.findMany({
      where: { orgId: hostOrgId, kind: 'STAY_REQUEST_EXPIRING' },
    });
    expect(expiringNotifs.length).toBeGreaterThanOrEqual(1);

    // Second daily run for 2026-12-14 -> CHECKIN_INFO is NOT sent a second time
    await jobPost('stays-daily', { today: '2026-12-14' });
    const checkinSms2 = outbox.filter(
      (m) =>
        m.channel === 'sms' &&
        m.to === '+254711000411' &&
        m.text.includes('Ask for Joseph at the main gate'),
    );
    expect(checkinSms2).toHaveLength(1);
  });
});
