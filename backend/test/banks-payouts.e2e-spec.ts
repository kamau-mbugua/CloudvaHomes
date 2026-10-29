import { createHmac } from 'node:crypto';
import { formatDateOnly, parseDateOnly } from '../src/common/dates/date-only.js';
import { addDays, periodOf, todayInNairobi } from '../src/modules/billing/billing-math.js';
import {
  DarajaClient,
  type B2cAccepted,
  type B2cRequest,
  type StkQueryResult,
} from '../src/modules/mpesa/daraja.client.js';
import {
  acceptInvite,
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
const PERIOD = periodOf(TODAY);
const RUN_DATE = `${PERIOD}-01`;
const START = formatDateOnly(addDays(parseDateOnly(RUN_DATE), -40));
const KES = (major: number) => major * 100;
const OWNER = { email: 'bank-owner@example.invalid', phone: '+254700000080' };

class FakeDaraja extends DarajaClient {
  b2cCalls: B2cRequest[] = [];
  b2cError: Error | null = null;
  stkPush() {
    return Promise.resolve({ merchantRequestId: 'M', checkoutRequestId: 'C' });
  }
  stkQuery(): Promise<StkQueryResult> {
    return Promise.resolve({ resultCode: null, resultDesc: '' });
  }
  registerC2b() {
    return Promise.resolve();
  }
  override b2c(_t: unknown, r: B2cRequest): Promise<B2cAccepted> {
    if (this.b2cError) return Promise.reject(this.b2cError);
    this.b2cCalls.push(r);
    const n = this.b2cCalls.length;
    return Promise.resolve({ conversationId: `AG_${n}`, originatorConversationId: `OC_${n}` });
  }
}

type Res = { status: number; body: any; text?: string; headers?: Record<string, string> };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('Banks & payouts (e2e)', () => {
  let t: TestApp;
  let fake: FakeDaraja;
  let owner: Session;
  let header: string;

  const req =
    (method: 'get' | 'post' | 'put' | 'delete') =>
    async (
      s: Session,
      path: string,
      body: object = {},
      status = 200,
      headers: Record<string, string> = {},
    ) =>
      check(await t.http()[method](`/api/v1${path}`).set(auth(s)).set(headers).send(body), status);
  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);
  const post = req('post');
  const put = req('put');
  const del = req('delete');
  const up = () => ({ 'X-Step-Up': header });

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
    fake.b2cCalls = [];
    fake.b2cError = null;
    await createPlatformAdmin(t.prisma);
    const admin = await login(t, 'admin@example.invalid');
    ({ owner } = await onboardOrg(t, admin, {
      name: 'Bank Agency',
      kind: 'AGENCY',
      ownerEmail: OWNER.email,
      ownerPhone: OWNER.phone,
    }));
    header = await stepUp(t, owner, OWNER.phone);
  });

  /** Two tenants (T00001 in B1, T00002 in B2), this month invoiced, a bank channel. */
  async function portfolio() {
    const ll = (
      await post(
        owner,
        '/landlords',
        { name: 'Bob Landlord', kind: 'INDIVIDUAL', phone: '0700000702' },
        201,
      )
    ).data;
    const p = (
      await post(owner, '/properties', { name: 'Bank Court', code: 'BNK', landlordId: ll.id }, 201)
    ).data;
    await post(
      owner,
      '/units/bulk',
      { propertyId: p.id, numbers: ['B1', 'B2'], rentAmount: KES(20000) },
      201,
    );
    const units = (await get(owner, `/units?propertyId=${p.id}`)).data;
    const tenancy = async (unitId: string, firstName: string, phone: string) =>
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
    const tom = await tenancy(units[0].id, 'Tom', '0711000801');
    const ann = await tenancy(units[1].id, 'Ann', '0711000802');
    await post(owner, '/invoices/run', { date: RUN_DATE });
    const annInvoice = (await get(owner, `/invoices?tenantId=${ann.tenant.id}`)).data[0];
    const bank = (
      await post(
        owner,
        '/payment-channels',
        {
          kind: 'BANK_ACCOUNT',
          name: 'Test Bank collections',
          bankName: 'Test Bank',
          accountNumber: '0001112223',
          accountName: 'Bank Agency',
        },
        201,
      )
    ).data;
    return { p, tom, ann, annInvoice, bank };
  }

  const csvFile = (s: Session, path: string, csv: string, mapping?: object, status = 200) =>
    t
      .http()
      .post(`/api/v1${path}`)
      .set(auth(s))
      .field(mapping ? { mapping: JSON.stringify(mapping) } : {})
      .attach('file', Buffer.from(csv), { filename: 'statement.csv', contentType: 'text/csv' })
      .then((r) => check(r as Res, status));

  const balance = async (tenantId: string) =>
    (await get(owner, `/tenants/${tenantId}`)).data.balance;

  it('CSV statement: guessed mapping, credits matched by tenant code and invoice number, re-import adds nothing', async () => {
    const x = await portfolio();
    const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
    const csv = [
      'Transaction Date,Narrative,Debit,Credit,Balance',
      `${fmt(TODAY)},"RENT T00001 B1",,"20,000.00","20,000.00"`,
      `${fmt(TODAY)},Payment ${x.annInvoice.number},,"5,000.00","25,000.00"`,
      `${fmt(TODAY)},CASH DEPOSIT,,750.00,"25,750.00"`,
      `${fmt(TODAY)},LEDGER FEES,35.00,,"25,715.00"`,
      `31/02/2026,BAD DATE,,100,`,
    ].join('\n');
    const base = `/payment-channels/${x.bank.id}/statement-imports`;

    const guess = (await csvFile(owner, `${base}/preview`, csv)).data;
    expect(guess.headers).toContain('Narrative');
    expect(guess.mapping).toEqual({
      date: 'Transaction Date',
      dateFormat: 'DMY',
      credit: 'Credit',
      debit: 'Debit',
      reference: 'Narrative',
    });
    expect(guess.parsed).toBeNull();
    const mapping = guess.mapping;
    const preview = (await csvFile(owner, `${base}/preview`, csv, mapping)).data;
    expect(preview.parsed).toMatchObject({
      credits: 3,
      total: KES(25750),
      skipped: 1,
      errors: [{ row: 5 }],
    });

    const imp = (await csvFile(owner, base, csv, mapping, 201)).data;
    expect(imp).toMatchObject({
      rows: 5,
      credits: 3,
      created: 3,
      duplicates: 0,
      matched: 2,
      errors: [{ row: 5 }],
    });
    expect(await balance(x.tom.tenant.id)).toBe(0);
    expect(await balance(x.ann.tenant.id)).toBe(KES(15000));
    const unmatched = (await get(owner, '/inbound-transactions?status=UNMATCHED')).data;
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]).toMatchObject({ amount: KES(750), source: 'BANK_STATEMENT' });

    // Same file again (or an overlapping one): nothing new.
    const again = (await csvFile(owner, base, csv, mapping, 201)).data;
    expect(again).toMatchObject({ created: 0, duplicates: 3, matched: 0 });
    expect((await get(owner, base)).data).toHaveLength(2);
    // The mapping is remembered: the next preview reads straight away.
    expect((await csvFile(owner, `${base}/preview`, csv)).data.parsed.credits).toBe(3);

    // Not a bank account → refused.
    const cash = (await post(owner, '/payment-channels', { kind: 'CASH', name: 'Cash' }, 201)).data;
    expect(
      (
        await csvFile(
          owner,
          `/payment-channels/${cash.id}/statement-imports/preview`,
          csv,
          undefined,
          422,
        )
      ).error.code,
    ).toBe('NOT_BANK_CHANNEL');
    expect((await csvFile(owner, base, 'Date,Narrative\n', mapping, 422)).error.code).toBe(
      'CSV_INVALID',
    );
  });

  it('a bank slip entered by hand is linked to the statement line, not paid twice', async () => {
    const x = await portfolio();
    await post(
      owner,
      '/payments',
      {
        tenantId: x.tom.tenant.id,
        channelId: x.bank.id,
        amount: KES(20000),
        receivedAt: TODAY,
        reference: 'FT26100001',
        notifyTenant: false,
      },
      201,
    );
    const csv = `Date,Details,Amount,Txn Ref\n${TODAY},T00001 rent,20000,FT26100001\n`;
    const mapping = {
      date: 'Date',
      dateFormat: 'YMD',
      amount: 'Amount',
      reference: 'Details',
      transactionId: 'Txn Ref',
    };
    const imp = (
      await csvFile(owner, `/payment-channels/${x.bank.id}/statement-imports`, csv, mapping, 201)
    ).data;
    expect(imp).toMatchObject({ created: 1, matched: 0 });
    expect(await balance(x.tom.tenant.id)).toBe(0);
    expect((await get(owner, `/payments?tenantId=${x.tom.tenant.id}`)).data).toHaveLength(1);
  });

  it('signed bank notifications: step-up to enable, secret shown once, bad or stale signatures refused, replays ignored', async () => {
    const x = await portfolio();
    const path = `/payment-channels/${x.bank.id}/bank-webhook`;
    expect((await put(owner, path, { adapter: 'HODI_JSON' }, 403)).error.code).toBe(
      'STEP_UP_REQUIRED',
    );
    const on = (await put(owner, path, { adapter: 'HODI_JSON' }, 200, up())).data;
    expect(on.url).toMatch(/\/api\/v1\/hooks\/bank\/[\w-]{20,}$/);
    expect(on.secret.length).toBeGreaterThan(30);
    const channel = (await get(owner, '/payment-channels')).data.find(
      (c: { id: string }) => c.id === x.bank.id,
    );
    expect(channel.bankWebhook).toEqual({ adapter: 'HODI_JSON', url: on.url });
    expect(JSON.stringify(channel)).not.toContain(on.secret);

    const hook = new URL(on.url).pathname;
    const body = JSON.stringify({
      transactions: [
        {
          id: 'ipn-0001',
          amount: '20000.00',
          reference: 'T00001',
          payerName: 'Tom',
          occurredAt: new Date().toISOString(),
        },
      ],
    });
    const send = (raw: string, secret = on.secret, ts = Math.floor(Date.now() / 1000)) =>
      t
        .http()
        .post(hook)
        .set('Content-Type', 'application/json')
        .set('X-Hodi-Timestamp', String(ts))
        .set(
          'X-Hodi-Signature',
          `sha256=${createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex')}`,
        )
        .send(raw);

    expect((await send(body, 'wrong-secret')).status).toBe(401);
    expect((await send(body, on.secret, Math.floor(Date.now() / 1000) - 600)).status).toBe(401);
    const res = await send(body);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ received: 1, created: 1 });
    expect(await balance(x.tom.tenant.id)).toBe(0);
    expect((await send(body)).body.data).toEqual({ received: 1, created: 0 });
    expect((await t.http().post('/api/v1/hooks/bank/not-a-token').send({})).status).toBe(404);

    await del(owner, path, {}, 204, up());
    expect((await send(body)).status).toBe(404);
  });

  // ── Payouts ──

  /** Landlord Lucy (10% agreement) with KES 20,000 collected; drafted by the owner, approved by Abe. */
  async function remittance(opts: { payout: object; adjustCents?: number }) {
    const lucy = (
      await post(
        owner,
        '/landlords',
        {
          name: 'Lucy Landlord',
          kind: 'INDIVIDUAL',
          phone: '0700000701',
          email: 'lucy-b@example.invalid',
        },
        201,
      )
    ).data;
    const p = (
      await post(
        owner,
        '/properties',
        { name: 'Lucy Court', code: 'LUC', landlordId: lucy.id },
        201,
      )
    ).data;
    await post(
      owner,
      '/units/bulk',
      { propertyId: p.id, numbers: ['L1'], rentAmount: KES(20000) },
      201,
    );
    const units = (await get(owner, `/units?propertyId=${p.id}`)).data;
    await post(
      owner,
      '/agreements',
      {
        landlordId: lucy.id,
        commissionBasis: 'PERCENT_OF_COLLECTED',
        commissionBps: 1000,
        remittanceDay: 5,
        startDate: START,
      },
      201,
    );
    const ty = (
      await post(
        owner,
        '/tenancies',
        {
          unitId: units[0].id,
          tenant: { firstName: 'Tim', lastName: 'T', phone: '0711000901' },
          startDate: RUN_DATE,
          billingDay: 1,
        },
        201,
      )
    ).data;
    await post(owner, '/invoices/run', { date: RUN_DATE });
    const cash = (await post(owner, '/payment-channels', { kind: 'CASH', name: 'Cash' }, 201)).data;
    await post(
      owner,
      '/payments',
      {
        tenantId: ty.tenant.id,
        channelId: cash.id,
        amount: KES(20000),
        receivedAt: TODAY,
        notifyTenant: false,
      },
      201,
    );
    await put(owner, `/landlords/${lucy.id}/payout`, opts.payout, 200, up());
    if (opts.adjustCents) {
      await post(
        owner,
        `/landlords/${lucy.id}/ledger/adjustments`,
        { bucket: 'PAYABLE', amount: opts.adjustCents, memo: 'Rounding' },
        201,
        up(),
      );
    }
    const r = (await post(owner, '/remittances', { landlordId: lucy.id, period: PERIOD }, 201))
      .data;
    const role = (
      await post(
        owner,
        '/roles',
        {
          name: 'Approver',
          permissions: ['remittances:view', 'remittances:approve', 'remittances:pay'],
        },
        201,
        up(),
      )
    ).data;
    await post(
      owner,
      '/users/invitations',
      { firstName: 'Abe', lastName: 'Approver', email: 'abe-b@example.invalid', roleId: role.id },
      201,
    );
    const abe = await acceptInvite(t, 'abe-b@example.invalid');
    await post(abe, `/remittances/${r.id}/approve`, {}, 200);
    return { lucy, r, abe };
  }

  async function b2cAccount() {
    expect(
      (
        await put(
          owner,
          '/payout-accounts/b2c',
          {
            name: 'Payouts',
            shortcode: '600900',
            environment: 'SANDBOX',
            initiatorName: 'apiop',
            consumerKey: 'b2c-consumer-key',
            consumerSecret: 'b2c-consumer-secret',
            securityCredential: 'c2VjdXJpdHktY3JlZGVudGlhbC1zYW1wbGU=',
          },
          403,
        )
      ).error.code,
    ).toBe('STEP_UP_REQUIRED');
    const a = (
      await put(
        owner,
        '/payout-accounts/b2c',
        {
          name: 'Payouts',
          shortcode: '600900',
          environment: 'SANDBOX',
          initiatorName: 'apiop',
          consumerKey: 'b2c-consumer-key',
          consumerSecret: 'b2c-consumer-secret',
          securityCredential: 'c2VjdXJpdHktY3JlZGVudGlhbC1zYW1wbGU=',
        },
        200,
        up(),
      )
    ).data;
    expect(JSON.stringify(a)).not.toMatch(/b2c-consumer|c2VjdXJpdHk/);
    expect((await get(owner, '/payout-accounts')).data).toEqual([a]);
    return a as { callbackUrls: { result: string; timeout: string } };
  }

  const result = (url: string, n: number, code: number, extra: object = {}) =>
    t
      .http()
      .post(new URL(url).pathname)
      .send({
        Result: {
          ResultType: 0,
          ResultCode: code,
          ResultDesc:
            code === 0
              ? 'The service request is processed successfully.'
              : 'The balance is insufficient for the transaction.',
          OriginatorConversationID: `OC_${n}`,
          ConversationID: `AG_${n}`,
          TransactionID: code === 0 ? `RCP${n}XYZ01` : '',
          ...(code === 0
            ? {
                ResultParameters: {
                  ResultParameter: [
                    { Key: 'TransactionAmount', Value: 18000 },
                    { Key: 'TransactionReceipt', Value: `RCP${n}XYZ01` },
                  ],
                },
              }
            : {}),
          ...extra,
        },
      });

  it('sends an approved remittance by M-Pesa B2C: SENDING → PAID with the ledger entry; one key, one payout', async () => {
    const { lucy, r, abe } = await remittance({ payout: { method: 'MPESA', phone: '0700000701' } });
    expect(r.net).toBe(KES(18000));
    const sendPath = `/remittances/${r.id}/send`;
    expect((await post(owner, sendPath, {}, 409, up())).error.code).toBe('NO_PAYOUT_ACCOUNT');
    const account = await b2cAccount();
    expect((await post(abe, sendPath, {}, 403)).error.code).toBe('STEP_UP_REQUIRED');

    const sent = (await post(owner, sendPath, {}, 200, { ...up(), 'Idempotency-Key': 'rem-1' }))
      .data;
    expect(sent).toMatchObject({
      status: 'SENDING',
      payout: { state: 'PENDING', amount: KES(18000), phone: '•••• 0701' },
    });
    expect(fake.b2cCalls[0]).toMatchObject({
      shortcode: '600900',
      phone: '254700000701',
      amountKes: 18000,
      initiatorName: 'apiop',
    });
    // Same key → same payout, nothing sent again; another key while sending → refused.
    await post(owner, sendPath, {}, 200, { ...up(), 'Idempotency-Key': 'rem-1' });
    expect(fake.b2cCalls).toHaveLength(1);
    await post(owner, sendPath, {}, 409, { ...up(), 'Idempotency-Key': 'rem-2' });
    await post(owner, `/remittances/${r.id}/cancel`, { reason: 'changed my mind' }, 409);

    expect((await result(account.callbackUrls.result, 1, 0)).status).toBe(200);
    const paid = (await get(owner, `/remittances/${r.id}`)).data;
    expect(paid).toMatchObject({
      status: 'PAID',
      method: 'MPESA',
      reference: 'RCP1XYZ01',
      payout: { state: 'SUCCESS', receipt: 'RCP1XYZ01' },
    });
    expect(paid.paidBy).toMatchObject({ id: owner.body.user.id }); // the sender, not "someone"
    expect((await get(owner, `/landlords/${lucy.id}/account`)).data.balances.payable).toBe(0);
    // A retried callback changes nothing.
    await result(account.callbackUrls.result, 1, 0);
    const entries = (await get(owner, `/landlords/${lucy.id}/ledger?pageSize=100`)).data.filter(
      (e: { kind: string }) => e.kind === 'REMITTANCE',
    );
    expect(entries).toHaveLength(1);
    expect(
      (
        await t
          .http()
          .post(
            new URL(account.callbackUrls.result).pathname.replace(/payout\/[^/]+/, 'payout/wrong'),
          )
          .send({})
      ).status,
    ).toBe(404);
  });

  it('the approver can’t send; a declined payout goes back to APPROVED; cents and changed details are refused', async () => {
    const { lucy, r, abe } = await remittance({ payout: { method: 'MPESA', phone: '0700000701' } });
    const account = await b2cAccount();
    // Abe approved it, so even after confirming it's him (code by e-mail) he can't send it.
    const abeUp = await stepUp(t, abe, 'abe-b@example.invalid');
    expect(
      (await post(abe, `/remittances/${r.id}/send`, {}, 409, { 'X-Step-Up': abeUp })).error.code,
    ).toBe('SAME_PERSON');
    expect(fake.b2cCalls).toHaveLength(0);

    await post(owner, `/remittances/${r.id}/send`, {}, 200, up());
    await result(account.callbackUrls.result, 1, 2001);
    const back = (await get(owner, `/remittances/${r.id}`)).data;
    expect(back).toMatchObject({
      status: 'APPROVED',
      payout: { state: 'FAILED', resultDesc: 'The balance is insufficient for the transaction.' },
    });

    // Changed payout details after approval → must be re-approved.
    await put(
      owner,
      `/landlords/${lucy.id}/payout`,
      { method: 'MPESA', phone: '0700000799' },
      200,
      up(),
    );
    expect((await post(owner, `/remittances/${r.id}/send`, {}, 409, up())).error.code).toBe(
      'PAYOUT_CHANGED',
    );
  });

  it('a remittance with cents is refused (whole shillings only)', async () => {
    const { r } = await remittance({
      payout: { method: 'MPESA', phone: '0700000701' },
      adjustCents: 55,
    });
    await b2cAccount();
    expect((await post(owner, `/remittances/${r.id}/send`, {}, 422, up())).error.code).toBe(
      'WHOLE_SHILLINGS',
    );
  });

  it('timeouts and lost contact become UNCERTAIN, never resent; a person resolves them', async () => {
    const { r } = await remittance({ payout: { method: 'MPESA', phone: '0700000701' } });
    const account = await b2cAccount();
    await post(owner, `/remittances/${r.id}/send`, {}, 200, up());
    await t
      .http()
      .post(new URL(account.callbackUrls.timeout).pathname)
      .send({
        Result: {
          ResultCode: 1,
          ResultDesc: 'timed out',
          OriginatorConversationID: 'OC_1',
          ConversationID: 'AG_1',
        },
      })
      .expect(200);
    expect((await get(owner, `/remittances/${r.id}`)).data).toMatchObject({
      status: 'SENDING',
      payout: { state: 'UNCERTAIN' },
    });
    expect((await post(owner, `/remittances/${r.id}/send`, {}, 409, up())).error.code).toBe(
      'REMITTANCE_STATE',
    );
    await post(
      owner,
      `/remittances/${r.id}/payout/resolve`,
      { outcome: 'NOT_PAID', note: 'Not on the B2C statement' },
      200,
      up(),
    );
    expect((await get(owner, `/remittances/${r.id}`)).data.status).toBe('APPROVED');

    // Lost contact while sending.
    fake.b2cError = new TypeError('fetch failed');
    const lost = (await post(owner, `/remittances/${r.id}/send`, {}, 200, up())).data;
    expect(lost).toMatchObject({ status: 'SENDING', payout: { state: 'UNCERTAIN' } });
    fake.b2cError = null;
    await post(
      owner,
      `/remittances/${r.id}/payout/resolve`,
      { outcome: 'PAID', note: 'Seen on the statement' },
      422,
      up(),
    );
    const done = (
      await post(
        owner,
        `/remittances/${r.id}/payout/resolve`,
        { outcome: 'PAID', receipt: 'sjr4xk2l9p', note: 'Seen on the statement' },
        200,
        up(),
      )
    ).data;
    expect(done).toMatchObject({
      status: 'PAID',
      reference: 'SJR4XK2L9P',
      payout: { state: 'SUCCESS' },
    });
  });

  it('bulk-payment file for bank remittances: step-up, bank payouts only, audited without account numbers', async () => {
    const { r } = await remittance({
      payout: {
        method: 'BANK',
        bankName: 'Test Bank',
        branch: 'Town',
        accountName: 'Lucy L',
        accountNumber: '000555666777',
      },
    });
    const path = `/remittances/bulk-file?ids=${r.id}`;
    expect((await get(owner, path, 403)).error.code).toBe('STEP_UP_REQUIRED');
    const res = await t.http().get(`/api/v1${path}`).set(auth(owner)).set(up());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toBe(
      `Beneficiary,Bank,Branch,Account number,Amount,Reference\r\nLucy L,Test Bank,Town,000555666777,18000.00,${r.number}\r\n`,
    );
    expect(
      JSON.stringify(
        await t.prisma.auditLog.findMany({ where: { action: 'remittance.bulk_file' } }),
      ),
    ).not.toContain('000555666777');
    expect((await post(owner, `/remittances/${r.id}/send`, {}, 409, up())).error.code).toBe(
      'PAYOUT_NOT_MPESA',
    );
  });
});
