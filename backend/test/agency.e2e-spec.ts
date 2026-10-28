import { formatDateOnly, parseDateOnly } from '../src/common/dates/date-only.js';
import { addDays, periodOf, todayInNairobi } from '../src/modules/billing/billing-math.js';
import { outbox } from '../src/modules/notifications/senders.js';
import {
  acceptInvite,
  auth,
  createPlatformAdmin,
  createTestApp,
  lastCode,
  login,
  onboardOrg,
  resetDb,
  roleId,
  type Session,
  stepUp,
  type TestApp,
} from './helpers.js';

const TODAY = todayInNairobi();
const PERIOD = periodOf(TODAY);
const RUN_DATE = `${PERIOD}-01`;
const START = formatDateOnly(addDays(parseDateOnly(RUN_DATE), -40));
const KES = (major: number) => major * 100;
const OWNER = { email: 'agency@example.invalid', phone: '+254700000090' };

type Res = { status: number; body: any };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('Agency accounting (e2e)', () => {
  let t: TestApp;
  let agency: Session;
  let landlordOrg: Session;

  const req =
    (method: 'get' | 'post' | 'put' | 'patch' | 'delete') =>
    async (
      s: Session,
      path: string,
      body: object = {},
      status = method === 'post' ? 201 : 200,
      headers: Record<string, string> = {},
    ) =>
      check(await t.http()[method](`/api/v1${path}`).set(auth(s)).set(headers).send(body), status);
  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);
  const post = req('post');
  const put = req('put');
  const patch = req('patch');
  const del = req('delete');

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    const admin = await login(t, 'admin@example.invalid');
    ({ owner: agency } = await onboardOrg(t, admin, {
      name: 'Prime Agency',
      kind: 'AGENCY',
      ownerEmail: OWNER.email,
      ownerPhone: OWNER.phone,
    }));
    ({ owner: landlordOrg } = await onboardOrg(t, admin, {
      name: 'Self Landlord',
      ownerEmail: 'self@example.invalid',
      ownerPhone: '+254700000091',
    }));
  });

  /** Landlord Lucy with property LUC (units L1, L2); a 10% agreement; tenant in L1 with monthly charges. */
  async function setUp(agreement: Record<string, unknown> = {}) {
    const lucy = (
      await post(agency, '/landlords', {
        name: 'Lucy Landlord',
        kind: 'INDIVIDUAL',
        phone: '0700000501',
        email: 'lucy@example.invalid',
      })
    ).data;
    const p = (
      await post(agency, '/properties', { name: 'Lucy Court', code: 'LUC', landlordId: lucy.id })
    ).data;
    await post(agency, '/units/bulk', {
      propertyId: p.id,
      numbers: ['L1', 'L2'],
      rentAmount: KES(20000),
    });
    const units = (await get(agency, `/units?propertyId=${p.id}`)).data as {
      id: string;
      number: string;
    }[];
    await post(agency, '/charge-types', {
      propertyId: p.id,
      name: 'Garbage',
      kind: 'FIXED',
      amount: KES(500),
    });
    const ag = (
      await post(agency, '/agreements', {
        landlordId: lucy.id,
        commissionBasis: 'PERCENT_OF_COLLECTED',
        commissionBps: 1000,
        remittanceDay: 5,
        startDate: START,
        ...agreement,
      })
    ).data;
    const ty = (
      await post(agency, '/tenancies', {
        unitId: units[0]!.id,
        tenant: { firstName: 'Tom', lastName: 'Tenant', phone: '0711000601' },
        startDate: RUN_DATE,
        billingDay: 1,
      })
    ).data;
    const { invoiceIds } = (await post(agency, '/invoices/run', { date: RUN_DATE }, 200)).data; // 20,000 rent + 500 garbage
    const cash = (await post(agency, '/payment-channels', { kind: 'CASH', name: 'Cash' })).data;
    return {
      lucy,
      p,
      units,
      ag,
      ty,
      tenantId: ty.tenant.id as string,
      invoiceId: invoiceIds[0] as string,
      cash,
    };
  }

  const pay = (x: { tenantId: string; cash: { id: string } }, amount: number) =>
    post(agency, '/payments', {
      tenantId: x.tenantId,
      channelId: x.cash.id,
      amount,
      receivedAt: TODAY,
      notifyTenant: false,
    });
  const ledger = async (landlordId: string) =>
    (await get(agency, `/landlords/${landlordId}/ledger?pageSize=100`)).data as {
      kind: string;
      bucket: string;
      amount: number;
      memo: string | null;
    }[];
  const account = async (landlordId: string) =>
    (await get(agency, `/landlords/${landlordId}/account`)).data;

  it('collections and 10% commission on rent only; charges pass through; reversals mirror', async () => {
    const x = await setUp();
    await pay(x, KES(15000)); // all on rent (rent is paid first)
    let rows = await ledger(x.lucy.id);
    expect(rows.map((r) => [r.kind, r.amount]).reverse()).toEqual([
      ['COLLECTION', KES(15000)],
      ['COMMISSION', -KES(1500)],
    ]);
    const p2 = (await pay(x, KES(5500))).data; // 5,000 rent + 500 garbage (+ nothing left)
    expect((await account(x.lucy.id)).balances.payable).toBe(KES(20500 - 2000));
    await post(agency, `/payments/${p2.id}/reverse`, { reason: 'Bounced' }, 200);
    rows = await ledger(x.lucy.id);
    expect((await account(x.lucy.id)).balances.payable).toBe(KES(13500));
    expect(
      rows
        .filter((r) => r.kind === 'COMMISSION')
        .map((r) => r.amount)
        .sort((a, b) => a - b),
    ).toEqual([-KES(1500), -KES(500), KES(500)]);
    // A landlord organisation has no ledgers at all.
    expect((await get(landlordOrg, '/agreements', 403)).error.code).toBe('AGENCY_ONLY');
  });

  it('deposits are held for the landlord; using one at move-out turns it into a collection', async () => {
    const x = await setUp();
    await post(agency, '/move-in-charges', {
      propertyId: x.p.id,
      name: 'Deposit',
      kind: 'DEPOSIT',
      rentMonths: 1,
    });
    const ty = (
      await post(agency, '/tenancies', {
        unitId: x.units[1]!.id,
        tenant: { firstName: 'Dee', lastName: 'D', phone: '0711000602' },
        startDate: RUN_DATE,
        billingDay: 1,
      })
    ).data;
    await post(agency, '/payments', {
      tenantId: ty.tenant.id,
      channelId: x.cash.id,
      amount: KES(20000),
      receivedAt: TODAY,
      notifyTenant: false,
    });
    expect((await account(x.lucy.id)).balances).toEqual({ payable: 0, depositHeld: KES(20000) });
    await post(agency, '/invoices/run', { date: RUN_DATE }, 200); // Dee's month: 20,000 rent + 500 garbage
    await post(agency, `/tenancies/${ty.id}/move-out`, { endDate: TODAY }, 200);
    await post(agency, `/tenancies/${ty.id}/deposit/settle`, { applyAmount: KES(20000) }, 200); // pays the rent invoice
    expect((await account(x.lucy.id)).balances).toEqual({ payable: KES(18000), depositHeld: 0 });
  });

  it('deductible expenses reduce the payout; voiding gives it back', async () => {
    const x = await setUp();
    const e = (
      await post(agency, '/expenses', {
        propertyId: x.p.id,
        category: 'REPAIRS',
        name: 'Roof',
        amount: KES(3000),
        incurredOn: TODAY,
      })
    ).data;
    expect((await account(x.lucy.id)).balances.payable).toBe(-KES(3000));
    await patch(agency, `/expenses/${e.id}`, { amount: KES(2000) });
    expect((await account(x.lucy.id)).balances.payable).toBe(-KES(2000));
    await post(agency, `/expenses/${e.id}/void`, { reason: 'Agency’s own cost' }, 200);
    expect((await account(x.lucy.id)).balances.payable).toBe(0);
  });

  it('other bases: invoiced-basis commission at issue (and back on void); landlord collects → landlord owes the agency', async () => {
    const x = await setUp({
      commissionBasis: 'PERCENT_OF_INVOICED',
      collection: 'LANDLORD_COLLECTS',
    });
    let rows = await ledger(x.lucy.id);
    expect(rows.map((r) => [r.kind, r.amount])).toEqual([['COMMISSION', -KES(2000)]]); // 10% of rent at issue
    await pay(x, KES(20500));
    expect((await account(x.lucy.id)).balances.payable).toBe(-KES(2000)); // collections net to zero
    await post(
      agency,
      `/payments/${(await get(agency, '/payments')).data[0].id}/reverse`,
      { reason: 'Mistake' },
      200,
    );
    await post(agency, `/invoices/${x.invoiceId}/void`, { reason: 'Wrong month' }, 200);
    rows = await ledger(x.lucy.id);
    expect((await account(x.lucy.id)).balances.payable).toBe(0);
    const draft = (await post(agency, '/remittances', { landlordId: x.lucy.id, period: PERIOD }))
      .data;
    expect(draft).toMatchObject({ direction: 'TO_LANDLORD', net: 0 });
  });

  it('agreements can’t overlap and can’t change terms once used', async () => {
    const x = await setUp();
    const clash = await post(
      agency,
      '/agreements',
      {
        landlordId: x.lucy.id,
        commissionBasis: 'FIXED_MONTHLY',
        fixedAmount: KES(5000),
        remittanceDay: 1,
        startDate: TODAY,
      },
      409,
    );
    expect(clash.error.code).toBe('AGREEMENT_OVERLAP');
    await pay(x, KES(100));
    expect(
      (await patch(agency, `/agreements/${x.ag.id}`, { commissionBps: 800 }, 409)).error.code,
    ).toBe('AGREEMENT_IN_USE');
    const yesterday = formatDateOnly(addDays(parseDateOnly(TODAY), -1));
    await patch(agency, `/agreements/${x.ag.id}`, { endDate: yesterday });
    const fixed = (
      await post(agency, '/agreements', {
        landlordId: x.lucy.id,
        commissionBasis: 'FIXED_MONTHLY',
        fixedAmount: KES(5000),
        remittanceDay: 1,
        startDate: TODAY,
      })
    ).data;
    expect(fixed.active).toBe(true);
    const draft = (await post(agency, '/remittances', { landlordId: x.lucy.id, period: PERIOD }))
      .data;
    expect(draft.commission).toBe(KES(10) + KES(5000)); // 10% of 100 + the fixed monthly fee
  });

  it('remittances: draft, approval by someone else, payment brings the balance to zero', async () => {
    const x = await setUp();
    await pay(x, KES(20500)); // 20,500 collected, 2,000 commission
    const header = await stepUp(t, agency, OWNER.phone);
    await put(
      agency,
      `/landlords/${x.lucy.id}/payout`,
      {
        method: 'BANK',
        bankName: 'Test Bank',
        accountName: 'Lucy Landlord',
        accountNumber: '000123456789',
      },
      200,
      { 'X-Step-Up': header },
    );
    const acc = await account(x.lucy.id);
    expect(acc.payout).toMatchObject({ method: 'BANK', masked: 'Test Bank •••• 6789' });
    expect(
      outbox.some((m) => m.to === '+254700000501' && m.text.includes('Test Bank •••• 6789')),
    ).toBe(true);
    expect(JSON.stringify(await t.prisma.auditLog.findMany())).not.toContain('000123456789');

    const r = (await post(agency, '/remittances', { landlordId: x.lucy.id, period: PERIOD })).data;
    expect(r).toMatchObject({
      number: `REM-${PERIOD.slice(0, 4)}-000001`,
      direction: 'TO_LANDLORD',
      collections: KES(20500),
      commission: KES(2000),
      net: KES(18500),
      status: 'DRAFT',
    });
    expect(
      (await post(agency, '/remittances', { landlordId: x.lucy.id, period: PERIOD }, 409)).error
        .code,
    ).toBe('REMITTANCE_EXISTS');
    expect((await post(agency, `/remittances/${r.id}/approve`, {}, 409)).error.code).toBe(
      'SAME_PERSON',
    );
    await post(agency, `/remittances/${r.id}/pay`, { method: 'BANK', reference: 'FT0001' }, 409); // not approved yet

    // Managers can't approve by default: a custom approver role.
    const approverRole = (
      await post(
        agency,
        '/roles',
        {
          name: 'Approver',
          permissions: ['remittances:view', 'remittances:approve', 'remittances:pay'],
        },
        201,
        { 'X-Step-Up': header },
      )
    ).data;
    await post(
      agency,
      '/users/invitations',
      {
        firstName: 'Abe',
        lastName: 'Approver',
        email: 'abe@example.invalid',
        roleId: approverRole.id,
      },
      201,
    );
    const abe = await acceptInvite(t, 'abe@example.invalid');
    const approved = (await post(abe, `/remittances/${r.id}/approve`, {}, 200)).data;
    expect(approved).toMatchObject({ status: 'APPROVED', approvedBy: { id: abe.body.user.id } });
    const paid = (
      await post(abe, `/remittances/${r.id}/pay`, { method: 'BANK', reference: 'FT0001' }, 200)
    ).data;
    expect(paid).toMatchObject({ status: 'PAID', payoutMasked: 'Test Bank •••• 6789' });
    expect((await account(x.lucy.id)).balances.payable).toBe(0);

    const st = (await get(agency, `/landlords/${x.lucy.id}/statement?from=${PERIOD}&to=${PERIOD}`))
      .data;
    expect(st.totals).toMatchObject({
      collections: KES(20500),
      commission: KES(2000),
      remittances: KES(18500),
    });
    expect(st.closing.payable).toBe(0);
    const pdf = await t
      .http()
      .get(`/api/v1/landlords/${x.lucy.id}/statement/pdf`)
      .set(auth(agency))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    // Adjustments need a fresh code.
    expect(
      (
        await post(
          agency,
          `/landlords/${x.lucy.id}/ledger/adjustments`,
          { bucket: 'PAYABLE', amount: KES(100), memo: 'Opening balance' },
          403,
        )
      ).error.code,
    ).toBe('STEP_UP_REQUIRED');
  });

  it('owner portal: the landlord signs in with a code and sees only their own figures', async () => {
    const x = await setUp();
    await pay(x, KES(20500));
    const other = (
      await post(agency, '/landlords', {
        name: 'Other Owner',
        kind: 'INDIVIDUAL',
        phone: '0700000502',
      })
    ).data;
    const acc = (await post(agency, `/landlords/${x.lucy.id}/portal-access`, {}, 200)).data;
    expect(acc.portal.hasAccess).toBe(true);
    expect(outbox.some((m) => m.to === '+254700000501' && m.text.includes('/owner'))).toBe(true);

    await t.http().post('/api/v1/auth/otp/request').send({ phone: '0700000501' }).expect(202);
    const res = await t
      .http()
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '0700000501', code: lastCode('+254700000501') })
      .expect(200);
    const lucy: Session = {
      token: res.body.data.accessToken,
      refreshCookie: null,
      body: res.body.data,
    };
    expect(res.body.data).toMatchObject({
      activeOrganization: null,
      organizations: [],
      ownerOf: [{ landlordId: x.lucy.id, organization: { name: 'Prime Agency' } }],
    });

    const mine = (await get(lucy, '/owner/landlords')).data;
    expect(mine).toHaveLength(1);
    const overview = (await get(lucy, `/owner/landlords/${x.lucy.id}`)).data;
    expect(overview.balances.payable).toBe(KES(18500));
    expect(overview.occupancy.totals).toMatchObject({ units: 2, occupied: 1 });
    expect(
      (await get(lucy, `/owner/landlords/${x.lucy.id}/statement`)).data.totals.collections,
    ).toBe(KES(20500));
    await get(lucy, `/owner/landlords/${other.id}`, 404);
    // No staff access whatsoever.
    await get(lucy, '/landlords', 403);
    await get(lucy, `/landlords/${x.lucy.id}/ledger`, 403);

    await del(agency, `/landlords/${x.lucy.id}/portal-access`);
    await get(lucy, `/owner/landlords/${x.lucy.id}`, 404);
  });

  it('property-limited staff and other organisations can’t see other landlords’ money', async () => {
    const x = await setUp();
    const otherLl = (
      await post(agency, '/landlords', {
        name: 'Mo Owner',
        kind: 'INDIVIDUAL',
        phone: '0700000503',
      })
    ).data;
    const op = (
      await post(agency, '/properties', { name: 'Mo Place', code: 'MOP', landlordId: otherLl.id })
    ).data;
    const role = await roleId(t, agency, 'ACCOUNTANT');
    await post(
      agency,
      '/users/invitations',
      {
        firstName: 'L',
        lastName: 'A',
        email: 'la@example.invalid',
        roleId: role,
        propertyIds: [op.id],
      },
      201,
    );
    const limited = await acceptInvite(t, 'la@example.invalid');
    await get(limited, `/landlords/${x.lucy.id}/ledger`, 404);
    await get(limited, `/landlords/${x.lucy.id}/statement`, 404);
    expect((await get(limited, '/agreements')).data).toHaveLength(0);
    const admin = await login(t, 'admin@example.invalid');
    const { owner: agency2 } = await onboardOrg(t, admin, {
      name: 'Agency 2',
      kind: 'AGENCY',
      ownerEmail: 'a2@example.invalid',
      ownerPhone: '+254700000092',
    });
    await get(agency2, `/landlords/${x.lucy.id}/account`, 404);
    await post(agency2, '/remittances', { landlordId: x.lucy.id, period: PERIOD }, 404);
    expect((await get(agency2, '/remittances')).data).toHaveLength(0);
  });
});
