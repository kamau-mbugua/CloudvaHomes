import { formatDateOnly, parseDateOnly } from '../src/common/dates/date-only.js';
import { addDays, todayInNairobi } from '../src/modules/billing/billing-math.js';
import {
  auth,
  createPlatformAdmin,
  createTestApp,
  lastCode,
  login,
  onboardOrg,
  resetDb,
  type Session,
  type TestApp,
} from './helpers.js';

const TODAY = todayInNairobi();
const day = (offset: number) => formatDateOnly(addDays(parseDateOnly(TODAY), offset));
const KES = (n: number) => n * 100;

type Res = { status: number; body: any };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('Notice to vacate (phase 14, e2e)', () => {
  let t: TestApp;
  let owner: Session;
  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);
  const post = async (s: Session, path: string, body: object = {}, status = 201) =>
    check(await t.http().post(`/api/v1${path}`).set(auth(s)).send(body), status);
  const patch = async (s: Session, path: string, body: object, status = 200) =>
    check(await t.http().patch(`/api/v1${path}`).set(auth(s)).send(body), status);

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    const admin = await login(t, 'admin@example.invalid');
    ({ owner } = await onboardOrg(t, admin, {
      name: 'Notice Org',
      ownerEmail: 'notice@example.invalid',
      ownerPhone: '+254700000051',
    }));
  });

  async function setUp(opts: { startDate?: string; billingDay?: number } = {}) {
    const p = (await post(owner, '/properties', { name: 'Notice Court', code: 'NTC' })).data;
    const u = (
      await post(owner, '/units', { propertyId: p.id, number: 'N1', rentAmount: KES(20000) })
    ).data;
    const ty = (
      await post(owner, '/tenancies', {
        unitId: u.id,
        tenant: { firstName: 'Nia', lastName: 'Tenant', phone: '0711000851' },
        startDate: opts.startDate ?? TODAY,
        ...(opts.billingDay ? { billingDay: opts.billingDay } : {}),
        issueMoveInInvoice: false,
      })
    ).data;
    await post(owner, `/tenants/${ty.tenant.id}/portal-access`, {}, 200);
    await t.http().post('/api/v1/auth/otp/request').send({ phone: '0711000851' }).expect(202);
    const res = await t
      .http()
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '0711000851', code: lastCode('+254711000851') })
      .expect(200);
    const nia: Session = {
      token: res.body.data.accessToken,
      refreshCookie: null,
      body: res.body.data,
    };
    return { p, ty, nia, base: `/tenant/accounts/${ty.tenant.id}/tenancies/${ty.id}/notice` };
  }

  it('the tenant previews and gives notice; short notice is allowed with rent in lieu; staff are told', async () => {
    const x = await setUp();
    // The organisation's notice period applies (30 by default; here 45).
    await patch(owner, '/organization', { noticeDays: 45 });
    const full = (await get(x.nia, `${x.base}?moveOutDate=${day(60)}`)).data;
    expect(full).toMatchObject({
      noticeDays: 45,
      earliestMoveOut: day(45),
      shortNotice: false,
      rentInLieu: 0,
    });
    const short = (await get(x.nia, `${x.base}?moveOutDate=${day(10)}`)).data;
    expect(short).toMatchObject({ shortNotice: true, noticeEndsOn: day(45) });

    // A past date is refused; then notice is given.
    expect((await post(x.nia, x.base, { moveOutDate: day(-1) }, 422)).error.details[0].field).toBe(
      'moveOutDate',
    );
    const given = (
      await post(
        x.nia,
        x.base,
        { moveOutDate: day(10), reason: 'New job in Mombasa', forwardingPhone: '0722 333 444' },
        200,
      )
    ).data;
    expect(given).toMatchObject({
      status: 'NOTICE',
      endDate: day(10),
      noticeSource: 'TENANT',
      noticeEndsOn: day(45),
      forwardingPhone: '+254722333444',
      moveOutReason: 'New job in Mombasa',
    });
    expect((await post(x.nia, x.base, { moveOutDate: day(20) }, 409)).error.code).toBe(
      'NOTICE_ALREADY_GIVEN',
    );
    const told = await t.prisma.userNotification.count({ where: { kind: 'TENANCY_NOTICE' } });
    expect(told).toBeGreaterThanOrEqual(1);

    // Staff waive the short-notice rent; withdrawing clears everything.
    const waived = (await post(owner, `/tenancies/${x.ty.id}/notice/waive`, {}, 200)).data;
    expect(waived.noticeEndsOn).toBeNull();
    expect((await post(owner, `/tenancies/${x.ty.id}/notice/waive`, {}, 409)).error.code).toBe(
      'NO_SHORT_NOTICE',
    );
    const withdrawn = check(
      await t.http().delete(`/api/v1/tenancies/${x.ty.id}/notice`).set(auth(owner)),
      200,
    ).data;
    expect(withdrawn).toMatchObject({
      status: 'ACTIVE',
      noticeSource: null,
      forwardingPhone: null,
    });

    // A tenancy's own notice period overrides the organisation's.
    await patch(owner, `/tenancies/${x.ty.id}`, { noticeDays: 7 });
    expect((await get(x.nia, `${x.base}?moveOutDate=${day(10)}`)).data.shortNotice).toBe(false);
  });

  it('bills rent in lieu after move-out (rent only), unless waived', async () => {
    // Billed on today's day of the month (capped at 28), started months ago.
    const billingDay = Math.min(Number(TODAY.slice(8, 10)), 28);
    const billedOn = `${TODAY.slice(0, 8)}${String(billingDay).padStart(2, '0')}`;
    const x = await setUp({ startDate: day(-90), billingDay });
    await post(owner, '/charge-types', {
      propertyId: x.p.id,
      name: 'Garbage',
      kind: 'FIXED',
      amount: KES(300),
    });
    // The tenant left the day before this month's billing day, on short notice running to today.
    await t.prisma.tenancy.update({
      where: { id: x.ty.id },
      data: {
        status: 'ENDED',
        endDate: addDays(parseDateOnly(billedOn), -1),
        noticeEndsOn: parseDateOnly(TODAY),
        noticeSource: 'TENANT',
      },
    });
    const preview = (await get(owner, `/invoices/run/preview?date=${TODAY}`)).data;
    const item = preview.items.find((i: { tenancyId: string }) => i.tenancyId === x.ty.id);
    expect(item.lines).toEqual([expect.objectContaining({ kind: 'RENT', amount: KES(20000) })]);
    expect(item.lines[0].description).toMatch(/^Rent in lieu of notice/);

    await post(owner, `/tenancies/${x.ty.id}/notice/waive`, {}, 200);
    const after = (await get(owner, `/invoices/run/preview?date=${TODAY}`)).data;
    expect(after.items.find((i: { tenancyId: string }) => i.tenancyId === x.ty.id)).toBeUndefined();
  });

  it('the dashboard lists this week’s move-outs and deposits still to refund', async () => {
    const x = await setUp();
    await post(x.nia, x.base, { moveOutDate: day(3) }, 200);
    let dash = (await get(owner, '/reports/dashboard')).data;
    expect(dash.actions).toContainEqual({ kind: 'MOVE_OUTS_THIS_WEEK', count: 1 });
    expect(
      (await get(owner, '/tenancies?leaving=7')).data.map((r: { id: string }) => r.id),
    ).toEqual([x.ty.id]);

    // Moved out with a deposit still held: a refund is due.
    await t.prisma.tenancy.update({ where: { id: x.ty.id }, data: { depositHeld: 4_000_000n } });
    await post(owner, `/tenancies/${x.ty.id}/move-out`, { endDate: TODAY }, 200);
    dash = (await get(owner, '/reports/dashboard')).data;
    expect(dash.actions).toContainEqual({
      kind: 'DEPOSIT_REFUNDS_PENDING',
      count: 1,
      amount: 4_000_000,
    });
    expect((await get(owner, '/tenancies?depositHeld=true')).data).toHaveLength(1);
  });

  it('phase 23: a tenant downloads a payment history certificate anyone can check by code', async () => {
    const billingDay = Math.min(Number(TODAY.slice(8, 10)), 28);
    await patch(owner, '/organization', { invoiceDueDays: 0 });
    const x = await setUp({ startDate: day(-40), billingDay });
    const runOn = `${TODAY.slice(0, 8)}${String(billingDay).padStart(2, '0')}`;
    await post(owner, '/invoices/run', { date: runOn }, 200);
    const cash = (await post(owner, '/payment-channels', { kind: 'CASH', name: 'Office' })).data;
    await post(owner, '/payments', {
      tenantId: x.ty.tenant.id,
      channelId: cash.id,
      amount: KES(20000),
      receivedAt: runOn,
      reference: 'CERT-1',
      notifyTenant: false,
    });

    const path = `/api/v1/tenant/accounts/${x.ty.tenant.id}/payment-certificate/pdf`;
    const first = await t.http().get(path).set(auth(x.nia)).buffer(true);
    expect(first.status).toBe(200);
    expect(first.headers['content-type']).toBe('application/pdf');
    await t.http().get(path).set(auth(x.nia)).expect(200);
    const certs = await t.prisma.paymentCertificate.findMany();
    expect(certs).toHaveLength(1); // the same certificate all day

    const code = certs[0]!.code;
    const verify = check(
      await t.http().get(`/api/v1/public/certificates/${code.toLowerCase()}`),
      200,
    ).data;
    expect(verify).toMatchObject({
      code,
      tenantName: 'Nia Tenant',
      orgName: 'Notice Org',
      invoices: 1,
      onTime: 1,
      late: 0,
      unpaid: 0,
      paid: String(KES(20000)),
    });
    expect((await t.http().get('/api/v1/public/certificates/NOPE-NOPE-XX')).status).toBe(404);
  });
});
