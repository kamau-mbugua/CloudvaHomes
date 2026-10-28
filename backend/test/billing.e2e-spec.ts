import { addDays, periodOf, todayInNairobi } from '../src/modules/billing/billing-math.js';
import { formatDateOnly, parseDateOnly } from '../src/common/dates/date-only.js';
import { JobTokenVerifier } from '../src/modules/jobs/job-auth.js';
import {
  acceptInvite,
  auth,
  createPlatformAdmin,
  createTestApp,
  login,
  onboardOrg,
  resetDb,
  roleId,
  type Session,
  type TestApp,
} from './helpers.js';

// Dates relative to the real clock: the run refuses future dates.
const TODAY = todayInNairobi();
const PERIOD = periodOf(TODAY);
const RUN_DATE = `${PERIOD}-01`; // billing day 1 has always come by today
const LAST_MONTH = periodOf(formatDateOnly(addDays(parseDateOnly(RUN_DATE), -1)));
const STARTED = `${LAST_MONTH}-01`;
const NEXT_MONTH = formatDateOnly(addDays(parseDateOnly(RUN_DATE), 40));
const YEAR = TODAY.slice(0, 4);
const KES = (major: number) => major * 100;

type Body = { status: number; body: any };
const check = (res: Body, status: number) => {
  if (res.status !== status) {
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body;
};

function client(t: TestApp) {
  return {
    post: async (s: Session, path: string, body: object, status = 200) =>
      check(await t.http().post(`/api/v1${path}`).set(auth(s)).send(body), status),
    put: async (s: Session, path: string, body: object, status = 200) =>
      check(await t.http().put(`/api/v1${path}`).set(auth(s)).send(body), status),
    get: async (s: Session, path: string, status = 200) =>
      check(await t.http().get(`/api/v1${path}`).set(auth(s)), status),
    patch: async (s: Session, path: string, body: object, status = 200) =>
      check(await t.http().patch(`/api/v1${path}`).set(auth(s)).send(body), status),
    del: async (s: Session, path: string, status = 204) =>
      check(await t.http().delete(`/api/v1${path}`).set(auth(s)), status),
  };
}

/** A landlord-org property with three units, charges, meters and tenancies. */
async function setUpBilling(t: TestApp, owner: Session, code = 'BIL', phones = '07110001') {
  const { post, put, get } = client(t);
  const p = (await post(owner, '/properties', { name: `Block ${code}`, code }, 201)).data;
  await post(
    owner,
    '/units/bulk',
    { propertyId: p.id, numbers: ['U1', 'U2', 'U3'], rentAmount: KES(20000) },
    201,
  );
  const units = (await get(owner, `/units?propertyId=${p.id}`)).data as {
    id: string;
    number: string;
  }[];
  const [u1, u2, u3] = units;
  const garbage = (
    await post(
      owner,
      '/charge-types',
      { propertyId: p.id, name: 'Garbage', kind: 'FIXED', amount: KES(300) },
      201,
    )
  ).data;
  const power = (
    await post(
      owner,
      '/charge-types',
      { propertyId: p.id, name: 'Electricity', kind: 'VARIABLE' },
      201,
    )
  ).data;
  const water = (
    await post(
      owner,
      '/charge-types',
      { propertyId: p.id, name: 'Water', kind: 'METERED', unitRate: KES(150), unitLabel: 'm³' },
      201,
    )
  ).data;
  const parking = (
    await post(
      owner,
      '/charge-types',
      { propertyId: p.id, name: 'Parking', kind: 'FIXED', amount: KES(1000), unitIds: [u3!.id] },
      201,
    )
  ).data;
  const m1 = (
    await post(
      owner,
      '/meters',
      { unitId: u1!.id, chargeTypeId: water.id, serialNo: `${code}-W1`, initialReading: '100' },
      201,
    )
  ).data;
  const m2 = (
    await post(
      owner,
      '/meters',
      { unitId: u2!.id, chargeTypeId: water.id, serialNo: `${code}-W2` },
      201,
    )
  ).data;
  await put(owner, '/meter-readings', {
    period: PERIOD,
    readings: [{ meterId: m1.id, current: '112.5' }],
  });
  await put(owner, '/charge-entries', {
    chargeTypeId: power.id,
    period: PERIOD,
    entries: [{ unitId: u1!.id, amount: KES(450) }],
  });

  const tenancy = async (unitId: string, phone: string, startDate: string) =>
    (
      await post(
        owner,
        '/tenancies',
        {
          unitId,
          tenant: { firstName: 'Ten', lastName: phone.slice(-2), phone },
          startDate,
          billingDay: 1,
        },
        201,
      )
    ).data;
  const t1 = await tenancy(u1!.id, `${phones}01`, STARTED);
  const t2 = await tenancy(u2!.id, `${phones}02`, STARTED);
  const t3 = await tenancy(u3!.id, `${phones}03`, NEXT_MONTH); // not started: not billed
  return { p, u1: u1!, u2: u2!, u3: u3!, garbage, power, water, parking, m1, m2, t1, t2, t3 };
}

describe('Billing (e2e)', () => {
  let t: TestApp;
  let owner: Session;
  let other: Session;
  let admin: Session;
  let api: ReturnType<typeof client>;

  beforeAll(async () => {
    t = await createTestApp();
    api = client(t);
  });
  afterAll(async () => t?.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    admin = await login(t, 'admin@example.invalid');
    ({ owner } = await onboardOrg(t, admin, {
      name: 'Org',
      ownerEmail: 'o@example.invalid',
      ownerPhone: '+254700000070',
    }));
    ({ owner: other } = await onboardOrg(t, admin, {
      name: 'Other',
      ownerEmail: 'x@example.invalid',
      ownerPhone: '+254700000080',
    }));
  });

  it('the run bills rent and every kind of charge, once, and locks what it used', async () => {
    const s = await setUpBilling(t, owner);
    const { get, post, put, del } = api;

    const preview = (await get(owner, `/invoices/run/preview?date=${RUN_DATE}`)).data;
    expect(preview.period).toBe(PERIOD);
    expect(preview.items.map((i: { unit: { number: string } }) => i.unit.number)).toEqual([
      'U1',
      'U2',
    ]);
    const [p1, p2] = preview.items;
    expect(
      p1.lines.map((l: { description: string; amount: number }) => [
        l.description.split(' — ')[0],
        l.amount,
      ]),
    ).toEqual([
      ['Rent', KES(20000)],
      ['Electricity', KES(450)],
      ['Garbage', KES(300)],
      ['Water', KES(1875)], // 12.5 m³ × KES 150
    ]);
    expect(p1.lines[3]).toMatchObject({ quantity: '12.500', unitAmount: KES(150) });
    expect(p1.total).toBe(KES(22625));
    expect(p2.total).toBe(KES(20300)); // no Parking: that's U3 only
    expect(p2.missingReadings).toEqual([
      { meterId: s.m2.id, serialNo: 'BIL-W2', chargeName: 'Water' },
    ]);
    expect(await t.prisma.invoice.count()).toBe(0); // preview writes nothing

    const run = (await post(owner, '/invoices/run', { date: RUN_DATE })).data;
    expect(run.created).toBe(2);
    expect((await post(owner, '/invoices/run', { date: RUN_DATE })).data.created).toBe(0);
    expect((await post(owner, '/invoices/run', {})).data.created).toBe(0); // today: same month

    const list = await get(owner, `/invoices?tenancyId=${s.t1.id}`);
    expect(list.meta.total).toBe(1);
    const inv = (await get(owner, `/invoices/${list.data[0].id}`)).data;
    expect(inv).toMatchObject({
      number: `INV-${YEAR}-000001`,
      kind: 'MONTHLY',
      period: PERIOD,
      status: 'ISSUED',
      issueDate: RUN_DATE,
      dueDate: formatDateOnly(addDays(parseDateOnly(RUN_DATE), 7)),
      total: KES(22625),
      balance: KES(22625),
      tenant: { phone: '+254711000101' },
      unit: { number: 'U1' },
    });
    expect(inv.lines).toHaveLength(4);

    // Billed inputs are locked…
    const locked = await put(
      owner,
      '/meter-readings',
      { period: PERIOD, readings: [{ meterId: s.m1.id, current: '115' }] },
      409,
    );
    expect(locked.error.code).toBe('ALREADY_BILLED');
    await put(
      owner,
      '/charge-entries',
      { chargeTypeId: s.power.id, period: PERIOD, entries: [{ unitId: s.u1.id, amount: 1 }] },
      409,
    );
    const sheet = (
      await get(
        owner,
        `/meter-readings/sheet?propertyId=${s.p.id}&chargeTypeId=${s.water.id}&period=${PERIOD}`,
      )
    ).data;
    expect(sheet[0].reading).toMatchObject({
      previous: '100.000',
      current: '112.500',
      consumption: '12.500',
      amount: KES(1875),
      billed: true,
    });
    expect(sheet[1]).toMatchObject({ suggestedPrevious: '0.000', reading: null });
    // …and the tenancy can't be deleted any more.
    expect((await del(owner, `/tenancies/${s.t1.id}`, 409)).error.code).toBe('TENANCY_INVOICED');
    expect((await del(owner, `/charge-types/${s.water.id}`, 409)).error.code).toBe('IN_USE');

    // Void → inputs unlock → corrected reading → the run bills the month again.
    const voided = (await post(owner, `/invoices/${inv.id}/void`, { reason: 'Wrong reading' }))
      .data;
    expect(voided).toMatchObject({ status: 'VOID', balance: 0, voidReason: 'Wrong reading' });
    await post(owner, `/invoices/${inv.id}/void`, { reason: 'Again' }, 409);
    await put(owner, '/meter-readings', {
      period: PERIOD,
      readings: [{ meterId: s.m1.id, current: '110' }],
    });
    const rerun = (await post(owner, '/invoices/run', { date: RUN_DATE })).data;
    expect(rerun.created).toBe(1);
    const fresh = (await get(owner, `/invoices/${rerun.invoiceIds[0]}`)).data;
    expect(fresh).toMatchObject({
      number: `INV-${YEAR}-000003`,
      total: KES(20000 + 450 + 300 + 1500),
    });

    const actions = (await t.prisma.auditLog.findMany({ where: { entity: 'invoice' } })).map(
      (a) => a.action,
    );
    expect(actions.filter((a) => a === 'invoice.issue')).toHaveLength(3);
    expect(actions).toContain('invoice.void');
    // The scheduled-looking run records the person who pressed the button.
    expect(await t.prisma.invoice.count({ where: { createdById: owner.body.user.id } })).toBe(3);
  });

  it('credit notes reduce the balance; credited or paid invoices can’t be voided', async () => {
    await setUpBilling(t, owner);
    const { get, post } = api;
    const { invoiceIds } = (await post(owner, '/invoices/run', { date: RUN_DATE })).data;
    const id = invoiceIds[1]; // U2: KES 20,300
    const tooMuch = await post(
      owner,
      `/invoices/${id}/credit-notes`,
      { amount: KES(20301), reason: 'Too much' },
      422,
    );
    expect(tooMuch.error.details[0].field).toBe('amount');
    const part = (
      await post(owner, `/invoices/${id}/credit-notes`, {
        amount: KES(300),
        reason: 'Garbage waived',
      })
    ).data;
    expect(part).toMatchObject({
      status: 'PARTIALLY_PAID',
      creditedAmount: KES(300),
      balance: KES(20000),
    });
    expect(part.creditNotes[0]).toMatchObject({
      number: `CN-${YEAR}-000001`,
      reason: 'Garbage waived',
    });
    expect((await post(owner, `/invoices/${id}/void`, { reason: 'Nope' }, 409)).error.code).toBe(
      'INVOICE_SETTLED',
    );
    const full = (
      await post(owner, `/invoices/${id}/credit-notes`, {
        amount: KES(20000),
        reason: 'Rent waived',
      })
    ).data;
    expect(full).toMatchObject({ status: 'PAID', balance: 0 });
    await post(owner, `/invoices/${id}/credit-notes`, { amount: 1, reason: 'More' }, 422);

    const pdf = await t
      .http()
      .get(`/api/v1/invoices/${id}/pdf`)
      .set(auth(owner))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(await get(owner, `/invoices?status=PAID`)).toMatchObject({ meta: { total: 1 } });
  });

  it('one-off invoices, overdue filter and due-day setting', async () => {
    const s = await setUpBilling(t, owner);
    const { get, post, patch } = api;
    await patch(owner, '/organization', { invoiceDueDays: 14 });
    const adhoc = (
      await post(
        owner,
        '/invoices',
        {
          tenancyId: s.t1.id,
          lines: [{ description: 'Replacement key', amount: KES(800) }],
          dueDate: STARTED,
        },
        201,
      )
    ).data;
    expect(adhoc).toMatchObject({
      kind: 'ADHOC',
      total: KES(800),
      dueDate: STARTED,
      overdue: true,
    });
    expect(adhoc.lines[0]).toMatchObject({ kind: 'ADJUSTMENT', description: 'Replacement key' });
    const { invoiceIds } = (await post(owner, '/invoices/run', { date: RUN_DATE })).data;
    const monthly = (await get(owner, `/invoices/${invoiceIds[0]}`)).data;
    expect(monthly.dueDate).toBe(formatDateOnly(addDays(parseDateOnly(RUN_DATE), 14)));
    const overdue = await get(owner, '/invoices?overdue=true');
    expect(overdue.data.map((i: { id: string }) => i.id)).toContain(adhoc.id);
    await post(
      owner,
      '/invoices/run',
      { date: formatDateOnly(addDays(parseDateOnly(TODAY), 1)) },
      422,
    );
  });

  it('move-in invoices: issued at move-in by default, once, and only with permission', async () => {
    const { post, get } = api;
    const p = (await post(owner, '/properties', { name: 'Move Block', code: 'MOV' }, 201)).data;
    await post(
      owner,
      '/units/bulk',
      { propertyId: p.id, numbers: ['M1', 'M2', 'M3', 'M4'], rentAmount: KES(10000) },
      201,
    );
    const [m1, m2, m3, m4] = (await get(owner, `/units?propertyId=${p.id}`)).data;
    // Exactly one of amount / rentMonths.
    await post(
      owner,
      '/move-in-charges',
      { propertyId: p.id, name: 'Bad', kind: 'FEE', amount: 1, rentMonths: 1 },
      422,
    );
    const noCharges = (
      await post(
        owner,
        '/tenancies',
        {
          unitId: m1.id,
          tenant: { firstName: 'A', lastName: 'B', phone: '0711000201' },
          startDate: STARTED,
        },
        201,
      )
    ).data;
    expect((await get(owner, `/invoices?tenancyId=${noCharges.id}`)).meta.total).toBe(0);
    expect(
      (await post(owner, `/tenancies/${noCharges.id}/move-in-invoice`, {}, 422)).error.code,
    ).toBe('NO_MOVE_IN_CHARGES');

    await post(
      owner,
      '/move-in-charges',
      { propertyId: p.id, name: 'Deposit', kind: 'DEPOSIT', rentMonths: 2 },
      201,
    );
    await post(
      owner,
      '/move-in-charges',
      { propertyId: p.id, name: 'Agreement fee', kind: 'FEE', amount: KES(500) },
      201,
    );
    const moved = (
      await post(
        owner,
        '/tenancies',
        {
          unitId: m2.id,
          tenant: { firstName: 'C', lastName: 'D', phone: '0711000202' },
          startDate: STARTED,
          rentAmount: KES(12000),
        },
        201,
      )
    ).data;
    const [mi] = (await get(owner, `/invoices?tenancyId=${moved.id}`)).data;
    const detail = (await get(owner, `/invoices/${mi.id}`)).data;
    expect(detail).toMatchObject({ kind: 'MOVE_IN', period: LAST_MONTH, total: KES(24000 + 500) });
    expect(
      detail.lines.map((l: { description: string; amount: number; refundable: boolean }) => [
        l.description,
        l.amount,
        l.refundable,
      ]),
    ).toEqual([
      ['Deposit (2 × monthly rent)', KES(24000), true],
      ['Agreement fee', KES(500), false],
    ]);
    expect((await post(owner, `/tenancies/${moved.id}/move-in-invoice`, {}, 409)).error.code).toBe(
      'ALREADY_INVOICED',
    );
    const later = (await post(owner, `/tenancies/${noCharges.id}/move-in-invoice`, {}, 201)).data;
    expect(later.total).toBe(KES(20000 + 500));

    // A caretaker can move people in but not invoice: default skips, asking explicitly is refused.
    const role = await roleId(t, owner, 'CARETAKER');
    await post(
      owner,
      '/users/invitations',
      { firstName: 'C', lastName: 'T', email: 'ct@example.invalid', roleId: role },
      201,
    );
    const ct = await acceptInvite(t, 'ct@example.invalid');
    await post(
      ct,
      '/tenancies',
      {
        unitId: m3.id,
        tenant: { firstName: 'E', lastName: 'F', phone: '0711000203' },
        startDate: STARTED,
        issueMoveInInvoice: true,
      },
      403,
    );
    const byCt = (
      await post(
        ct,
        '/tenancies',
        {
          unitId: m3.id,
          tenant: { firstName: 'E', lastName: 'F', phone: '0711000203' },
          startDate: STARTED,
        },
        201,
      )
    ).data;
    expect(await t.prisma.invoice.count({ where: { tenancyId: byCt.id } })).toBe(0);
    // And the owner can opt out.
    const optOut = (
      await post(
        owner,
        '/tenancies',
        {
          unitId: m4.id,
          tenant: { firstName: 'G', lastName: 'H', phone: '0711000204' },
          startDate: STARTED,
          issueMoveInInvoice: false,
        },
        201,
      )
    ).data;
    expect(await t.prisma.invoice.count({ where: { tenancyId: optOut.id } })).toBe(0);
  });

  it('validation rules for charges and readings', async () => {
    const s = await setUpBilling(t, owner);
    const { post, put } = api;
    expect(
      (await post(owner, '/charge-types', { propertyId: s.p.id, name: 'Svc', kind: 'FIXED' }, 422))
        .error.details[0].field,
    ).toBe('amount');
    expect(
      (
        await post(
          owner,
          '/charge-types',
          { propertyId: s.p.id, name: 'Garbage', kind: 'FIXED', amount: 1 },
          409,
        )
      ).error.code,
    ).toBe('NAME_TAKEN');
    const back = await put(
      owner,
      '/meter-readings',
      { period: LAST_MONTH, readings: [{ meterId: s.m1.id, current: '99' }] },
      422,
    );
    expect(back.error.details[0].field).toBe('readings[0].current');
    await put(
      owner,
      '/meter-readings',
      { period: PERIOD, readings: [{ meterId: s.m2.id, current: '1.2345' }] },
      422,
    );
    expect(
      (
        await post(
          owner,
          '/meters',
          { unitId: s.u3.id, chargeTypeId: s.water.id, serialNo: 'BIL-W1' },
          409,
        )
      ).error.code,
    ).toBe('SERIAL_TAKEN');
    await post(
      owner,
      '/meters',
      { unitId: s.u3.id, chargeTypeId: s.garbage.id, serialNo: 'X1' },
      422,
    ); // not metered
  });

  it('other organisations’ billing ids behave like missing ids', async () => {
    const s = await setUpBilling(t, owner);
    const { get, post, put, patch, del } = api;
    const { invoiceIds } = (await post(owner, '/invoices/run', { date: RUN_DATE })).data;
    const inv = invoiceIds[0];
    for (const path of [`/invoices/${inv}`, `/invoices/${inv}/pdf`]) await get(other, path, 404);
    await post(other, `/invoices/${inv}/void`, { reason: 'xxx' }, 404);
    await post(other, `/invoices/${inv}/credit-notes`, { amount: 1, reason: 'xxx' }, 404);
    await post(other, `/tenancies/${s.t1.id}/move-in-invoice`, {}, 404);
    await post(
      other,
      '/invoices',
      { tenancyId: s.t1.id, lines: [{ description: 'x', amount: 1 }] },
      404,
    );
    await patch(other, `/charge-types/${s.garbage.id}`, { name: 'x' }, 404);
    await del(other, `/charge-types/${s.garbage.id}`, 404);
    await patch(other, `/meters/${s.m1.id}`, { serialNo: 'x' }, 404);
    await del(other, `/meters/${s.m1.id}`, 404);
    await get(other, `/charge-entries?chargeTypeId=${s.power.id}&period=${PERIOD}`, 404);
    await put(
      other,
      '/charge-entries',
      { chargeTypeId: s.power.id, period: PERIOD, entries: [] },
      404,
    );
    await put(
      other,
      '/meter-readings',
      { period: PERIOD, readings: [{ meterId: s.m2.id, current: '5' }] },
      422,
    );
    await get(
      other,
      `/meter-readings/sheet?propertyId=${s.p.id}&chargeTypeId=${s.water.id}&period=${PERIOD}`,
      404,
    );
    const reading = await t.prisma.meterReading.findFirstOrThrow();
    await del(other, `/meter-readings/${reading.id}`, 404);
    for (const path of ['/invoices', '/charge-types', '/move-in-charges', '/meters']) {
      const res = await get(other, path);
      expect(res.data).toHaveLength(0);
    }
    expect((await get(other, `/invoices/run/preview?date=${RUN_DATE}`)).data.items).toHaveLength(0);
    expect((await post(other, '/invoices/run', { date: RUN_DATE })).data.created).toBe(0);
  });

  it('property-limited staff only bill and read their own properties', async () => {
    const a = await setUpBilling(t, owner, 'AAA');
    const b = await setUpBilling(t, owner, 'BBB', '07110002');
    const { get, post } = api;
    const role = await roleId(t, owner, 'ACCOUNTANT');
    await post(
      owner,
      '/users/invitations',
      {
        firstName: 'A',
        lastName: 'C',
        email: 'acc@example.invalid',
        roleId: role,
        propertyIds: [a.p.id],
      },
      201,
    );
    const acc = await acceptInvite(t, 'acc@example.invalid');
    const preview = (await get(acc, `/invoices/run/preview?date=${RUN_DATE}`)).data;
    expect(new Set(preview.items.map((i: { property: { id: string } }) => i.property.id))).toEqual(
      new Set([a.p.id]),
    );
    expect((await post(acc, '/invoices/run', { date: RUN_DATE })).data.created).toBe(2);
    const { invoiceIds } = (await post(owner, '/invoices/run', { date: RUN_DATE })).data;
    expect(invoiceIds).toHaveLength(2); // the other property's two
    await get(acc, `/invoices/${invoiceIds[0]}`, 404);
    expect((await get(acc, '/invoices')).meta.total).toBe(2);
    await get(
      acc,
      `/meter-readings/sheet?propertyId=${b.p.id}&chargeTypeId=${b.water.id}&period=${PERIOD}`,
      404,
    );
  });
});

