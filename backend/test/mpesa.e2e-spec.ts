import { periodOf, todayInNairobi } from '../src/modules/billing/billing-math.js';
import { DarajaConfigService } from '../src/modules/mpesa/daraja-config.service.js';
import { DarajaClient, type StkQueryResult } from '../src/modules/mpesa/daraja.client.js';
import { StkService } from '../src/modules/mpesa/stk.service.js';
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

const TODAY = todayInNairobi();
const RUN_DATE = `${periodOf(TODAY)}-01`;
const KES = (major: number) => major * 100;
const OWNER = { email: 'mp@example.invalid', phone: '+254700000070' };

/** Stands in for Safaricom: records calls; query answers are set per test. */
class FakeDaraja extends DarajaClient {
  pushes: { checkoutRequestId: string; amountKes: number; phone: string; callbackUrl: string }[] =
    [];
  answers = new Map<string, StkQueryResult>();
  registered: { confirmationUrl: string }[] = [];
  private n = 0;

  stkPush(_t: unknown, r: { amountKes: number; phone: string; callbackUrl: string }) {
    const checkoutRequestId = `ws_CO_TEST_${++this.n}`;
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

describe('M-Pesa (e2e)', () => {
  let t: TestApp;
  let fake: FakeDaraja;
  let owner: Session;
  let other: Session;

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
  /** Safaricom calling us: no auth header. */
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
    ({ owner } = await onboardOrg(t, admin, {
      name: 'Mpesa Org',
      ownerEmail: OWNER.email,
      ownerPhone: OWNER.phone,
    }));
    ({ owner: other } = await onboardOrg(t, admin, {
      name: 'Other',
      ownerEmail: 'o2@example.invalid',
      ownerPhone: '+254700000071',
    }));
  });

  /** Property KLC, unit A1 let to tenant T00001 with this month's rent invoiced; a configured paybill. */
  async function setUp() {
    const p = (await post(owner, '/properties', { name: 'Kilimani', code: 'KLC' }, 201)).data;
    const u = (
      await post(owner, '/units', { propertyId: p.id, number: 'A1', rentAmount: KES(20000) }, 201)
    ).data;
    const ty = (
      await post(
        owner,
        '/tenancies',
        {
          unitId: u.id,
          tenant: { firstName: 'Pat', lastName: 'Payer', phone: '0700000001' },
          startDate: RUN_DATE,
          billingDay: 1,
        },
        201,
      )
    ).data;
    const { invoiceIds } = (await post(owner, '/invoices/run', { date: RUN_DATE })).data;
    const channel = (
      await post(
        owner,
        '/payment-channels',
        { kind: 'MPESA_PAYBILL', name: 'Paybill', shortcode: '600000' },
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
    return {
      p,
      u,
      ty,
      tenantId: ty.tenant.id as string,
      invoiceId: invoiceIds[0] as string,
      channel: configured,
      token,
    };
  }

  const c2b = (receipt: string, amount: number, ref: string | null, msisdn = '2547 ***** 999') => ({
    TransactionType: 'Pay Bill',
    TransID: receipt,
    TransTime: TODAY.replace(/-/g, '') + '101500',
    TransAmount: (amount / 100).toFixed(2),
    BusinessShortCode: '600000',
    BillRefNumber: ref ?? '',
    MSISDN: msisdn,
    FirstName: 'Pat',
    LastName: 'Payer',
  });

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
                  { Name: 'TransactionDate', Value: Number(TODAY.replace(/-/g, '') + '101500') },
                  { Name: 'PhoneNumber', Value: 254700000001 },
                ],
              },
            }
          : {}),
      },
    },
  });

  it('Daraja credentials are write-only, need step-up, and give the channel its webhook URLs', async () => {
    const ch = (
      await post(
        owner,
        '/payment-channels',
        { kind: 'MPESA_PAYBILL', name: 'Paybill', shortcode: '600000' },
        201,
      )
    ).data;
    expect(ch.daraja).toEqual({
      configured: false,
      environment: null,
      callbackUrls: null,
      c2bRegisteredAt: null,
    });
    const body = {
      environment: 'SANDBOX',
      consumerKey: 'test-consumer-key',
      consumerSecret: 'test-consumer-secret',
      passkey: 'test-passkey',
    };
    expect((await put(owner, `/payment-channels/${ch.id}/daraja`, body, 403)).error.code).toBe(
      'STEP_UP_REQUIRED',
    );
    const header = await stepUp(t, owner, OWNER.phone);
    const set = (
      await put(owner, `/payment-channels/${ch.id}/daraja`, body, 200, { 'X-Step-Up': header })
    ).data;
    expect(set.daraja).toMatchObject({ configured: true, environment: 'SANDBOX' });
    expect(set.daraja.callbackUrls.c2bConfirm).toMatch(
      /^https:\/\/api\.example\.invalid\/api\/v1\/hooks\/pay\/[\w-]{43}\/c2b\/confirm$/,
    );
    expect(set.daraja.callbackUrls.c2bConfirm.toLowerCase()).not.toContain('mpesa');
    const everything = JSON.stringify([
      set,
      await get(owner, '/payment-channels'),
      await t.prisma.auditLog.findMany(),
    ]);
    for (const secret of [
      'test-consumer-key',
      'test-consumer-secret',
      'test-passkey',
      'new-consumer',
    ])
      expect(everything).not.toContain(secret);

    // New keys without retyping the passkey keep it: payment prompts still work.
    await put(
      owner,
      `/payment-channels/${ch.id}/daraja`,
      {
        environment: 'SANDBOX',
        consumerKey: 'new-consumer-key',
        consumerSecret: 'new-consumer-secret',
      },
      200,
      { 'X-Step-Up': header },
    );
    const row = await t.prisma.paymentChannel.findUniqueOrThrow({ where: { id: ch.id } });
    expect(t.app.get(DarajaConfigService).credentials(row)).toEqual({
      consumerKey: 'new-consumer-key',
      consumerSecret: 'new-consumer-secret',
      passkey: 'test-passkey',
    });
    const reg = (await post(owner, `/payment-channels/${ch.id}/daraja/register-c2b`, {})).data;
    expect(reg.daraja.c2bRegisteredAt).toBeTruthy();
    expect(fake.registered[0]!.confirmationUrl).toBe(set.daraja.callbackUrls.c2bConfirm);
    const rotated = (
      await post(owner, `/payment-channels/${ch.id}/daraja/rotate-token`, {}, 200, {
        'X-Step-Up': header,
      })
    ).data;
    expect(rotated.daraja.callbackUrls.stk).not.toBe(set.daraja.callbackUrls.stk);
    expect(rotated.daraja.c2bRegisteredAt).toBeNull();
    const oldToken = /hooks\/pay\/([^/]+)\//.exec(set.daraja.callbackUrls.stk)![1];
    await hook(`${oldToken}/c2b/confirm`, c2b('TEST000001', KES(10), 'T00001')).expect(404);

    const cash = (await post(owner, '/payment-channels', { kind: 'CASH', name: 'Cash' }, 201)).data;
    expect(cash.daraja).toBeNull();
    expect(
      (await put(owner, `/payment-channels/${cash.id}/daraja`, body, 422, { 'X-Step-Up': header }))
        .error.code,
    ).toBe('NOT_MPESA_CHANNEL');
  });

  it('STK push: callback, re-query, payment on the requested invoice; replays change nothing', async () => {
    const x = await setUp();
    await post(
      owner,
      '/stk-requests',
      { tenantId: x.tenantId, channelId: x.channel.id, amount: KES(1500) + 50 },
      422,
    ); // cents
    const req = (
      await post(
        owner,
        '/stk-requests',
        {
          tenantId: x.tenantId,
          channelId: x.channel.id,
          amount: KES(15000),
          invoiceIds: [x.invoiceId],
        },
        202,
        { 'Idempotency-Key': 'stk-1' },
      )
    ).data;
    expect(req).toMatchObject({
      state: 'PENDING',
      phone: '+254700000001',
      amount: KES(15000),
      accountRef: 'T00001',
    });
    const again = (
      await post(
        owner,
        '/stk-requests',
        {
          tenantId: x.tenantId,
          channelId: x.channel.id,
          amount: KES(15000),
          invoiceIds: [x.invoiceId],
        },
        202,
        { 'Idempotency-Key': 'stk-1' },
      )
    ).data;
    expect(again.id).toBe(req.id);
    expect(fake.pushes).toHaveLength(1);
    expect(fake.pushes[0]).toMatchObject({
      amountKes: 15000,
      phone: '254700000001',
      callbackUrl: x.channel.daraja.callbackUrls.stk,
    });

    const checkout = fake.pushes[0]!.checkoutRequestId;
    fake.answers.set(checkout, { resultCode: '0', resultDesc: 'ok' });
    await hook(`${x.token}/stk`, stkCallback(checkout, 0, 'TEST000002', 15000)).expect(200, {
      ResultCode: 0,
      ResultDesc: 'Accepted',
    });
    const done = (await get(owner, `/stk-requests/${req.id}`)).data;
    expect(done).toMatchObject({ state: 'SUCCESS', mpesaReceipt: 'TEST000002' });
    const payment = (await get(owner, `/payments/${done.paymentId}`)).data;
    expect(payment).toMatchObject({
      method: 'MPESA_PAYBILL',
      reference: 'TEST000002',
      amount: KES(15000),
      recordedBy: null,
    });
    expect(payment.allocations).toEqual([
      expect.objectContaining({
        amount: KES(15000),
        invoice: expect.objectContaining({ id: x.invoiceId }),
      }),
    ]);
    expect(
      outbox.filter((m) => m.to === '+254700000001' && m.text.includes(payment.number)),
    ).toHaveLength(1);

    // Safaricom retries the callback: nothing new.
    await hook(`${x.token}/stk`, stkCallback(checkout, 0, 'TEST000002', 15000)).expect(200);
    expect(await t.prisma.payment.count()).toBe(1);
    const inbound = (await get(owner, '/inbound-transactions?status=MATCHED')).data;
    expect(inbound).toEqual([
      expect.objectContaining({
        source: 'MPESA_STK',
        matchedBy: 'AUTO_STK',
        providerRef: 'TEST000002',
      }),
    ]);
  });

  it('STK: a success the re-query denies records nothing; cancellations and the sweep finish requests', async () => {
    const x = await setUp();
    const push = async () =>
      (
        await post(
          owner,
          '/stk-requests',
          { tenantId: x.tenantId, channelId: x.channel.id, amount: KES(100) },
          202,
        )
      ).data;
    const forged = await push();
    const c1 = fake.pushes.at(-1)!.checkoutRequestId;
    fake.answers.set(c1, { resultCode: '1032', resultDesc: 'Request cancelled by user' });
    await hook(`${x.token}/stk`, stkCallback(c1, 0, 'TEST000003', 100)).expect(200);
    expect((await get(owner, `/stk-requests/${forged.id}`)).data.state).toBe('CANCELLED');
    expect(await t.prisma.payment.count()).toBe(0);

    const cancelled = await push();
    await hook(`${x.token}/stk`, stkCallback(fake.pushes.at(-1)!.checkoutRequestId, 1032)).expect(
      200,
    );
    expect((await get(owner, `/stk-requests/${cancelled.id}`)).data).toMatchObject({
      state: 'CANCELLED',
      resultDesc: 'Request cancelled by user',
    });

    const lost = await push();
    fake.answers.set(fake.pushes.at(-1)!.checkoutRequestId, {
      resultCode: '1037',
      resultDesc: 'DS timeout user cannot be reached',
    });
    const silent = await push(); // Daraja keeps saying "processing"
    const sweep = t.app.get(StkService);
    expect(await sweep.sweep(Date.now())).toMatchObject({ checked: 0 }); // too recent
    await sweep.sweep(Date.now() + 120_000);
    expect((await get(owner, `/stk-requests/${lost.id}`)).data.state).toBe('TIMEOUT');
    expect((await get(owner, `/stk-requests/${silent.id}`)).data.state).toBe('PENDING');
    await sweep.sweep(Date.now() + 11 * 60_000);
    expect((await get(owner, `/stk-requests/${silent.id}`)).data.state).toBe('TIMEOUT');
  });

  it('C2B: matched by tenant code, invoice number, unit reference or phone; otherwise left for reconciliation', async () => {
    const x = await setUp();
    const confirm = (body: object) =>
      hook(`${x.token}/c2b/confirm`, body).expect(200, { ResultCode: 0, ResultDesc: 'Accepted' });
    await hook(`${x.token}/c2b/validate`, c2b('TEST000010', KES(1), 'X')).expect(200, {
      ResultCode: 0,
      ResultDesc: 'Accepted',
    });

    await confirm(c2b('TEST000011', KES(1000), 't00001'));
    await confirm(
      c2b(
        'TEST000012',
        KES(1000),
        (await get(owner, `/invoices/${x.invoiceId}`)).data.number.toLowerCase(),
      ),
    );
    await confirm(c2b('TEST000013', KES(1000), 'klc-a1'));
    await confirm(c2b('TEST000014', KES(1000), 'RENT', '254700000001'));
    await confirm(c2b('TEST000015', KES(1000), 'who knows'));
    await confirm(c2b('TEST000011', KES(1000), 'T00001')); // replay

    const all = (await get(owner, '/inbound-transactions?pageSize=50')).data as {
      providerRef: string;
      matchStatus: string;
      matchedBy: string | null;
    }[];
    const by = Object.fromEntries(all.map((i) => [i.providerRef, [i.matchStatus, i.matchedBy]]));
    expect(by).toEqual({
      TEST000011: ['MATCHED', 'AUTO_ACCOUNT'],
      TEST000012: ['MATCHED', 'AUTO_ACCOUNT'],
      TEST000013: ['MATCHED', 'AUTO_ACCOUNT'],
      TEST000014: ['MATCHED', 'AUTO_PHONE'],
      TEST000015: ['UNMATCHED', null],
    });
    expect(await t.prisma.payment.count()).toBe(4);
    expect((await get(owner, `/tenants/${x.tenantId}`)).data.balance).toBe(KES(16000));

    // Reconcile the unmatched one by hand.
    const unmatched = (await get(owner, '/inbound-transactions?status=UNMATCHED')).data[0];
    const detail = (await get(owner, `/inbound-transactions/${unmatched.id}`)).data;
    expect(detail.raw.TransID).toBe('TEST000015');
    expect(detail.suggestions).toEqual([
      expect.objectContaining({
        reason: 'Name matches',
        tenant: expect.objectContaining({ id: x.tenantId }),
      }),
    ]);
    await post(owner, `/inbound-transactions/${unmatched.id}/ignore`, {
      reason: 'Checking with the bank',
    });
    await post(
      owner,
      `/inbound-transactions/${unmatched.id}/assign`,
      { tenantId: x.tenantId },
      409,
    );
    await post(owner, `/inbound-transactions/${unmatched.id}/unignore`, {});
    const assigned = (
      await post(owner, `/inbound-transactions/${unmatched.id}/assign`, { tenantId: x.tenantId })
    ).data;
    expect(assigned).toMatchObject({
      matchStatus: 'MATCHED',
      matchedBy: 'MANUAL',
      resolvedBy: { id: owner.body.user.id },
    });
    expect(
      (
        await post(
          owner,
          `/inbound-transactions/${unmatched.id}/assign`,
          { tenantId: x.tenantId },
          409,
        )
      ).error.code,
    ).toBe('ALREADY_RESOLVED');
    expect((await get(owner, `/payments/${assigned.payment.id}`)).data.recordedBy.id).toBe(
      owner.body.user.id,
    );
  });

  it('a receipt already entered by hand is linked, not paid twice; bad tokens and addresses are refused', async () => {
    const x = await setUp();
    await post(
      owner,
      '/payments',
      {
        tenantId: x.tenantId,
        channelId: x.channel.id,
        amount: KES(500),
        receivedAt: TODAY,
        reference: 'TEST000020',
      },
      201,
    );
    await hook(`${x.token}/c2b/confirm`, c2b('TEST000020', KES(500), 'T00001')).expect(200);
    expect(await t.prisma.payment.count()).toBe(1);
    expect((await get(owner, '/inbound-transactions')).data[0]).toMatchObject({
      matchStatus: 'MATCHED',
      matchedBy: 'EXISTING',
    });
    await hook(`not-a-token/c2b/confirm`, c2b('TEST000021', KES(1), 'T00001')).expect(404);
    // Another shortcode on this channel's URL is ignored.
    await hook(`${x.token}/c2b/confirm`, {
      ...c2b('TEST000022', KES(1), 'T00001'),
      BusinessShortCode: '999999',
    }).expect(200);
    expect(await t.prisma.inboundTransaction.count()).toBe(1);
  });

  it('other organisations can’t see or use M-Pesa records', async () => {
    const x = await setUp();
    await hook(`${x.token}/c2b/confirm`, c2b('TEST000030', KES(100), 'nothing')).expect(200);
    const req = (
      await post(
        owner,
        '/stk-requests',
        { tenantId: x.tenantId, channelId: x.channel.id, amount: KES(100) },
        202,
      )
    ).data;
    const inbound = (await get(owner, '/inbound-transactions')).data[0];
    await get(other, `/inbound-transactions/${inbound.id}`, 404);
    await post(other, `/inbound-transactions/${inbound.id}/ignore`, { reason: 'mine now' }, 404);
    await get(other, `/stk-requests/${req.id}`, 404);
    await post(
      other,
      '/stk-requests',
      { tenantId: x.tenantId, channelId: x.channel.id, amount: KES(100) },
      404,
    );
    const header = await stepUp(t, other, '+254700000071');
    await put(
      other,
      `/payment-channels/${x.channel.id}/daraja`,
      { environment: 'SANDBOX', consumerKey: 'xxxxxxxxxxxx', consumerSecret: 'yyyyyyyyyyyy' },
      404,
      { 'X-Step-Up': header },
    );
    expect((await get(other, '/inbound-transactions')).data).toHaveLength(0);
    expect((await get(other, '/stk-requests')).data).toHaveLength(0);
  });
});

describe('M-Pesa webhook address allow-list (e2e)', () => {
  it('refuses callers that are not Safaricom', async () => {
    process.env.MPESA_CALLBACK_IPS = '196.201.214.200';
    const t = await createTestApp();
    try {
      await t.http().post('/api/v1/hooks/pay/anything/c2b/confirm').send({}).expect(403);
    } finally {
      delete process.env.MPESA_CALLBACK_IPS;
      await t.close();
    }
  });
});
