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
const OWNER = { email: 'host-reports@example.invalid', phone: '+254700000210' };

type Res = { status: number; body: any; headers: Record<string, string> };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('Stays — Unit expenses and host profit reports (e2e)', () => {
  let t: TestApp;
  let host: Session;

  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);
  const post = async (s: Session, path: string, body: object, status = 200) =>
    check(await t.http().post(`/api/v1${path}`).set(auth(s)).send(body), status);

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t?.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    const admin = await login(t, 'admin@example.invalid');
    ({ owner: host } = await onboardOrg(t, admin, {
      name: 'Coastal Stays',
      kind: 'HOST',
      ownerEmail: OWNER.email,
      ownerPhone: OWNER.phone,
    }));
  });

  it('computes per-unit and total profit with payment, refund, unit expense, and evenly split shared expense', async () => {
    const prop = (
      await post(
        host,
        '/properties',
        { code: 'CST', name: 'Coastal Court', county: 'Mombasa' },
        201,
      )
    ).data;

    const l1 = (
      await post(
        host,
        '/host/listings',
        {
          propertyId: prop.id,
          unitNumber: 'A1',
          title: 'Unit A1',
          nightlyPrice: String(KES(5000)),
          cleaningFee: String(KES(500)),
        },
        201,
      )
    ).data;

    const l2 = (
      await post(
        host,
        '/host/listings',
        {
          propertyId: prop.id,
          unitNumber: 'A2',
          title: 'Unit A2',
          nightlyPrice: String(KES(4000)),
          cleaningFee: '0',
        },
        201,
      )
    ).data;

    // Booking on Unit A1: 2 nights (2026-10-10 -> 2026-10-12) = 10,000 + 500 cleaning = 10,500
    const booking = (
      await post(
        host,
        '/host/bookings',
        {
          listingId: l1.id,
          checkIn: '2026-10-10',
          checkOut: '2026-10-12',
          guests: 2,
          guest: { name: 'Amina Hassan', phone: '+254722111222' },
        },
        201,
      )
    ).data;

    // Record payment of KES 10,500 and refund of KES 500
    await post(
      host,
      `/host/bookings/${booking.id}/payments`,
      {
        amount: String(KES(10500)),
        method: 'CASH',
        receivedAt: '2026-10-10',
      },
      201,
    );
    await post(
      host,
      `/host/bookings/${booking.id}/refunds`,
      {
        amount: String(KES(500)),
        method: 'CASH',
        receivedAt: '2026-10-11',
        note: 'Discount courtesy',
      },
      201,
    );

    // 1. Unit expense on Unit A1 (RENT = KES 2,000)
    await post(
      host,
      '/expenses',
      {
        propertyId: prop.id,
        unitId: l1.unitId,
        category: 'RENT',
        name: 'Rent paid to landlord',
        amount: KES(2000),
        incurredOn: '2026-10-05',
      },
      201,
    );

    // 2. Shared property expense without unitId (SECURITY = KES 1,001 -> 100,100 minor units)
    // Split across 2 listings: first gets 50,050, second gets 50,050 (or if 100,101 -> 50,051 and 50,050)
    await post(
      host,
      '/expenses',
      {
        propertyId: prop.id,
        category: 'SECURITY',
        name: 'Night guard',
        amount: KES(1000),
        incurredOn: '2026-10-06',
      },
      201,
    );

    const summary = (
      await get(host, `/host/reports/summary?from=2026-10-01&to=2026-10-31&propertyId=${prop.id}`)
    ).data;

    expect(summary.rows).toHaveLength(2);
    const row1 = summary.rows.find((r: any) => r.unitId === l1.unitId);
    const row2 = summary.rows.find((r: any) => r.unitId === l2.unitId);

    // Unit A1: received 10,500, refunded 500, unit expense 2,000 + shared share 500 = 2,500 -> profit = 7,500
    expect(row1.received).toBe(String(KES(10500)));
    expect(row1.refunded).toBe(String(KES(500)));
    expect(row1.expenses).toBe(String(KES(2500)));
    expect(row1.profit).toBe(String(KES(7500)));
    expect(row1.nights).toBe(2);

    // Unit A2: received 0, refunded 0, shared share 500 -> profit = -500
    expect(row2.received).toBe('0');
    expect(row2.expenses).toBe(String(KES(500)));
    expect(row2.profit).toBe(String(-KES(500)));

    // Totals: received 10,500, refunded 500, expenses 3,000, profit 7,000
    expect(summary.totals.received).toBe(String(KES(10500)));
    expect(summary.totals.refunded).toBe(String(KES(500)));
    expect(summary.totals.expenses).toBe(String(KES(3000)));
    expect(summary.totals.profit).toBe(String(KES(7000)));

    // CSV export
    const csvRes = await t
      .http()
      .get(`/api/v1/host/reports/summary?from=2026-10-01&to=2026-10-31&format=csv`)
      .set(auth(host));
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.text).toContain('Unit A1');
  });
});
