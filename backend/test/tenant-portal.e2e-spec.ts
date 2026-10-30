import { formatDateOnly, parseDateOnly } from '../src/common/dates/date-only.js';
import { addDays, periodOf, todayInNairobi } from '../src/modules/billing/billing-math.js';
import { DarajaClient, type StkQueryResult } from '../src/modules/mpesa/daraja.client.js';
import { outbox } from '../src/modules/notifications/senders.js';
import { TenantAccountsService } from '../src/modules/tenant-portal/tenant-accounts.service.js';
import { runWithContext, emptyContext } from '../src/common/context/request-context.js';
import {
  auth,
  createPlatformAdmin,
  createTestApp,
  lastCode,
  login,
  onboardOrg,
  resetDb,
  type Session,
  stepUp,
  type TestApp,
} from './helpers.js';

const TODAY = todayInNairobi();
const PERIOD = periodOf(TODAY);
const RUN_DATE = `${PERIOD}-01`;
const KES = (major: number) => major * 100;
const OWNER = { email: 'tp@example.invalid', phone: '+254700000095' };

class FakeDaraja extends DarajaClient {
  pushes: { checkoutRequestId: string }[] = [];
  answers = new Map<string, StkQueryResult>();
  stkPush() {
    const checkoutRequestId = `ws_CO_TP_${this.pushes.length + 1}`;
    this.pushes.push({ checkoutRequestId });
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

describe('Tenant portal & reminders (e2e)', () => {
  let t: TestApp;
  let fake: FakeDaraja;
  let owner: Session;

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
    const admin = await login(t, 'admin@example.invalid');
    ({ owner } = await onboardOrg(t, admin, {
      name: 'Home Org',
      ownerEmail: OWNER.email,
      ownerPhone: OWNER.phone,
    }));
  });

  /** Two tenants in property HOM; this month's rent invoiced; a configured paybill. */
  async function setUp() {
    const p = (await post(owner, '/properties', { name: 'Home Court', code: 'HOM' }, 201)).data;
    await post(
      owner,
      '/units/bulk',
      { propertyId: p.id, numbers: ['H1', 'H2'], rentAmount: KES(20000) },
      201,
    );
    const units = (await get(owner, `/units?propertyId=${p.id}`)).data;
    const mk = async (unitId: string, firstName: string, phone: string) =>
      (
        await post(
          owner,
          '/tenancies',
          {
            unitId,
            tenant: { firstName, lastName: 'T', phone },
            startDate: RUN_DATE,
            billingDay: 1,
          },
          201,
        )
      ).data;
    const tom = await mk(units[0].id, 'Tom', '0711000701');
    const ann = await mk(units[1].id, 'Ann', '0711000702');
    await post(owner, '/invoices/run', { date: RUN_DATE });
    const channel = (
      await post(
        owner,
        '/payment-channels',
        { kind: 'MPESA_PAYBILL', name: 'Paybill', shortcode: '600111' },
        201,
      )
    ).data;
    const header = await stepUp(t, owner, OWNER.phone);
    const configured = (
      await put(
        owner,
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
    return { p, tom, ann, token };
  }

  async function signInAsTenant(phone: string): Promise<Session> {
    await t.http().post('/api/v1/auth/otp/request').send({ phone }).expect(202);
    const res = await t
      .http()
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: lastCode(`+254${phone.slice(1)}`) })
      .expect(200);
    return { token: res.body.data.accessToken, refreshCookie: null, body: res.body.data };
  }

  it('a tenant with access signs in with a code and sees only their own account', async () => {
    const x = await setUp();
    // No access yet: the code never arrives (no account), so sign-in fails.
    await t.http().post('/api/v1/auth/otp/request').send({ phone: '0711000701' }).expect(202);
    expect(() => lastCode('+254711000701')).toThrow();

    const access = (await post(owner, `/tenants/${x.tom.tenant.id}/portal-access`)).data;
    expect(access.hasAccess).toBe(true);
    expect(outbox.some((m) => m.to === '+254711000701' && m.text.includes('/tenant'))).toBe(true);
    const tom = await signInAsTenant('0711000701');
    expect(tom.body).toMatchObject({
      organizations: [],
      tenantOf: [{ tenantId: x.tom.tenant.id, name: 'Tom T' }],
    });

    const home = (await get(tom, `/tenant/accounts/${x.tom.tenant.id}`)).data;
    expect(home).toMatchObject({
      tenant: { code: 'T00001' },
      balance: KES(20000),
      canPayInApp: true,
      howToPay: [{ kind: 'MPESA_PAYBILL', shortcode: '600111', accountRef: 'T00001' }],
      tenancies: [{ unit: { number: 'H1' }, property: { code: 'HOM' }, rentAmount: KES(20000) }],
    });
    expect(home.openInvoices).toHaveLength(1);
    const invoices = await get(tom, `/tenant/accounts/${x.tom.tenant.id}/invoices`);
    expect(invoices.meta.total).toBe(1);
    await get(tom, `/tenant/accounts/${x.tom.tenant.id}/invoices/${invoices.data[0].id}`);
    expect(
      (await get(tom, `/tenant/accounts/${x.tom.tenant.id}/statement`)).data.closingBalance,
    ).toBe(KES(20000));
    const pdf = await t
      .http()
      .get(`/api/v1/tenant/accounts/${x.tom.tenant.id}/invoices/${invoices.data[0].id}/pdf`)
      .set(auth(tom));
    expect(pdf.headers['content-type']).toBe('application/pdf');

    // Not Ann's account, not Ann's invoice, no staff screens.
    await get(tom, `/tenant/accounts/${x.ann.tenant.id}`, 404);
    const annInvoice = (await get(owner, `/invoices?tenantId=${x.ann.tenant.id}`)).data[0];
    await get(tom, `/tenant/accounts/${x.tom.tenant.id}/invoices/${annInvoice.id}`, 404);
    await get(tom, '/tenants', 403);
    await get(tom, '/invoices', 403);

    await t
      .http()
      .delete(`/api/v1/tenants/${x.tom.tenant.id}/portal-access`)
      .set(auth(owner))
      .expect(200);
    await get(tom, `/tenant/accounts/${x.tom.tenant.id}`, 404);
  });

  it('a tenant pays in the app by M-Pesa and the payment lands on their account', async () => {
    const x = await setUp();
    await post(owner, `/tenants/${x.tom.tenant.id}/portal-access`);
    const tom = await signInAsTenant('0711000701');
    const req = (
      await post(tom, `/tenant/accounts/${x.tom.tenant.id}/pay`, { amount: KES(20000) }, 202, {
        'Idempotency-Key': 'tp-1',
      })
    ).data;
    expect(req).toMatchObject({ state: 'PENDING', phone: '+254711000701' });
    const checkout = fake.pushes[0]!.checkoutRequestId;
    fake.answers.set(checkout, { resultCode: '0', resultDesc: 'ok' });
    await t
      .http()
      .post(`/api/v1/hooks/pay/${x.token}/stk`)
      .send({
        Body: {
          stkCallback: {
            MerchantRequestID: 'M',
            CheckoutRequestID: checkout,
            ResultCode: 0,
            ResultDesc: 'ok',
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: 20000 },
                { Name: 'MpesaReceiptNumber', Value: 'TPTEST0001' },
                { Name: 'TransactionDate', Value: Number(TODAY.replace(/-/g, '') + '090000') },
                { Name: 'PhoneNumber', Value: 254711000701 },
              ],
            },
          },
        },
      })
      .expect(200);
    expect((await get(tom, `/tenant/accounts/${x.tom.tenant.id}/pay/${req.id}`)).data.state).toBe(
      'SUCCESS',
    );
    expect((await get(tom, `/tenant/accounts/${x.tom.tenant.id}`)).data.balance).toBe(0);
    const payments = (await get(tom, `/tenant/accounts/${x.tom.tenant.id}/payments`)).data;
    expect(payments[0]).toMatchObject({ reference: 'TPTEST0001', amount: KES(20000) });
    const receipt = await t
      .http()
      .get(`/api/v1/tenant/accounts/${x.tom.tenant.id}/payments/${payments[0].id}/receipt`)
      .set(auth(tom));
    expect(receipt.headers['content-type']).toBe('application/pdf');
    // Tom can't see someone else's prompt.
    const annReq = (
      await post(
        owner,
        '/stk-requests',
        {
          tenantId: x.ann.tenant.id,
          channelId: (await get(owner, '/payment-channels')).data[0].id,
          amount: KES(100),
        },
        202,
      )
    ).data;
    await get(tom, `/tenant/accounts/${x.tom.tenant.id}/pay/${annReq.id}`, 404);
  });

  it('reminders are off by default; when on, each tenant gets one SMS a day, opted-out tenants none', async () => {
    const x = await setUp();
    const run = (today: string) =>
      runWithContext(emptyContext({ orgId: owner.body.activeOrganization!.id }), () =>
        t.app.get(TenantAccountsService).runReminders(today),
      );
    const due = formatDateOnly(addDays(parseDateOnly(RUN_DATE), 7)); // invoices due 7 days after issue
    const threeBefore = formatDateOnly(addDays(parseDateOnly(due), -3));
    expect(await run(threeBefore)).toMatchObject({ sent: 0, skipped: 'reminders are off' });

    const org = (
      await patch(owner, '/organization', {
        reminders: { enabled: true, daysBefore: 3, overdueDays: [10, 3, 3] },
      })
    ).data;
    expect(org.reminders).toEqual({ enabled: true, daysBefore: 3, overdueDays: [3, 10] });
    await patch(owner, `/tenants/${x.ann.tenant.id}`, { remindersOff: true });

    expect(await run(threeBefore)).toEqual({ sent: 1 });
    expect(await run(threeBefore)).toEqual({ sent: 0 }); // same day again: nothing
    const sms = outbox.filter((m) => m.to === '+254711000701').at(-1)!;
    expect(sms.text).toMatch(
      /^Hi Tom, KES 20,000\.00 is due on \d+ \w{3} \d{4}\. Pay to paybill 600111, account T00001\. Home Org$/,
    );
    const overdueDay = formatDateOnly(addDays(parseDateOnly(due), 3));
    expect(await run(overdueDay)).toEqual({ sent: 1 });
    expect(outbox.filter((m) => m.to === '+254711000701').at(-1)!.text).toContain('is overdue');
    expect(outbox.some((m) => m.to === '+254711000702' && m.text.startsWith('Hi Ann'))).toBe(false);

    // Manual reminder still reaches an opted-out tenant; nothing-owed is refused.
    const manual = (await post(owner, `/tenants/${x.ann.tenant.id}/reminder`)).data;
    expect(manual).toMatchObject({ kind: 'REMINDER_MANUAL', status: 'SENT' });
    const log = await get(owner, `/messages?tenantId=${x.tom.tenant.id}`);
    expect(
      log.data.map((m: { kind: string; automatic: boolean }) => [m.kind, m.automatic]),
    ).toEqual([
      ['REMINDER_OVERDUE', true],
      ['REMINDER_DUE', true],
    ]);
    const cash = (await post(owner, '/payment-channels', { kind: 'CASH', name: 'Cash' }, 201)).data;
    await post(
      owner,
      '/payments',
      {
        tenantId: x.tom.tenant.id,
        channelId: cash.id,
        amount: KES(20000),
        receivedAt: TODAY,
        notifyTenant: false,
      },
      201,
    );
    expect((await post(owner, `/tenants/${x.tom.tenant.id}/reminder`, {}, 409)).error.code).toBe(
      'NOTHING_DUE',
    );
  });

  it('bulk access invites every current tenant once', async () => {
    const x = await setUp();
    expect((await post(owner, '/tenants/portal-access', { propertyId: x.p.id })).data).toEqual({
      invited: 2,
    });
    expect((await post(owner, '/tenants/portal-access', {})).data).toEqual({ invited: 0 });
    expect((await get(owner, `/tenants/${x.ann.tenant.id}`)).data.portal.hasAccess).toBe(true);
  });

  it('generates lease agreement PDFs, attaches signed lease documents, and imports units and tenants via CSV', async () => {
    const x = await setUp();
    await post(owner, `/tenants/${x.tom.tenant.id}/portal-access`);
    const tom = await signInAsTenant('0711000701');

    // 1. Staff and tenant can download the backend-generated Lease Agreement PDF
    const staffPdf = await t
      .http()
      .get(`/api/v1/tenancies/${x.tom.id}/lease/pdf`)
      .set(auth(owner))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(staffPdf.status).toBe(200);
    expect(staffPdf.headers['content-type']).toContain('application/pdf');
    expect((staffPdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    const tenantPdf = await t
      .http()
      .get(`/api/v1/tenant/accounts/${x.tom.tenant.id}/tenancies/${x.tom.id}/lease/pdf`)
      .set(auth(tom))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(tenantPdf.status).toBe(200);
    expect((tenantPdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    // 2. Upload and attach a signed lease document (PDF)
    const fakePdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF', 'utf8');
    const upRes = await t
      .http()
      .post('/api/v1/uploads')
      .set(auth(owner))
      .field('purpose', 'LEASE_DOCUMENT')
      .attach('file', fakePdf, { filename: 'signed-lease.pdf', contentType: 'application/pdf' });
    expect(upRes.status).toBe(201);
    const uploadId = upRes.body.data.id as string;

    const attached = (await post(owner, `/tenancies/${x.tom.id}/lease-document`, { uploadId }))
      .data;
    expect(attached.hasSignedLease).toBe(true);

    const dlStaff = await t
      .http()
      .get(`/api/v1/tenancies/${x.tom.id}/lease-document`)
      .set(auth(owner));
    expect(dlStaff.status).toBe(200);

    const dlTenant = await t
      .http()
      .get(`/api/v1/tenant/accounts/${x.tom.tenant.id}/tenancies/${x.tom.id}/lease-document`)
      .set(auth(tom));
    expect(dlTenant.status).toBe(200);

    // 3. Bulk CSV import for Units (dryRun + commit)
    const unitTpl = await t.http().get('/api/v1/units/import-template').set(auth(owner));
    expect(unitTpl.status).toBe(200);
    expect(unitTpl.text).toContain('propertyCode,number,floor');

    const unitCsv = `propertyCode,number,floor,sizeSqft,rentAmount,description\nHOM,B1,1,700,25000,First floor\nHOM,B2,1,750,27500,Balcony unit`;
    const dryUnits = (await post(owner, '/units/import-csv', { csv: unitCsv, dryRun: true })).data;
    expect(dryUnits).toMatchObject({
      dryRun: true,
      created: 0,
      validCount: 2,
      totalRows: 2,
      errors: [],
    });

    const committedUnits = (await post(owner, '/units/import-csv', { csv: unitCsv, dryRun: false }))
      .data;
    expect(committedUnits).toMatchObject({
      dryRun: false,
      created: 2,
      validCount: 2,
      totalRows: 2,
      errors: [],
    });

    // 4. Bulk CSV import for Tenants (dryRun + commit)
    const tenantTpl = await t.http().get('/api/v1/tenants/import-template').set(auth(owner));
    expect(tenantTpl.status).toBe(200);
    expect(tenantTpl.text).toContain('firstName,lastName,phone');

    const tenantCsv = `firstName,lastName,phone,email,idNumber,kraPin\nGrace,Njeri,0722111222,grace@example.invalid,33445566,A123456789Z\nPeter,Kamau,0722333444,peter@example.invalid,77889900,`;
    const dryTenants = (await post(owner, '/tenants/import-csv', { csv: tenantCsv, dryRun: true }))
      .data;
    expect(dryTenants).toMatchObject({
      dryRun: true,
      created: 0,
      validCount: 2,
      totalRows: 2,
      errors: [],
    });

    const committedTenants = (
      await post(owner, '/tenants/import-csv', { csv: tenantCsv, dryRun: false })
    ).data;
    expect(committedTenants).toMatchObject({
      dryRun: false,
      created: 2,
      validCount: 2,
      totalRows: 2,
      errors: [],
    });

    // 5. Manual reminder creates an in-app notification for the portal-enabled tenant
    await post(owner, `/tenants/${x.tom.tenant.id}/reminder`);
    const notifs = await get(tom, '/notifications');
    expect(notifs.data.some((n: { kind: string }) => n.kind === 'REMINDER_MANUAL')).toBe(true);
  });
});