describe('Scheduled invoice run (e2e)', () => {
  const INVOKER = 'scheduler@example.iam.gserviceaccount.com';

  it('is switched off (404) unless configured', async () => {
    const t = await createTestApp();
    try {
      await t.http().post('/api/v1/internal/jobs/invoice-run').send({}).expect(404);
    } finally {
      await t.close();
    }
  });

  it('accepts only the scheduler’s OIDC token, then bills every organisation', async () => {
    process.env.JOBS_OIDC_AUDIENCE = 'https://api.example.invalid';
    process.env.JOBS_INVOKER_EMAIL = INVOKER;
    const tokens: Record<string, string> = { good: INVOKER, wrong: 'someone@example.invalid' };
    const t = await createTestApp([], (b) =>
      b.overrideProvider(JobTokenVerifier).useValue({
        verify: async (token: string, audience: string) => {
          expect(audience).toBe('https://api.example.invalid');
          const email = tokens[token];
          if (!email) throw new Error('bad token');
          return email;
        },
      }),
    );
    try {
      await resetDb(t.prisma);
      await createPlatformAdmin(t.prisma);
      const admin = await login(t, 'admin@example.invalid');
      const { owner: o1 } = await onboardOrg(t, admin, {
        name: 'One',
        ownerEmail: 'one@example.invalid',
        ownerPhone: '+254700000090',
      });
      const { owner: o2 } = await onboardOrg(t, admin, {
        name: 'Two',
        ownerEmail: 'two@example.invalid',
        ownerPhone: '+254700000091',
      });
      await setUpBilling(t, o1, 'ONE');
      await setUpBilling(t, o2, 'TWO');

      const job = () => t.http().post('/api/v1/internal/jobs/invoice-run');
      await job().send({ date: RUN_DATE }).expect(401);
      await job().set('Authorization', 'Bearer forged').send({ date: RUN_DATE }).expect(401);
      await job().set('Authorization', 'Bearer wrong').send({ date: RUN_DATE }).expect(403);
      // A user's access token is not a scheduler token.
      await job().set(auth(o1)).send({ date: RUN_DATE }).expect(401);
      const res = await job()
        .set('Authorization', 'Bearer good')
        .send({ date: RUN_DATE })
        .expect(200);
      expect(res.body.data).toMatchObject({ organizations: 2, created: 4, failed: [] });
      const again = await job()
        .set('Authorization', 'Bearer good')
        .send({ date: RUN_DATE })
        .expect(200);
      expect(again.body.data.created).toBe(0);
      const invoices = await t.prisma.invoice.findMany({
        select: { orgId: true, createdById: true },
      });
      expect(new Set(invoices.map((i) => i.orgId)).size).toBe(2);
      expect(invoices.every((i) => i.createdById === null)).toBe(true);
    } finally {
      delete process.env.JOBS_OIDC_AUDIENCE;
      delete process.env.JOBS_INVOKER_EMAIL;
      await t.close();
    }
  });
});
