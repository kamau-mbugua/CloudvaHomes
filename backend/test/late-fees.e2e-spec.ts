import { emptyContext, runWithContext } from '../src/common/context/request-context.js';
import { formatDateOnly, parseDateOnly } from '../src/common/dates/date-only.js';
import { addDays, periodOf, todayInNairobi } from '../src/modules/billing/billing-math.js';
import { LateFeesService } from '../src/modules/billing/late-fees/late-fees.service.js';
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
/** Last month: its invoice is issued on the 1st and due 7 days later. */
const LAST_MONTH_RUN = `${periodOf(formatDateOnly(addDays(parseDateOnly(RUN_DATE), -1)))}-01`;
const DUE = formatDateOnly(addDays(parseDateOnly(LAST_MONTH_RUN), 7));
const day = (n: number) => formatDateOnly(addDays(parseDateOnly(DUE), n));
const START = formatDateOnly(addDays(parseDateOnly(LAST_MONTH_RUN), -40));
const KES = (major: number) => major * 100;

type Res = { status: number; body: any };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('Late fees (e2e)', () => {
  let t: TestApp;
  let landlordOrg: Session;
  let agency: Session;
  const req =
    (method: 'get' | 'post' | 'patch') =>
    async (s: Session, path: string, body: object = {}, status = method === 'post' ? 201 : 200) =>
      check(await t.http()[method](`/api/v1${path}`).set(auth(s)).send(body), status);
  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);
  const post = req('post');
  const patch = req('patch');
  const run = (s: Session, today: string) =>
    runWithContext(emptyContext({ orgId: s.body.activeOrganization!.id }), () =>
      t.app.get(LateFeesService).run(today),
    );
  const feesOf = async (s: Session) =>
    (await get(s, '/invoices?kind=LATE_FEE&pageSize=100')).data as {
      id: string;
      total: number;
      status: string;
      period: string;
      lateFeeForId: string;
      lateFeeKeptBy: string | null;
      tenant: { id: string };
    }[];

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    const admin = await login(t, 'admin@example.invalid');
    ({ owner: landlordOrg } = await onboardOrg(t, admin, {
      name: 'Self Landlord',
      ownerEmail: 'lf-owner@example.invalid',
      ownerPhone: '+254700000081',
    }));
    ({ owner: agency } = await onboardOrg(t, admin, {
      name: 'Fee Agency',
      kind: 'AGENCY',
      ownerEmail: 'lf-agency@example.invalid',
      ownerPhone: '+254700000082',
    }));
  });

  /** A unit and tenant on `propertyId`, billed for last month (KES 20,000, unpaid). */
  async function tenantWithLastMonth(s: Session, propertyId: string, unit: string, phone: string) {
    const u = (await post(s, '/units', { propertyId, number: unit, rentAmount: KES(20000) })).data;
    const ty = (
      await post(s, '/tenancies', {
        unitId: u.id,
        tenant: { firstName: unit, lastName: 'Tenant', phone },
        startDate: START,
        billingDay: 1,
      })
    ).data;
    const { invoiceIds } = (await post(s, '/invoices/run', { date: LAST_MONTH_RUN }, 200)).data;
    const invoices = (await get(s, `/invoices?tenantId=${ty.tenant.id}&kind=MONTHLY`)).data as {
      id: string;
      period: string;
    }[];
    expect(invoiceIds.length).toBeGreaterThanOrEqual(1);
    return { tenantId: ty.tenant.id as string, invoice: invoices[0]! };
  }

  const enable = (s: Session) =>
    patch(s, '/organization', {
      lateFees: { enabled: true, mode: 'PERCENT', percentBps: 500, graceDays: 5, amount: 0 },
    });

  it('charges one fee per overdue invoice after the grace days, on what is still unpaid', async () => {
    const p = (await post(landlordOrg, '/properties', { name: 'Fee Court', code: 'FEE' })).data;
    const cash = (await post(landlordOrg, '/payment-channels', { kind: 'CASH', name: 'Cash' }))
      .data;
    const a = await tenantWithLastMonth(landlordOrg, p.id, 'F1', '0711000801'); // unpaid
    const b = await tenantWithLastMonth(landlordOrg, p.id, 'F2', '0711000802'); // partly paid
    const c = await tenantWithLastMonth(landlordOrg, p.id, 'F3', '0711000803'); // paid
    const pay = (tenantId: string, amount: number) =>
      post(landlordOrg, '/payments', {
        tenantId,
        channelId: cash.id,
        amount,
        receivedAt: day(1),
        notifyTenant: false,
      });
    await pay(b.tenantId, KES(15000));
    await pay(c.tenantId, KES(20000));

    // Off by default.
    expect(await run(landlordOrg, day(10))).toMatchObject({ created: 0 });
    const org = (await enable(landlordOrg)).data;
    expect(org.lateFees).toMatchObject({
      enabled: true,
      mode: 'PERCENT',
      percentBps: 500,
      graceDays: 5,
    });

    expect(await run(landlordOrg, day(4))).toMatchObject({ created: 0 }); // still in grace
    expect(await run(landlordOrg, day(5))).toEqual({ created: 2, skippedNoAgreement: 0 });
    expect(await run(landlordOrg, day(6))).toEqual({ created: 0, skippedNoAgreement: 0 }); // once only

    const fees = await feesOf(landlordOrg);
    const feeA = fees.find((f) => f.tenant.id === a.tenantId)!;
    const feeB = fees.find((f) => f.tenant.id === b.tenantId)!;
    expect(fees).toHaveLength(2);
    expect(feeA).toMatchObject({
      total: KES(1000), // 5% of 20,000
      lateFeeForId: a.invoice.id,
      period: a.invoice.period,
      lateFeeKeptBy: null,
    });
    expect(feeB.total).toBe(KES(250)); // 5% of the 5,000 still owed
    expect(fees.some((f) => f.tenant.id === c.tenantId)).toBe(false);

    // Voiding the original voids its unpaid fee; voiding a fee leaves the original alone.
    await post(landlordOrg, `/invoices/${a.invoice.id}/void`, { reason: 'Billed in error' }, 200);
    expect((await get(landlordOrg, `/invoices/${feeA.id}`)).data.status).toBe('VOID');
    await post(landlordOrg, `/invoices/${feeB.id}/void`, { reason: 'Waived' }, 200);
    expect((await get(landlordOrg, `/invoices/${b.invoice.id}`)).data.status).not.toBe('VOID');
    // A waived (voided) fee is never charged again.
    expect(await run(landlordOrg, day(20))).toMatchObject({ created: 0 });
  });

  it('in an agency, charges only where the agreement says who keeps the fee', async () => {
    const landlord = async (name: string, phone: string, code: string, recipient?: string) => {
      const l = (await post(agency, '/landlords', { name, kind: 'INDIVIDUAL', phone })).data;
      const p = (
        await post(agency, '/properties', { name: `${name} Court`, code, landlordId: l.id })
      ).data;
      const ag = (
        await post(agency, '/agreements', {
          landlordId: l.id,
          commissionBasis: 'PERCENT_OF_COLLECTED',
          commissionBps: 1000,
          remittanceDay: 5,
          startDate: START,
          ...(recipient ? { lateFeeRecipient: recipient } : {}),
        })
      ).data;
      return { l, p, ag };
    };
    const lucy = await landlord('Lucy', '0700000801', 'LUC'); // agreement doesn't say
    const lars = await landlord('Lars', '0700000802', 'LAR', 'AGENCY');
    expect(lucy.ag.lateFeeRecipient).toBeNull();
    expect(lars.ag.lateFeeRecipient).toBe('AGENCY');
    const tl = await tenantWithLastMonth(agency, lucy.p.id, 'U1', '0711000811');
    const tr = await tenantWithLastMonth(agency, lars.p.id, 'R1', '0711000812');
    await enable(agency);
    expect((await get(agency, '/organization')).data.lateFees.agreementsMissingRecipient).toBe(1);

    expect(await run(agency, day(5))).toEqual({ created: 1, skippedNoAgreement: 1 });
    let fees = await feesOf(agency);
    expect(fees).toHaveLength(1);
    expect(fees[0]).toMatchObject({ lateFeeForId: tr.invoice.id, lateFeeKeptBy: 'AGENCY' });

    // Lars's tenant pays rent and fee: only the rent reaches Lars's ledger.
    const cash = (await post(agency, '/payment-channels', { kind: 'CASH', name: 'Cash' })).data;
    await post(agency, '/payments', {
      tenantId: tr.tenantId,
      channelId: cash.id,
      amount: KES(21000),
      receivedAt: day(6),
      notifyTenant: false,
    });
    const collections = async (landlordId: string) =>
      (
        (await get(agency, `/landlords/${landlordId}/ledger?pageSize=100`)).data as {
          kind: string;
          amount: number;
        }[]
      )
        .filter((r) => r.kind === 'COLLECTION')
        .reduce((s, r) => s + r.amount, 0);
    expect(await collections(lars.l.id)).toBe(KES(20000));

    // Lucy's agreement now says the landlord keeps fees: the next run charges, and the paid
    // fee is collected for Lucy.
    await patch(agency, `/agreements/${lucy.ag.id}`, { lateFeeRecipient: 'LANDLORD' });
    expect((await get(agency, '/organization')).data.lateFees.agreementsMissingRecipient).toBe(0);
    expect(await run(agency, day(7))).toEqual({ created: 1, skippedNoAgreement: 0 });
    await post(agency, '/payments', {
      tenantId: tl.tenantId,
      channelId: cash.id,
      amount: KES(21000),
      receivedAt: day(8),
      notifyTenant: false,
    });
    expect(await collections(lucy.l.id)).toBe(KES(21000));

    // Changing who keeps fees later doesn't rewrite fees already issued.
    await patch(agency, `/agreements/${lars.ag.id}`, { lateFeeRecipient: 'LANDLORD' });
    fees = await feesOf(agency);
    expect(fees.find((f) => f.lateFeeForId === tr.invoice.id)!.lateFeeKeptBy).toBe('AGENCY');
    // Clearing it is allowed (null) and stops fees again.
    await patch(agency, `/agreements/${lucy.ag.id}`, { lateFeeRecipient: null });
    expect((await get(agency, '/organization')).data.lateFees.agreementsMissingRecipient).toBe(1);
  });
});
