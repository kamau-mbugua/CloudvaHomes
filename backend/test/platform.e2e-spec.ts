import { formatDateOnly, parseDateOnly } from '../src/common/dates/date-only.js';
import { addDays, todayInNairobi } from '../src/modules/billing/billing-math.js';
import { DarajaClient, type StkQueryResult } from '../src/modules/mpesa/daraja.client.js';
import { PlatformBillingService } from '../src/modules/platform/platform-billing.service.js';
import { previousPeriod } from '../src/modules/platform/platform-math.js';
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

const TODAY = todayInNairobi();
const LAST = previousPeriod(TODAY);
const LAST_START = `${LAST}-01`;
const KES = (major: number) => major * 100;
const ADMIN_PHONE = '+254700000099';
const day = (offset: number) => formatDateOnly(addDays(parseDateOnly(TODAY), offset));

class FakeDaraja extends DarajaClient {
  pushes: { checkoutRequestId: string; accountReference: string }[] = [];
  answers = new Map<string, StkQueryResult>();
  stkPush(_t: unknown, r: { accountReference: string }) {
    const checkoutRequestId = `ws_CO_PL_${this.pushes.length + 1}`;
    this.pushes.push({ checkoutRequestId, accountReference: r.accountReference });
    return Promise.resolve({ merchantRequestId: 'M', checkoutRequestId });
  }
  stkQuery(_t: unknown, q: { checkoutRequestId: string }) {
    return Promise.resolve(
      this.answers.get(q.checkoutRequestId) ?? { resultCode: null, resultDesc: 'processing' },
    );
  }
  registerC2b() {
    return Promise.resolve();
  }
}

