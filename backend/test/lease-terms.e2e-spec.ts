import { formatDateOnly, parseDateOnly } from '../src/common/dates/date-only.js';
import { addDays, periodOf, todayInNairobi } from '../src/modules/billing/billing-math.js';
import { outbox } from '../src/modules/notifications/senders.js';
import { nextPeriod } from '../src/modules/portfolio/tenancies/rent-changes.js';
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
const NEXT = nextPeriod(PERIOD);
const RUN_DATE = `${PERIOD}-01`;
const LAST_PERIOD = periodOf(formatDateOnly(addDays(parseDateOnly(RUN_DATE), -1)));
const LAST_MONTH_RUN = `${LAST_PERIOD}-01`;
const inDays = (n: number) => formatDateOnly(addDays(parseDateOnly(TODAY), n));
const KES = (major: number) => major * 100;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (p: string) => `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;

type Res = { status: number; body: any };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('Lease terms and rent changes (e2e)', () => {
  let t: TestApp;
  let owner: Session;
  const req =
    (method: 'get' | 'post' | 'patch' | 'delete') =>
    async (s: Session, path: string, body: object = {}, status = method === 'post' ? 201 : 200) =>
      check(await t.http()[method](`/api/v1${path}`).set(auth(s)).send(body), status);
  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);
  const post = req('post');
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
    ({ owner } = await onboardOrg(t, admin, {
      name: 'Lease Org',
      ownerEmail: 'lease-owner@example.invalid',
      ownerPhone: '+254700000071',
    }));
  });

  async function moveIn(leaseEndDate?: string) {
    const p = (await post(owner, '/properties', { name: 'Lease Court', code: 'LSE' })).data;
    const u = (
      await post(owner, '/units', { propertyId: p.id, number: 'S1', rentAmount: KES(20000) })
    ).data;
    return (
      await post(owner, '/tenancies', {
        unitId: u.id,
        tenant: { firstName: 'Sam', lastName: 'Tenant', phone: '0711000901' },
        startDate: LAST_MONTH_RUN,
        billingDay: 1,
        ...(leaseEndDate ? { leaseEndDate } : {}),
      })
    ).data;
  }

  it('schedules a rent change for a month not yet billed, and the run applies it', async () => {
    const ty = await moveIn(inDays(45));
    expect(ty.leaseEndDate).toBe(inDays(45));
    await post(owner, '/invoices/run', { date: LAST_MONTH_RUN }, 200);

    // This month is already invoiced: refused with a clear way forward.
    const refused = await post(
      owner,
      `/tenancies/${ty.id}/rent-changes`,
      { newRent: KES(30000), effectivePeriod: LAST_PERIOD },
      409,
    );
    expect(refused.error.code).toBe('ALREADY_BILLED');
    expect(refused.error.message).toBe(
      `Rent for ${label(LAST_PERIOD)} is already invoiced — choose ${label(PERIOD)} or later.`,
    );

    const outboxBefore = outbox.length;
    const scheduled = (
      await post(owner, `/tenancies/${ty.id}/rent-changes`, {
        newRent: KES(30000),
        effectivePeriod: PERIOD,
        note: 'Annual review',
        notifyTenant: true,
      })
    ).data;
    expect(scheduled.rentAmount).toBe(KES(20000));
    expect(scheduled.rentChanges).toEqual([
      expect.objectContaining({
        effectivePeriod: PERIOD,
        newRent: KES(30000),
        note: 'Annual review',
      }),
    ]);
    const sms = outbox.slice(outboxBefore).find((m) => m.to === '+254711000901');
    expect(sms?.text).toBe(
      `Hi Sam, your rent for S1 changes from KES 20,000 to KES 30,000 from ${label(PERIOD)}. Lease Org`,
    );
    // Only one change per month.
    expect(
      (
        await post(
          owner,
          `/tenancies/${ty.id}/rent-changes`,
          { newRent: KES(31000), effectivePeriod: PERIOD },
          409,
        )
      ).error.code,
    ).toBe('RENT_CHANGE_EXISTS');

    // The preview for this month already shows the new rent, without applying it.
    const preview = (await get(owner, `/invoices/run/preview?date=${RUN_DATE}`)).data;
    expect(preview.items.find((i: { tenancyId: string }) => i.tenancyId === ty.id).total).toBe(
      KES(30000),
    );
    expect((await get(owner, `/tenancies/${ty.id}`)).data.rentAmount).toBe(KES(20000));

    await post(owner, '/invoices/run', { date: RUN_DATE }, 200);
    const after = (await get(owner, `/tenancies/${ty.id}`)).data;
    expect(after.rentAmount).toBe(KES(30000));
    expect(after.rentChanges).toEqual([]);
    const next = (await get(owner, `/invoices?tenancyId=${ty.id}&period=${PERIOD}&kind=MONTHLY`))
      .data;
    expect(next[0].total).toBe(KES(30000));
    // An applied change can't be cancelled.
    const applied = await t.prisma.rentChange.findFirstOrThrow({ where: { tenancyId: ty.id } });
    expect(
      (await del(owner, `/tenancies/${ty.id}/rent-changes/${applied.id}`, {}, 409)).error.code,
    ).toBe('RENT_CHANGE_APPLIED');
  });

  it('cancels an unapplied change', async () => {
    const ty = await moveIn();
    const s = (
      await post(owner, `/tenancies/${ty.id}/rent-changes`, {
        newRent: KES(25000),
        effectivePeriod: NEXT,
      })
    ).data;
    const id = s.rentChanges[0].id;
    await del(owner, `/tenancies/${ty.id}/rent-changes/${id}`, {}, 204);
    expect((await get(owner, `/tenancies/${ty.id}`)).data.rentChanges).toEqual([]);
  });

  it('refuses renewals and rent changes while the tenant is under notice', async () => {
    const ty = await moveIn(inDays(45));
    await post(owner, `/tenancies/${ty.id}/notice`, { endDate: inDays(20) }, 200);
    const change = await post(
      owner,
      `/tenancies/${ty.id}/rent-changes`,
      { newRent: KES(25000), effectivePeriod: NEXT },
      409,
    );
    expect(change.error.code).toBe('UNDER_NOTICE');
    expect(change.error.message).toBe(
      'This tenant is under notice. Withdraw the notice first to renew the lease or change the rent.',
    );
    expect(
      (await post(owner, `/tenancies/${ty.id}/renew`, { leaseEndDate: inDays(400) }, 409)).error
        .code,
    ).toBe('UNDER_NOTICE');
  });

  it('lists expiring leases, renews them, and flags them on the dashboard', async () => {
    const ty = await moveIn(inDays(45));
    expect(
      (await get(owner, '/tenancies?expiring=60')).data.map((r: { id: string }) => r.id),
    ).toEqual([ty.id]);
    expect((await get(owner, '/tenancies?expiring=30')).data).toEqual([]);
    expect((await get(owner, '/reports/dashboard')).data.actions).toContainEqual({
      kind: 'LEASES_EXPIRING',
      count: 1,
    });

    // A lease end before the start is refused.
    await post(owner, `/tenancies/${ty.id}/renew`, { leaseEndDate: '2020-01-01' }, 422);

    const renewed = (
      await post(
        owner,
        `/tenancies/${ty.id}/renew`,
        {
          leaseEndDate: inDays(400),
          newRent: KES(22000),
          effectivePeriod: NEXT,
        },
        200,
      )
    ).data;
    expect(renewed.leaseEndDate).toBe(inDays(400));
    expect(renewed.rentChanges).toEqual([
      expect.objectContaining({ effectivePeriod: NEXT, newRent: KES(22000) }),
    ]);
    expect((await get(owner, '/tenancies?expiring=60')).data).toEqual([]);
    expect(
      (await get(owner, '/reports/dashboard')).data.actions.map((a: { kind: string }) => a.kind),
    ).not.toContain('LEASES_EXPIRING');

    // The lease end can also be edited directly, and cleared.
    expect(
      (await patch(owner, `/tenancies/${ty.id}`, { leaseEndDate: null })).data.leaseEndDate,
    ).toBeNull();
  });
});
