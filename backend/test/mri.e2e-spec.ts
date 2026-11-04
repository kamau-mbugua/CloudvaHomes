import { formatDateOnly, parseDateOnly } from '../src/common/dates/date-only.js';
import { addDays, periodOf, todayInNairobi } from '../src/modules/billing/billing-math.js';
import { mriDueDate } from '../src/modules/reports/report-math.js';
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

const TODAY = todayInNairobi();
const PERIOD = periodOf(TODAY);
const RUN_DATE = `${PERIOD}-01`;
const LAST_PERIOD = periodOf(formatDateOnly(addDays(parseDateOnly(RUN_DATE), -1)));
const LAST_MONTH_RUN = `${LAST_PERIOD}-01`;
const KES = (major: number) => major * 100;

type Res = { status: number; body: any; text?: string };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('Rental income tax report (e2e)', () => {
  let t: TestApp;
  let admin: Session;
  const req =
    (method: 'get' | 'post' | 'patch' | 'put') =>
    async (s: Session, path: string, body: object = {}, status = method === 'post' ? 201 : 200) =>
      check(await t.http()[method](`/api/v1${path}`).set(auth(s)).send(body), status);
  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);
  const post = req('post');
  const patch = req('patch');
  const put = req('put');

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    admin = await login(t, 'admin@example.invalid');
  });

  /** A unit billed last month (rent + a KES 1,000 water charge), paid in full this month. */
  async function paidLastMonth(
    s: Session,
    propertyId: string,
    unit: string,
    phone: string,
    rent: number,
    cashId: string,
  ) {
    const u = (await post(s, '/units', { propertyId, number: unit, rentAmount: KES(rent) })).data;
    const ty = (
      await post(s, '/tenancies', {
        unitId: u.id,
        tenant: { firstName: unit, lastName: 'Tenant', phone },
        startDate: LAST_MONTH_RUN,
        billingDay: 1,
        issueMoveInInvoice: false,
      })
    ).data;
    await post(s, '/invoices/run', { date: LAST_MONTH_RUN }, 200);
    await post(s, '/payments', {
      tenantId: ty.tenant.id,
      channelId: cashId,
      amount: KES(rent + 1000),
      receivedAt: TODAY,
      notifyTenant: false,
    });
    return ty;
  }

  it('counts residential rent received in the month, at the platform rate', async () => {
    const { owner } = await onboardOrg(t, admin, {
      name: 'Tax Landlord',
      ownerEmail: 'tax@example.invalid',
      ownerPhone: '+254700000051',
    });
    const cash = (await post(owner, '/payment-channels', { kind: 'CASH', name: 'Cash' })).data;
    const res = (await post(owner, '/properties', { name: 'Home Court', code: 'HOM' })).data;
    expect(res.use).toBe('RESIDENTIAL');
    const shop = (
      await post(owner, '/properties', { name: 'Shop Row', code: 'SHP', use: 'COMMERCIAL' })
    ).data;
    for (const p of [res, shop]) {
      await post(owner, '/charge-types', {
        propertyId: p.id,
        name: 'Water',
        kind: 'FIXED',
        amount: KES(1000),
      });
    }
    await paidLastMonth(owner, res.id, 'H1', '0711000601', 20000, cash.id);
    await paidLastMonth(owner, shop.id, 'S1', '0711000602', 50000, cash.id);

    const report = (await get(owner, `/reports/rental-income-tax?period=${PERIOD}`)).data;
    expect(report).toMatchObject({ period: PERIOD, rateBps: 750, dueDate: mriDueDate(PERIOD) });
    expect(report.rows).toEqual([
      expect.objectContaining({
        landlordId: null,
        landlordName: 'Tax Landlord',
        grossRentReceived: KES(20000), // water and the commercial shop excluded
        taxDue: KES(1500),
      }),
    ]);
    // Cash basis: nothing was received last month.
    expect(
      (await get(owner, `/reports/rental-income-tax?period=${LAST_PERIOD}`)).data.totals,
    ).toMatchObject({ grossRentReceived: 0, taxDue: 0 });

    const csv = await t
      .http()
      .get(`/api/v1/reports/rental-income-tax?period=${PERIOD}&format=csv`)
      .set(auth(owner));
    expect(csv.text.replace(/^\ufeff/, '').split('\r\n')[0]).toBe(
      'Landlord,KRA PIN,Gross rent received (KES),Rate,Tax due (KES),Due date',
    );

    // The rate is a platform setting.
    await put(admin, '/platform/settings', { mriRateBps: 1000 });
    expect(
      (await get(owner, `/reports/rental-income-tax?period=${PERIOD}`)).data.totals.taxDue,
    ).toBe(KES(2000));

    // Marking the home commercial takes it out.
    await patch(owner, `/properties/${res.id}`, { use: 'COMMERCIAL' });
    expect(
      (await get(owner, `/reports/rental-income-tax?period=${PERIOD}`)).data.totals
        .grossRentReceived,
    ).toBe(0);
  });

  it('gives an agency one row per landlord, filterable', async () => {
    const { owner: agency } = await onboardOrg(t, admin, {
      name: 'Tax Agency',
      kind: 'AGENCY',
      ownerEmail: 'taxag@example.invalid',
      ownerPhone: '+254700000052',
    });
    const cash = (await post(agency, '/payment-channels', { kind: 'CASH', name: 'Cash' })).data;
    const landlord = async (name: string, phone: string, code: string, kraPin?: string) => {
      const l = (
        await post(agency, '/landlords', {
          name,
          kind: 'INDIVIDUAL',
          phone,
          ...(kraPin ? { kraPin } : {}),
        })
      ).data;
      const p = (
        await post(agency, '/properties', { name: `${name} Court`, code, landlordId: l.id })
      ).data;
      return { l, p };
    };
    const a = await landlord('Amina', '0700000601', 'AMI', 'A123456789B');
    const b = await landlord('Baraka', '0700000602', 'BAR');
    await paidLastMonth(agency, a.p.id, 'A1', '0711000611', 20000, cash.id);
    await paidLastMonth(agency, b.p.id, 'B1', '0711000612', 30000, cash.id);

    const report = (await get(agency, `/reports/rental-income-tax?period=${PERIOD}`)).data;
    expect(
      report.rows.map(
        (r: { landlordName: string; kraPin: string | null; grossRentReceived: number }) => [
          r.landlordName,
          r.kraPin,
          r.grossRentReceived,
        ],
      ),
    ).toEqual([
      ['Amina', 'A123456789B', KES(20000)],
      ['Baraka', null, KES(30000)],
    ]);
    expect(report.totals.grossRentReceived).toBe(KES(50000));
    const one = (
      await get(agency, `/reports/rental-income-tax?period=${PERIOD}&landlordId=${b.l.id}`)
    ).data;
    expect(one.rows.map((r: { landlordId: string }) => r.landlordId)).toEqual([b.l.id]);
  });
});