type Res = { status: number; body: any };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('Platform billing (e2e)', () => {
  let t: TestApp;
  let fake: FakeDaraja;
  let admin: Session;
  let billing: PlatformBillingService;

  const post = async (
    s: Session,
    path: string,
    body: object = {},
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
  const patch = async (s: Session, path: string, body: object, status = 200) =>
    check(await t.http().patch(`/api/v1${path}`).set(auth(s)).send(body), status);
  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);

  beforeAll(async () => {
    process.env.MPESA_CALLBACK_IPS = '127.0.0.1,::1,::ffff:127.0.0.1';
    fake = new FakeDaraja();
    t = await createTestApp([], (b) => b.overrideProvider(DarajaClient).useValue(fake));
    billing = t.app.get(PlatformBillingService);
  });
  afterAll(async () => {
    delete process.env.MPESA_CALLBACK_IPS;
    await t?.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    fake.pushes = [];
    fake.answers.clear();
    await createPlatformAdmin(t.prisma);
    admin = await login(t, 'admin@example.invalid');
  });

  /**
   * A default plan (KES 100/unit, KES 1,000 minimum, no trial) and an org on it. Unless
   * `inTrial`, its trial is moved back to the start of last month so last month is billable.
   */
  async function setUp(name = 'Billed Org', n = 1, inTrial = false) {
    const plans = (await get(admin, '/platform/plans')).data;
    const plan =
      plans.find((p: { name: string }) => p.name === 'Standard') ??
      (
        await post(
          admin,
          '/platform/plans',
          {
            name: 'Standard',
            pricePerUnit: KES(100),
            minimumMonthly: KES(1000),
            trialDays: 0,
            isDefault: true,
          },
          201,
        )
      ).data;
    const ownerPhone = `+2547000001${String(n).padStart(2, '0')}`;
    const { orgId, owner } = await onboardOrg(t, admin, {
      name,
      ownerEmail: `owner${n}@example.invalid`,
      ownerPhone,
    });
    if (!inTrial) {
      await patch(admin, `/platform/organizations/${orgId}`, { trialEndsAt: LAST_START });
    }
    return { plan, orgId, owner, ownerPhone };
  }

  /** `count` units, `let` of them let since the start of last month. */
  async function letUnits(owner: Session, code: string, count: number, let_: number) {
    const p = (await post(owner, '/properties', { name: `Court ${code}`, code }, 201)).data;
    const numbers = Array.from({ length: count }, (_, i) => `${code}${i + 1}`);
    await post(owner, '/units/bulk', { propertyId: p.id, numbers, rentAmount: KES(10000) }, 201);
    const units = (await get(owner, `/units?propertyId=${p.id}`)).data;
    const tenancies = [];
    for (let i = 0; i < let_; i++) {
      tenancies.push(
        (
          await post(
            owner,
            '/tenancies',
            {
              unitId: units[i].id,
              tenant: { firstName: `T${i}`, lastName: code, phone: `07110009${code.length}${i}` },
              startDate: LAST_START,
              billingDay: 1,
            },
            201,
          )
        ).data,
      );
    }
    return { p, units, tenancies };
  }

  it('admins manage plans; organisations get the default plan; non-admins are kept out', async () => {
    const { plan, orgId, owner } = await setUp('Billed Org', 1, true);
    expect(plan).toMatchObject({ isDefault: true, active: true, organizationCount: 0 });
    const org = (await get(admin, `/platform/organizations/${orgId}`)).data;
    expect(org).toMatchObject({
      plan: { id: plan.id, name: 'Standard' },
      price: { pricePerUnit: KES(100), minimumMonthly: KES(1000), custom: false },
      trialEndsAt: TODAY,
    });
    expect(org.billingRef).toMatch(/^H\d{5}$/);
    expect((await get(admin, '/platform/plans')).data[0].organizationCount).toBe(1);

    // A second default takes over; a used plan can't be deleted.
    const premium = (
      await post(
        admin,
        '/platform/plans',
        { name: 'Premium', pricePerUnit: KES(80), isDefault: true },
        201,
      )
    ).data;
    expect((await get(admin, '/platform/settings')).data.defaultPlanId).toBe(premium.id);
    const plans = (await get(admin, '/platform/plans')).data;
    expect(plans.find((p: { id: string }) => p.id === plan.id).isDefault).toBe(false);
    const del = await t.http().delete(`/api/v1/platform/plans/${plan.id}`).set(auth(admin));
    expect(check(del, 409).error.code).toBe('PLAN_IN_USE');
    await post(admin, '/platform/plans', { name: 'Premium', pricePerUnit: 1 }, 422);

    // Search and status filter.
    const list = await get(admin, '/platform/organizations?q=billed&status=TRIAL');
    expect(list.meta.total).toBe(1);

    for (const path of ['/platform/stats', '/platform/plans', '/platform/organizations']) {
      await get(owner, path, 403);
    }
  });

  it('bills last month: units let on its last day, minimum, override, idempotent, trial skipped', async () => {
    const { orgId, owner } = await setUp();
    await letUnits(owner, 'AA', 3, 2);
    await post(admin, '/platform/invoices/run', { period: periodOf(TODAY) }, 422);

    let run = (await post(admin, '/platform/invoices/run', { period: LAST })).data;
    expect(run).toEqual({ period: LAST, created: 1 });
    let inv = (await get(admin, `/platform/invoices?orgId=${orgId}`)).data[0];
    // 2 units x KES 100 = KES 200, below the KES 1,000 minimum.
    expect(inv).toMatchObject({
      period: LAST,
      occupiedUnits: 2,
      rate: KES(100),
      total: KES(1000),
      status: 'ISSUED',
      dueDate: day(10),
    });
    expect(inv.number).toMatch(/^HODI-\d{4}-\d{6}$/);
    expect((await post(admin, '/platform/invoices/run', { period: LAST })).data.created).toBe(0);

    // A custom price: void and run again.
    await patch(admin, `/platform/organizations/${orgId}`, { priceOverride: KES(600) });
    await post(admin, `/platform/invoices/${inv.id}/void`, { reason: 'New price agreed' });
    run = (await post(admin, '/platform/invoices/run', { period: LAST })).data;
    expect(run.created).toBe(1);
    inv = (await get(admin, `/platform/invoices?orgId=${orgId}&status=ISSUED`)).data[0];
    expect(inv.total).toBe(KES(1200));

    // The organisation sees its own bill and PDF.
    const mine = await get(owner, '/billing');
    expect(mine.data).toMatchObject({
      price: { pricePerUnit: KES(600), custom: true },
      balance: KES(1200),
      overdue: null,
      canPayInApp: false,
      payTo: null,
    });
    expect((await get(owner, '/billing/invoices')).meta.total).toBe(2);
    const pdf = await t.http().get(`/api/v1/billing/invoices/${inv.id}/pdf`).set(auth(owner));
    expect(pdf.headers['content-type']).toBe('application/pdf');

    // Another organisation in a trial isn't billed and can't see the first one's invoices.
    const other = await setUp('Trial Org', 2);
    await patch(admin, `/platform/organizations/${other.orgId}`, { trialEndsAt: day(30) });
    await letUnits(other.owner, 'BB', 2, 2);
    expect((await post(admin, '/platform/invoices/run', { period: LAST })).data.created).toBe(0);
    expect((await get(other.owner, '/billing/invoices')).meta.total).toBe(0);
    await get(other.owner, `/billing/invoices/${inv.id}`, 404);

    const stats = (await get(admin, '/platform/stats')).data;
    expect(stats).toMatchObject({
      lastMonth: LAST,
      lastMonthBilled: KES(1200),
      outstanding: KES(1200),
      occupiedUnits: 4,
    });
  });

  it('manual payments pay the oldest invoice first and keep the rest as credit', async () => {
    const { orgId, owner } = await setUp();
    await letUnits(owner, 'CC', 1, 1);
    await post(admin, '/platform/invoices/run', { period: LAST });
    const pay = (
      await post(
        admin,
        '/platform/payments',
        { orgId, amount: KES(1500), method: 'BANK', reference: 'bank-001', receivedAt: TODAY },
        201,
      )
    ).data;
    expect(pay).toMatchObject({
      amount: KES(1500),
      unallocated: KES(500),
      reference: 'BANK-001',
      source: 'MANUAL',
    });
    const dup = await post(
      admin,
      '/platform/payments',
      { orgId, amount: KES(1), method: 'BANK', reference: 'BANK-001', receivedAt: TODAY },
      409,
    );
    expect(dup.error.code).toBe('DUPLICATE_REFERENCE');
    const inv = (await get(owner, '/billing/invoices')).data[0];
    expect(inv).toMatchObject({ status: 'PAID', balance: 0 });
    expect((await get(owner, `/billing/invoices/${inv.id}`)).data.payments).toEqual([
      expect.objectContaining({ reference: 'BANK-001', amount: KES(1000) }),
    ]);
    expect((await get(owner, '/billing')).data).toMatchObject({ balance: 0, credit: KES(500) });
    await post(admin, `/platform/invoices/${inv.id}/void`, { reason: 'Paid already' }, 409);
  });

  it('unpaid organisations go GRACE then SUSPENDED (read-only, rent still collected) and back on payment', async () => {
    const { orgId, owner, ownerPhone } = await setUp();
    const { tenancies } = await letUnits(owner, 'DD', 1, 1);
    const cash = (await post(owner, '/payment-channels', { kind: 'CASH', name: 'Cash' }, 201)).data;
    await post(admin, '/platform/invoices/run', { period: LAST });

    expect(await billing.refreshAll(day(5))).toEqual({ ACTIVE: 1 });
    await billing.refreshAll(day(11));
    expect((await get(admin, `/platform/organizations/${orgId}`)).data).toMatchObject({
      status: 'GRACE',
      overdue: null, // GET uses the real today; nothing is overdue yet
    });
    // "No suspension until" holds it at GRACE.
    await patch(admin, `/platform/organizations/${orgId}`, { noSuspendUntil: day(40) });
    await billing.refreshAll(day(35));
    expect((await get(admin, `/platform/organizations/${orgId}`)).data.status).toBe('GRACE');
    await patch(admin, `/platform/organizations/${orgId}`, { noSuspendUntil: null });
    await billing.refreshAll(day(35));
    expect((await get(admin, `/platform/organizations/${orgId}`)).data.status).toBe('SUSPENDED');

    // Suspended: reads fine, changes refused, money in still recorded.
    const session = await login(t, 'owner1@example.invalid');
    expect(session.body.activeOrganization?.status).toBe('SUSPENDED');
    await get(session, '/properties');
    const refused = await patch(session, '/organization', { name: 'Renamed' }, 403);
    expect(refused.error.code).toBe('ORG_SUSPENDED');
    await post(session, '/properties', { name: 'New', code: 'NEW' }, 403);
    await post(
      session,
      '/payments',
      { tenantId: tenancies[0].tenant.id, channelId: cash.id, amount: KES(500), receivedAt: TODAY },
      201,
    );
    await get(session, '/billing');

    // Pays Hodi by M-Pesa: needs Hodi's Daraja first.
    expect((await post(session, '/billing/pay', { amount: KES(1000) }, 409)).error.code).toBe(
      'NO_MPESA',
    );
    await put(
      admin,
      '/platform/settings',
      {
        paybill: '777777',
        consumerKey: 'hodi-consumer-key',
        consumerSecret: 'hodi-consumer-secret',
        passkey: 'hodi-passkey',
      },
      403,
    );
    const header = await stepUp(t, admin, ADMIN_PHONE);
    const settings = (
      await put(
        admin,
        '/platform/settings',
        {
          paybill: '777777',
          darajaEnvironment: 'SANDBOX',
          consumerKey: 'hodi-consumer-key',
          consumerSecret: 'hodi-consumer-secret',
          passkey: 'hodi-passkey',
        },
        200,
        { 'X-Step-Up': header },
      )
    ).data;
    expect(settings.daraja).toMatchObject({
      configured: true,
      environment: 'SANDBOX',
      passkey: true,
    });
    expect(JSON.stringify(settings)).not.toContain('hodi-consumer-secret');
    const token = /hooks\/platform\/([^/]+)\//.exec(settings.daraja.callbackUrls.stk)![1]!;

    const me = (await get(session, '/billing')).data;
    expect(me).toMatchObject({
      canPayInApp: true,
      payTo: { paybill: '777777', accountRef: me.billingRef },
    });
    const req = (
      await post(session, '/billing/pay', { amount: KES(1000) }, 202, {
        'Idempotency-Key': 'hodi-1',
      })
    ).data;
    expect(req).toMatchObject({ state: 'PENDING', phone: ownerPhone });
    expect(fake.pushes[0]!.accountReference).toBe(me.billingRef);
    const again = (
      await post(session, '/billing/pay', { amount: KES(1000) }, 202, {
        'Idempotency-Key': 'hodi-1',
      })
    ).data;
    expect(again.id).toBe(req.id);
    const checkout = fake.pushes[0]!.checkoutRequestId;
    fake.answers.set(checkout, { resultCode: '0', resultDesc: 'ok' });
    const callback = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'M',
          CheckoutRequestID: checkout,
          ResultCode: 0,
          ResultDesc: 'ok',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 1000 },
              { Name: 'MpesaReceiptNumber', Value: 'HODISTK001' },
              { Name: 'TransactionDate', Value: Number(TODAY.replace(/-/g, '') + '090000') },
              { Name: 'PhoneNumber', Value: Number(ownerPhone.slice(1)) },
            ],
          },
        },
      },
    };
    await t.http().post(`/api/v1/hooks/platform/${token}/stk`).send(callback).expect(200);
    await t.http().post(`/api/v1/hooks/platform/${token}/stk`).send(callback).expect(200); // retry
    await t.http().post('/api/v1/hooks/platform/wrong-token/stk').send(callback).expect(404);
    expect((await get(session, `/billing/pay/${req.id}`)).data).toMatchObject({
      state: 'SUCCESS',
      mpesaReceipt: 'HODISTK001',
    });
    expect((await get(session, '/billing/payments')).meta.total).toBe(1);
    expect((await get(admin, `/platform/organizations/${orgId}`)).data).toMatchObject({
      status: 'ACTIVE',
      balance: 0,
    });

    // Unsuspended: changes work again (a fresh token carries the new status).
    const fresh = await login(t, 'owner1@example.invalid');
    await patch(fresh, '/organization', { name: 'Renamed' });
  });

  it('paybill payments to Hodi are matched by account number', async () => {
    const { orgId, owner } = await setUp();
    await letUnits(owner, 'EE', 1, 1);
    await post(admin, '/platform/invoices/run', { period: LAST });
    const header = await stepUp(t, admin, ADMIN_PHONE);
    const settings = (
      await put(
        admin,
        '/platform/settings',
        {
          paybill: '777777',
          consumerKey: 'hodi-consumer-key',
          consumerSecret: 'hodi-consumer-secret',
        },
        200,
        { 'X-Step-Up': header },
      )
    ).data;
    expect(settings.daraja.passkey).toBe(false);
    expect((await get(owner, '/billing')).data.canPayInApp).toBe(false);
    const token = /hooks\/platform\/([^/]+)\//.exec(settings.daraja.callbackUrls.c2bConfirm)![1]!;
    const ref = (await get(owner, '/billing')).data.billingRef as string;
    const c2b = (receipt: string, account: string) => ({
      TransactionType: 'Pay Bill',
      TransID: receipt,
      TransTime: TODAY.replace(/-/g, '') + '100000',
      TransAmount: '1000.00',
      BusinessShortCode: '777777',
      BillRefNumber: account,
      MSISDN: '254700000101',
      FirstName: 'Olive',
    });
    await t.http().post(`/api/v1/hooks/platform/${token}/c2b/validate`).send({}).expect(200);
    await t
      .http()
      .post(`/api/v1/hooks/platform/${token}/c2b/confirm`)
      .send(c2b('HODIC2B001', ref.toLowerCase()))
      .expect(200);
    await t
      .http()
      .post(`/api/v1/hooks/platform/${token}/c2b/confirm`)
      .send(c2b('HODIC2B001', ref))
      .expect(200);
    await t
      .http()
      .post(`/api/v1/hooks/platform/${token}/c2b/confirm`)
      .send(c2b('HODIC2B002', 'H99999'))
      .expect(200);
    const payments = (await get(admin, `/platform/payments?orgId=${orgId}`)).data;
    expect(payments).toEqual([
      expect.objectContaining({ reference: 'HODIC2B001', source: 'C2B', amount: KES(1000) }),
    ]);
    expect((await get(owner, '/billing')).data.balance).toBe(0);
    expect((await get(admin, '/platform/payments')).meta.total).toBe(1);
  });

  it('superadmin controls the public landing page content and reset restores defaults', async () => {
    await setUp();
    const initialRes = await t.http().get('/api/v1/public/landing').expect(200);
    expect(initialRes.body.data.content.brandName).toBe('KodiHub');
    expect(initialRes.body.data.defaultPlan).toMatchObject({
      name: 'Standard',
      pricePerUnit: KES(100),
      minimumMonthly: KES(1000),
    });

    const updated = (
      await put(admin, '/platform/landing', {
        brandName: 'KodiHub Kenya',
        heroTitle: 'Modern Property Management for Nairobi Estates.',
        heroStats: [{ label: 'Active estates', value: '120+' }],
        contactEmail: 'support@kodihub.co.ke',
      })
    ).data;
    expect(updated.brandName).toBe('KodiHub Kenya');
    expect(updated.heroTitle).toBe('Modern Property Management for Nairobi Estates.');
    expect(updated.heroStats).toEqual([{ label: 'Active estates', value: '120+' }]);

    const publicAfter = await t.http().get('/api/v1/public/landing').expect(200);
    expect(publicAfter.body.data.content).toMatchObject({
      brandName: 'KodiHub Kenya',
      heroTitle: 'Modern Property Management for Nairobi Estates.',
      contactEmail: 'support@kodihub.co.ke',
    });

    const reset = (await put(admin, '/platform/landing', { reset: true })).data;
    expect(reset.brandName).toBe('KodiHub');
  });
});

function periodOf(date: string) {
  return date.slice(0, 7);
}
