import { formatDateOnly, parseDateOnly } from '../src/common/dates/date-only.js';
import { addDays, periodOf, todayInNairobi } from '../src/modules/billing/billing-math.js';
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

const TODAY = todayInNairobi();
const RUN_DATE = `${periodOf(TODAY)}-01`;
const LAST_MONTH = periodOf(formatDateOnly(addDays(parseDateOnly(RUN_DATE), -1)));
const STARTED = `${LAST_MONTH}-01`;
const YEAR = TODAY.slice(0, 4);
const KES = (major: number) => major * 100;

type Res = { status: number; body: any };
const check = (res: Res, status: number) => {
  if (res.status !== status) {
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body;
};

describe('Payments (e2e)', () => {
  let t: TestApp;
  let owner: Session;
  let other: Session;

  const post = async (s: Session, path: string, body: object, status = 200) =>
    check(await t.http().post(`/api/v1${path}`).set(auth(s)).send(body), status);
  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);
  const patch = async (s: Session, path: string, body: object, status = 200) =>
    check(await t.http().patch(`/api/v1${path}`).set(auth(s)).send(body), status);
  const del = async (s: Session, path: string, status = 204) =>
    check(await t.http().delete(`/api/v1${path}`).set(auth(s)), status);
  const pdf = async (s: Session, path: string) => {
    const res = await t
      .http()
      .get(`/api/v1${path}`)
      .set(auth(s))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    return res.body as Buffer;
  };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    const admin = await login(t, 'admin@example.invalid');
    ({ owner } = await onboardOrg(t, admin, {
      name: 'Pay Org',
      ownerEmail: 'p@example.invalid',
      ownerPhone: '+254700000060',
    }));
    ({ owner: other } = await onboardOrg(t, admin, {
      name: 'Other',
      ownerEmail: 'q@example.invalid',
      ownerPhone: '+254700000061',
    }));
  });

  /** A tenant with two open invoices: last month's one-off (KES 5,000, older) and this month's rent (KES 20,000). */
  async function tenantWithInvoices(s: Session = owner, code = 'PAY', phone = '0711000301') {
    const p = (await post(s, '/properties', { name: `Block ${code}`, code }, 201)).data;
    const u = (
      await post(s, '/units', { propertyId: p.id, number: 'P1', rentAmount: KES(20000) }, 201)
    ).data;
    const ty = (
      await post(
        s,
        '/tenancies',
        {
          unitId: u.id,
          tenant: { firstName: 'Pat', lastName: 'Payer', phone },
          startDate: STARTED,
          billingDay: 1,
        },
        201,
      )
    ).data;
    const old = (
      await post(
        s,
        '/invoices',
        {
          tenancyId: ty.id,
          lines: [{ description: 'Repairs', amount: KES(5000) }],
          dueDate: STARTED,
        },
        201,
      )
    ).data;
    const { invoiceIds } = (await post(s, '/invoices/run', { date: RUN_DATE })).data;
    const cash = (await post(s, '/payment-channels', { kind: 'CASH', name: 'Office cash' }, 201))
      .data;
    const mpesa = (
      await post(
        s,
        '/payment-channels',
        { kind: 'MPESA_PAYBILL', name: 'Paybill', shortcode: '522522' },
        201,
      )
    ).data;
    return { p, u, ty, tenantId: ty.tenant.id, old, rent: invoiceIds[0] as string, cash, mpesa };
  }

  const pay = (s: Session, body: object, status = 201) =>
    post(s, '/payments', { receivedAt: TODAY, ...body }, status);

  it('pays oldest first, keeps the surplus as credit, and the next invoice uses it', async () => {
    const x = await tenantWithInvoices();
    const first = (
      await pay(owner, { tenantId: x.tenantId, channelId: x.cash.id, amount: KES(8000) })
    ).data;
    expect(first).toMatchObject({
      number: `RCT-${YEAR}-000001`,
      amount: KES(8000),
      unallocated: 0,
      receiptSent: true,
    });
    expect(
      first.allocations.map((a: { invoice: { id: string }; amount: number }) => [
        a.invoice.id,
        a.amount,
      ]),
    ).toEqual([
      [x.old.id, KES(5000)],
      [x.rent, KES(3000)],
    ]);
    expect((await get(owner, `/invoices/${x.old.id}`)).data).toMatchObject({
      status: 'PAID',
      balance: 0,
    });
    const rent = (await get(owner, `/invoices/${x.rent}`)).data;
    expect(rent).toMatchObject({
      status: 'PARTIALLY_PAID',
      amountPaid: KES(3000),
      balance: KES(17000),
    });
    expect(rent.payments).toEqual([
      expect.objectContaining({ number: first.number, amount: KES(3000) }),
    ]);
    // The SMS receipt names the receipt and the balance.
    const sms = outbox.filter((m) => m.to === '+254711000301').at(-1)!;
    expect(sms.text).toBe(
      `Received KES 8,000.00 ref ${first.number}. Balance KES 17,000.00. Thank you - Pay Org`,
    );

    const over = (
      await pay(owner, {
        tenantId: x.tenantId,
        channelId: x.mpesa.id,
        amount: KES(20000),
        reference: 'qjk3x7yb2m',
        notifyTenant: false,
      })
    ).data;
    expect(over).toMatchObject({
      unallocated: KES(3000),
      reference: 'QJK3X7YB2M',
      receiptSent: false,
    });
    expect((await get(owner, `/tenants/${x.tenantId}`)).data).toMatchObject({
      balance: -KES(3000),
      creditBalance: KES(3000),
    });
    expect(outbox.filter((m) => m.to === '+254711000301')).toHaveLength(1);

    // A new invoice uses the credit straight away.
    const adhoc = (
      await post(
        owner,
        '/invoices',
        { tenancyId: x.ty.id, lines: [{ description: 'Key', amount: KES(1000) }] },
        201,
      )
    ).data;
    expect(adhoc).toMatchObject({ status: 'PAID', amountPaid: KES(1000) });
    expect((await get(owner, `/tenants/${x.tenantId}`)).data).toMatchObject({
      balance: -KES(2000),
      creditBalance: KES(2000),
    });
    expect((await get(owner, `/payments/${over.id}`)).data.unallocated).toBe(KES(2000));
  });

  it('explicit allocations are checked, and the rest becomes credit', async () => {
    const x = await tenantWithInvoices();
    const tooMuch = await pay(
      owner,
      {
        tenantId: x.tenantId,
        channelId: x.cash.id,
        amount: KES(9000),
        allocations: [{ invoiceId: x.old.id, amount: KES(6000) }],
      },
      422,
    );
    expect(tooMuch.error.details[0].field).toBe('allocations[0].amount');
    const overAmount = await pay(
      owner,
      {
        tenantId: x.tenantId,
        channelId: x.cash.id,
        amount: KES(1000),
        allocations: [{ invoiceId: x.rent, amount: KES(2000) }],
      },
      422,
    );
    expect(overAmount.error.details.map((d: { field: string }) => d.field)).toContain(
      'allocations',
    );
    const y = await tenantWithInvoices(other, 'OTH', '0711000399');
    await pay(
      owner,
      {
        tenantId: x.tenantId,
        channelId: x.cash.id,
        amount: KES(1000),
        allocations: [{ invoiceId: y.rent, amount: KES(1000) }],
      },
      422,
    );

    // Pay this month's rent first, on purpose, leaving the older one-off open.
    const p = (
      await pay(owner, {
        tenantId: x.tenantId,
        channelId: x.cash.id,
        amount: KES(21000),
        allocations: [{ invoiceId: x.rent, amount: KES(20000) }],
      })
    ).data;
    expect(p.unallocated).toBe(KES(1000));
    expect((await get(owner, `/invoices/${x.old.id}`)).data.status).toBe('ISSUED');
    const applied = (await post(owner, `/tenants/${x.tenantId}/apply-credit`, {})).data;
    expect(applied).toEqual({ applied: KES(1000), creditBalance: 0 });
    expect((await get(owner, `/invoices/${x.old.id}`)).data).toMatchObject({
      status: 'PARTIALLY_PAID',
      balance: KES(4000),
    });
    const open = (await get(owner, `/tenants/${x.tenantId}/open-invoices`)).data;
    expect(open.map((i: { id: string; balance: number }) => [i.id, i.balance])).toEqual([
      [x.old.id, KES(4000)],
    ]);
  });

  it('refuses duplicates, inactive channels and future dates', async () => {
    const x = await tenantWithInvoices();
    await pay(owner, {
      tenantId: x.tenantId,
      channelId: x.mpesa.id,
      amount: KES(100),
      reference: 'ABC123',
    });
    const dup = await pay(
      owner,
      { tenantId: x.tenantId, channelId: x.mpesa.id, amount: KES(100), reference: 'abc123' },
      409,
    );
    expect(dup.error).toMatchObject({ code: 'DUPLICATE_REFERENCE' });
    expect(dup.error.message).toContain(`RCT-${YEAR}-000001`);
    await pay(owner, {
      tenantId: x.tenantId,
      channelId: x.cash.id,
      amount: KES(100),
      reference: 'ABC123',
    }); // other channel: fine
    await patch(owner, `/payment-channels/${x.cash.id}`, { status: 'INACTIVE' });
    expect(
      (await pay(owner, { tenantId: x.tenantId, channelId: x.cash.id, amount: 1 }, 409)).error.code,
    ).toBe('CHANNEL_INACTIVE');
    const future = formatDateOnly(addDays(parseDateOnly(TODAY), 1));
    await pay(
      owner,
      { tenantId: x.tenantId, channelId: x.mpesa.id, amount: 1, receivedAt: future },
      422,
    );
    expect((await del(owner, `/payment-channels/${x.mpesa.id}`, 409)).error.code).toBe('IN_USE');
    expect(
      (await post(owner, '/payment-channels', { kind: 'CASH', name: 'Paybill' }, 409)).error.code,
    ).toBe('NAME_TAKEN');
  });

  it('a reversal mirrors every allocation, including credit used later, and reopens invoices', async () => {
    const x = await tenantWithInvoices();
    const p = (await pay(owner, { tenantId: x.tenantId, channelId: x.cash.id, amount: KES(26000) }))
      .data; // 5,000 + 20,000, credit 1,000
    expect(p.unallocated).toBe(KES(1000));
    const adhoc = (
      await post(
        owner,
        '/invoices',
        { tenancyId: x.ty.id, lines: [{ description: 'Key', amount: KES(1500) }] },
        201,
      )
    ).data;
    expect(adhoc).toMatchObject({ amountPaid: KES(1000), status: 'PARTIALLY_PAID' }); // credit used
    // Paid invoices can't be voided…
    expect(
      (await post(owner, `/invoices/${x.rent}/void`, { reason: 'test' }, 409)).error.code,
    ).toBe('INVOICE_SETTLED');

    const rev = (await post(owner, `/payments/${p.id}/reverse`, { reason: 'Counterfeit notes' }))
      .data;
    expect(rev).toMatchObject({
      amount: -KES(26000),
      reversesId: p.id,
      reversalReason: 'Counterfeit notes',
      number: `RCT-${YEAR}-000002`,
    });
    expect(
      rev.allocations
        .map((a: { amount: number }) => a.amount)
        .sort((a: number, b: number) => a - b),
    ).toEqual([-KES(20000), -KES(5000), -KES(1000)]);
    for (const id of [x.old.id, x.rent, adhoc.id]) {
      expect((await get(owner, `/invoices/${id}`)).data).toMatchObject({
        status: 'ISSUED',
        amountPaid: 0,
      });
    }
    expect((await get(owner, `/tenants/${x.tenantId}`)).data).toMatchObject({
      balance: KES(26500),
      creditBalance: 0,
    });
    expect((await get(owner, `/payments/${p.id}`)).data.reversedBy).toEqual({
      id: rev.id,
      number: rev.number,
    });
    expect(
      (await post(owner, `/payments/${p.id}/reverse`, { reason: 'again' }, 409)).error.code,
    ).toBe('ALREADY_REVERSED');
    expect(
      (await post(owner, `/payments/${rev.id}/reverse`, { reason: 'undo' }, 409)).error.code,
    ).toBe('IS_REVERSAL');
    // …but can once the money is gone.
    await post(owner, `/invoices/${adhoc.id}/void`, { reason: 'Key found' });
    expect((await get(owner, '/payments?reversed=false')).meta.total).toBe(0);
    expect((await get(owner, '/payments?reversed=true')).meta.total).toBe(2);
    expect(await t.prisma.auditLog.count({ where: { action: 'payment.reverse' } })).toBe(1);
  });

  it('deposits: received on the move-in invoice, then applied and refunded at move-out', async () => {
    const p = (await post(owner, '/properties', { name: 'Dep Block', code: 'DEP' }, 201)).data;
    const u = (
      await post(owner, '/units', { propertyId: p.id, number: 'D1', rentAmount: KES(10000) }, 201)
    ).data;
    await post(
      owner,
      '/move-in-charges',
      { propertyId: p.id, name: 'Deposit', kind: 'DEPOSIT', rentMonths: 2 },
      201,
    );
    await post(
      owner,
      '/move-in-charges',
      { propertyId: p.id, name: 'Fee', kind: 'FEE', amount: KES(1000) },
      201,
    );
    const cash = (await post(owner, '/payment-channels', { kind: 'CASH', name: 'Cash' }, 201)).data;
    const ty = (
      await post(
        owner,
        '/tenancies',
        {
          unitId: u.id,
          tenant: { firstName: 'Dee', lastName: 'Posit', phone: '0711000401' },
          startDate: STARTED,
          billingDay: 1,
        },
        201,
      )
    ).data;
    const tenantId = ty.tenant.id;
    // KES 21,000 move-in invoice: 20,000 deposit (paid first) + 1,000 fee.
    await pay(owner, { tenantId, channelId: cash.id, amount: KES(15000) });
    expect((await get(owner, `/tenancies/${ty.id}/deposit`)).data).toMatchObject({
      held: KES(15000),
      transactions: [{ kind: 'RECEIVED', amount: KES(15000) }],
    });
    await pay(owner, { tenantId, channelId: cash.id, amount: KES(6000) });
    expect((await get(owner, `/tenancies/${ty.id}/deposit`)).data.held).toBe(KES(20000));
    expect((await get(owner, `/tenancies/${ty.id}`)).data.depositHeld).toBe(KES(20000));

    await post(owner, '/invoices/run', { date: RUN_DATE }); // KES 10,000 rent owed
    expect(
      (await post(owner, `/tenancies/${ty.id}/deposit/settle`, { applyAmount: KES(1) }, 409)).error
        .code,
    ).toBe('TENANCY_ACTIVE');
    await post(owner, `/tenancies/${ty.id}/move-out`, { endDate: TODAY });
    await post(owner, `/tenancies/${ty.id}/deposit/settle`, { applyAmount: KES(10001) }, 422); // more than owed
    await post(
      owner,
      `/tenancies/${ty.id}/deposit/settle`,
      { applyAmount: KES(10000), refundAmount: KES(10001) },
      422,
    ); // more than held
    const settled = (
      await post(owner, `/tenancies/${ty.id}/deposit/settle`, {
        applyAmount: KES(10000),
        refundAmount: KES(10000),
        refundReference: 'MPESA-REF1',
      })
    ).data;
    expect(settled.held).toBe(0);
    expect(
      settled.transactions.map((d: { kind: string; amount: number }) => [d.kind, d.amount]),
    ).toEqual([
      ['RECEIVED', KES(15000)],
      ['RECEIVED', KES(5000)],
      ['APPLIED', -KES(10000)],
      ['REFUNDED', -KES(10000)],
    ]);
    expect((await get(owner, `/tenants/${tenantId}`)).data.balance).toBe(0);
    const depositPayment = (await get(owner, `/payments?tenantId=${tenantId}&method=DEPOSIT`))
      .data[0];
    expect(depositPayment).toMatchObject({ method: 'DEPOSIT', channel: null, amount: KES(10000) });

    // Reversing the deposit application puts the deposit back and reopens the rent.
    await post(owner, `/payments/${depositPayment.id}/reverse`, { reason: 'Wrong tenancy' });
    expect((await get(owner, `/tenancies/${ty.id}/deposit`)).data.held).toBe(KES(10000));
    expect((await get(owner, `/tenants/${tenantId}`)).data.balance).toBe(KES(10000));
  });

  it('the statement reconciles with the balance, and receipts and statements render as PDFs', async () => {
    const x = await tenantWithInvoices();
    const p1 = (await pay(owner, { tenantId: x.tenantId, channelId: x.cash.id, amount: KES(6000) }))
      .data;
    await post(owner, `/invoices/${x.rent}/credit-notes`, { amount: KES(500), reason: 'Goodwill' });
    const p2 = (
      await pay(owner, {
        tenantId: x.tenantId,
        channelId: x.mpesa.id,
        amount: KES(2000),
        reference: 'XYZ',
      })
    ).data;
    await post(owner, `/payments/${p2.id}/reverse`, { reason: 'Bounced' });
    const s = (await get(owner, `/tenants/${x.tenantId}/statement`)).data;
    expect(s.openingBalance).toBe(0);
    expect(s.entries.map((e: { type: string }) => e.type).sort()).toEqual(
      ['CREDIT_NOTE', 'INVOICE', 'INVOICE', 'PAYMENT', 'PAYMENT', 'REVERSAL'].sort(),
    );
    const owed = KES(25000) - KES(500) - KES(6000);
    expect(s.closingBalance).toBe(owed);
    expect((await get(owner, `/tenants/${x.tenantId}`)).data.balance).toBe(owed);
    // A window starting today carries everything before it as the opening balance.
    const tail = (await get(owner, `/tenants/${x.tenantId}/statement?from=${TODAY}`)).data;
    expect(tail.closingBalance).toBe(owed);
    await get(owner, `/tenants/${x.tenantId}/statement?from=${TODAY}&to=${STARTED}`, 422);

    expect((await pdf(owner, `/payments/${p1.id}/receipt`)).subarray(0, 5).toString()).toBe(
      '%PDF-',
    );
    expect(
      (await pdf(owner, `/tenants/${x.tenantId}/statement/pdf`)).subarray(0, 5).toString(),
    ).toBe('%PDF-');
  });

  it('concurrent payments for one tenant never over-allocate', async () => {
    const x = await tenantWithInvoices(); // owes 25,000
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        t
          .http()
          .post('/api/v1/payments')
          .set(auth(owner))
          .send({
            tenantId: x.tenantId,
            channelId: x.cash.id,
            amount: KES(7000),
            receivedAt: TODAY,
            notifyTenant: false,
          }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    const invoices = await t.prisma.invoice.findMany({ where: { tenantId: x.tenantId } });
    expect(invoices.every((i) => i.amountPaid === i.total)).toBe(true);
    const allocated = await t.prisma.paymentAllocation.aggregate({ _sum: { amount: true } });
    expect(allocated._sum.amount).toBe(BigInt(KES(25000)));
    expect((await get(owner, `/tenants/${x.tenantId}`)).data).toMatchObject({
      creditBalance: KES(10000),
      balance: -KES(10000),
    });
  });

  it('a retried request with the same Idempotency-Key records the payment once', async () => {
    const x = await tenantWithInvoices();
    const body = {
      tenantId: x.tenantId,
      channelId: x.cash.id,
      amount: KES(1000),
      receivedAt: TODAY,
    };
    const send = (key: string, b: object = body) =>
      t.http().post('/api/v1/payments').set(auth(owner)).set('Idempotency-Key', key).send(b);
    const [a, b] = await Promise.all([send('retry-1'), send('retry-1')]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.data.id).toBe(b.body.data.id);
    expect([a.body.data.replayed, b.body.data.replayed]).toEqual(
      expect.arrayContaining([false, true]),
    );
    expect(await t.prisma.payment.count()).toBe(1);
    expect(outbox.filter((m) => m.to === '+254711000301')).toHaveLength(1);
    const clash = await send('retry-1', { ...body, amount: KES(2000) });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('IDEMPOTENCY_MISMATCH');
  });

  it('other organisations’ payment ids behave like missing ids', async () => {
    const x = await tenantWithInvoices();
    const p = (await pay(owner, { tenantId: x.tenantId, channelId: x.cash.id, amount: KES(100) }))
      .data;
    for (const path of [
      `/payments/${p.id}`,
      `/payments/${p.id}/receipt`,
      `/tenants/${x.tenantId}/open-invoices`,
      `/tenants/${x.tenantId}/statement`,
      `/tenancies/${x.ty.id}/deposit`,
    ]) {
      await get(other, path, 404);
    }
    await post(other, `/payments/${p.id}/reverse`, { reason: 'xxx' }, 404);
    await post(other, `/tenants/${x.tenantId}/apply-credit`, {}, 404);
    await post(other, `/tenancies/${x.ty.id}/deposit/settle`, { refundAmount: 1 }, 404);
    await patch(other, `/payment-channels/${x.cash.id}`, { name: 'x' }, 404);
    await del(other, `/payment-channels/${x.cash.id}`, 404);
    const mine = (await post(other, '/payment-channels', { kind: 'CASH', name: 'Mine' }, 201)).data;
    await pay(other, { tenantId: x.tenantId, channelId: mine.id, amount: 1 }, 404);
    expect((await get(other, '/payments')).data).toHaveLength(0);
    expect((await get(other, '/payment-channels')).data.map((c: { id: string }) => c.id)).toEqual([
      mine.id,
    ]);
  });
});
