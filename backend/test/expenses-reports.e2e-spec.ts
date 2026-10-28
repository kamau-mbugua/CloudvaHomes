import { formatDateOnly, parseDateOnly } from '../src/common/dates/date-only.js';
import { addDays, periodOf, todayInNairobi } from '../src/modules/billing/billing-math.js';
import { ExpensesService } from '../src/modules/expenses/expenses.service.js';
import { UploadsService } from '../src/modules/files/uploads.service.js';
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

const TODAY = todayInNairobi();
const PERIOD = periodOf(TODAY);
const RUN_DATE = `${PERIOD}-01`;
const KES = (major: number) => major * 100;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const PDF = Buffer.from('%PDF-1.4\n%test\n');

type Res = { status: number; body: any; headers: Record<string, string>; text?: string };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('Expenses, files and reports (e2e)', () => {
  let t: TestApp;
  let owner: Session;
  let other: Session;

  const post = async (s: Session, path: string, body: object, status = 200) =>
    check(await t.http().post(`/api/v1${path}`).set(auth(s)).send(body), status);
  const put = async (s: Session, path: string, body: object, status = 200) =>
    check(await t.http().put(`/api/v1${path}`).set(auth(s)).send(body), status);
  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);
  const patch = async (s: Session, path: string, body: object, status = 200) =>
    check(await t.http().patch(`/api/v1${path}`).set(auth(s)).send(body), status);
  const upload = (s: Session, data: Buffer, purpose = 'EXPENSE_RECEIPT', name = 'receipt.png') =>
    t
      .http()
      .post('/api/v1/uploads')
      .set(auth(s))
      .field('purpose', purpose)
      .attach('file', data, name);
  const raw = (s: Session, path: string) =>
    t
      .http()
      .get(`/api/v1${path}`)
      .set(auth(s))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    const admin = await login(t, 'admin@example.invalid');
    ({ owner } = await onboardOrg(t, admin, {
      name: 'Exp Org',
      ownerEmail: 'e@example.invalid',
      ownerPhone: '+254700000081',
    }));
    ({ owner: other } = await onboardOrg(t, admin, {
      name: 'Other',
      ownerEmail: 'f@example.invalid',
      ownerPhone: '+254700000082',
    }));
  });

  const property = async (s: Session, code: string) =>
    (await post(s, '/properties', { name: `Block ${code}`, code }, 201)).data;

  it('uploads are type-checked, attached once, and served only to people who may see the record', async () => {
    const p = await property(owner, 'EXP');
    expect(
      (
        await upload(
          owner,
          Buffer.from('MZ\x90\x00 not really a picture'),
          'EXPENSE_RECEIPT',
          'evil.png',
        )
      ).status,
    ).toBe(415);
    const big = await upload(
      owner,
      Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]),
      'EXPENSE_RECEIPT',
      'big.pdf',
    );
    expect(big.status).toBe(413);
    const up = check(await upload(owner, PNG), 201).data;
    expect(up).toMatchObject({
      purpose: 'EXPENSE_RECEIPT',
      contentType: 'image/png',
      size: PNG.length,
    });

    const exp = (
      await post(
        owner,
        '/expenses',
        {
          propertyId: p.id,
          category: 'REPAIRS',
          name: 'Plumbing',
          amount: KES(4500),
          incurredOn: TODAY,
          receiptUploadId: up.id,
        },
        201,
      )
    ).data;
    expect(exp.receipt).toMatchObject({ id: up.id, contentType: 'image/png' });
    const file = await raw(owner, `/expenses/${exp.id}/receipt`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['cache-control']).toBe('private, no-store');
    expect((file.body as Buffer).equals(PNG)).toBe(true);

    // Attached once; other organisations can't read it; wrong purpose refused.
    const again = await post(
      owner,
      '/expenses',
      {
        propertyId: p.id,
        category: 'OTHER',
        name: 'x',
        amount: 1,
        incurredOn: TODAY,
        receiptUploadId: up.id,
      },
      422,
    );
    expect(again.error).toMatchObject({
      code: 'UPLOAD_INVALID',
      details: [{ field: 'receiptUploadId' }],
    });
    expect((await raw(other, `/uploads/${up.id}/content`)).status).toBe(404);
    const photo = check(await upload(owner, PNG, 'METER_PHOTO'), 201).data;
    await post(
      owner,
      '/expenses',
      {
        propertyId: p.id,
        category: 'OTHER',
        name: 'x',
        amount: 1,
        incurredOn: TODAY,
        receiptUploadId: photo.id,
      },
      422,
    );

    // A caretaker (no expenses permissions) can't upload receipts or read them.
    const role = await roleId(t, owner, 'CARETAKER');
    await post(
      owner,
      '/users/invitations',
      { firstName: 'C', lastName: 'T', email: 'ct@example.invalid', roleId: role },
      201,
    );
    const ct = await acceptInvite(t, 'ct@example.invalid');
    expect((await upload(ct, PNG)).status).toBe(403);
    expect((await raw(ct, `/uploads/${up.id}/content`)).status).toBe(404);

    // Unattached uploads older than a day are cleaned up; attached ones stay.
    expect(await t.app.get(UploadsService).cleanup(Date.now() + 2 * 86_400_000)).toEqual({
      deleted: 1,
    });
    expect(await t.prisma.upload.count()).toBe(1);
  });

  it('expenses: create, edit, void, filter, total and CSV', async () => {
    const a = await property(owner, 'AAA');
    const b = await property(owner, 'BBB');
    const mk = (
      propertyId: string,
      category: string,
      name: string,
      amount: number,
      incurredOn = TODAY,
    ) =>
      post(owner, '/expenses', { propertyId, category, name, amount, incurredOn }, 201).then(
        (r) => r.data,
      );
    const e1 = await mk(a.id, 'REPAIRS', 'Gate hinge', KES(1200));
    await mk(a.id, 'SECURITY', '=SUM(A1:A9) guards', KES(30000));
    await mk(b.id, 'CLEANING', 'Cleaning', KES(5000));
    await post(
      owner,
      '/expenses',
      {
        propertyId: a.id,
        category: 'OTHER',
        name: 'Future',
        amount: 1,
        incurredOn: formatDateOnly(addDays(parseDateOnly(TODAY), 1)),
      },
      422,
    );

    const list = await get(owner, `/expenses?propertyId=${a.id}`);
    expect(list.meta).toMatchObject({ total: 2, totalAmount: KES(31200) });
    expect((await get(owner, '/expenses?category=CLEANING')).meta.totalAmount).toBe(KES(5000));

    const edited = (
      await patch(owner, `/expenses/${e1.id}`, { amount: KES(1500), payee: 'Fundi Ltd' })
    ).data;
    expect(edited).toMatchObject({ amount: KES(1500), payee: 'Fundi Ltd' });
    const voided = (await post(owner, `/expenses/${e1.id}/void`, { reason: 'Entered twice' })).data;
    expect(voided).toMatchObject({ voidReason: 'Entered twice' });
    expect((await patch(owner, `/expenses/${e1.id}`, { amount: 1 }, 409)).error.code).toBe(
      'EXPENSE_VOID',
    );
    expect((await get(owner, `/expenses?propertyId=${a.id}`)).meta.totalAmount).toBe(KES(30000));
    expect((await get(owner, '/expenses?voided=true')).meta.total).toBe(1);

    const csv = await t.http().get('/api/v1/expenses?format=csv').set(auth(owner));
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('expenses.csv');
    expect(csv.text.startsWith('﻿Date,Property,Category')).toBe(true);
    expect(csv.text).toContain("'=SUM(A1:A9) guards"); // formula neutralised
    expect(csv.text).toContain('30000.00');

    expect((await get(other, `/expenses/${e1.id}`, 404)).error.code).toBe('NOT_FOUND');
    expect((await get(other, '/expenses')).data).toHaveLength(0);
    const actions = (await t.prisma.auditLog.findMany({ where: { entity: 'expense' } })).map(
      (x) => x.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining(['expense.create', 'expense.update', 'expense.void']),
    );
  });

  it('recurring expenses catch up missed dates, once', async () => {
    const p = await property(owner, 'REC');
    const start = formatDateOnly(addDays(parseDateOnly(RUN_DATE), -70)); // ~ two months ago
    const rec = (
      await post(
        owner,
        '/recurring-expenses',
        {
          propertyId: p.id,
          category: 'SECURITY',
          name: 'Guards',
          amount: KES(30000),
          everyMonths: 1,
          startDate: start,
        },
        201,
      )
    ).data;
    expect(rec.dayOfMonth).toBe(Math.min(Number(start.slice(8, 10)), 28));
    const first = (await post(owner, '/recurring-expenses/run', {})).data.created;
    expect(first).toBeGreaterThanOrEqual(2);
    expect((await post(owner, '/recurring-expenses/run', {})).data.created).toBe(0);
    expect(await t.app.get(ExpensesService).runRecurringAll()).toMatchObject({ created: 0 });
    const generated = await get(owner, `/expenses?propertyId=${p.id}`);
    expect(generated.meta.total).toBe(first);
    expect(
      generated.data.every(
        (e: { createdBy: unknown; recurringExpenseId: string }) =>
          e.createdBy === null && e.recurringExpenseId === rec.id,
      ),
    ).toBe(true);
    expect(
      (await t.http().delete(`/api/v1/recurring-expenses/${rec.id}`).set(auth(owner))).status,
    ).toBe(409);
    const stopped = (await patch(owner, `/recurring-expenses/${rec.id}`, { status: 'INACTIVE' }))
      .data;
    expect(stopped.status).toBe('INACTIVE');
  });

  it('a meter reading can carry a photo', async () => {
    const p = await property(owner, 'MTR');
    const u = (
      await post(owner, '/units', { propertyId: p.id, number: 'M1', rentAmount: KES(1000) }, 201)
    ).data;
    const water = (
      await post(
        owner,
        '/charge-types',
        { propertyId: p.id, name: 'Water', kind: 'METERED', unitRate: KES(100) },
        201,
      )
    ).data;
    const meter = (
      await post(owner, '/meters', { unitId: u.id, chargeTypeId: water.id, serialNo: 'W-1' }, 201)
    ).data;
    const photo = check(await upload(owner, PNG, 'METER_PHOTO'), 201).data;
    await put(owner, '/meter-readings', {
      period: PERIOD,
      readings: [{ meterId: meter.id, current: '12', photoUploadId: photo.id }],
    });
    const sheet = (
      await get(
        owner,
        `/meter-readings/sheet?propertyId=${p.id}&chargeTypeId=${water.id}&period=${PERIOD}`,
      )
    ).data;
    expect(sheet[0].reading.photo).toEqual({ id: photo.id });
    const img = await raw(owner, `/meter-readings/${sheet[0].reading.id}/photo`);
    expect((img.body as Buffer).equals(PNG)).toBe(true);
    expect((await raw(other, `/meter-readings/${sheet[0].reading.id}/photo`)).status).toBe(404);
  });

  it('reports match a hand-built month', async () => {
    // Two properties. A: units A1 (let), A2 (vacant), A3 (unavailable). B: B1 (let).
    const a = await property(owner, 'RPA');
    const b = await property(owner, 'RPB');
    await post(
      owner,
      '/units/bulk',
      { propertyId: a.id, numbers: ['A1', 'A2', 'A3'], rentAmount: KES(20000) },
      201,
    );
    await post(owner, '/units', { propertyId: b.id, number: 'B1', rentAmount: KES(10000) }, 201);
    const units = (await get(owner, '/units?pageSize=50')).data as { id: string; number: string }[];
    const id = (n: string) => units.find((u) => u.number === n)!.id;
    await patch(owner, `/units/${id('A3')}`, { status: 'INACTIVE' });
    const ta = (
      await post(
        owner,
        '/tenancies',
        {
          unitId: id('A1'),
          tenant: { firstName: 'Ann', lastName: 'A', phone: '0711000501' },
          startDate: RUN_DATE,
          billingDay: 1,
        },
        201,
      )
    ).data;
    const tb = (
      await post(
        owner,
        '/tenancies',
        {
          unitId: id('B1'),
          tenant: { firstName: 'Ben', lastName: 'B', phone: '0711000502' },
          startDate: RUN_DATE,
          billingDay: 1,
        },
        201,
      )
    ).data;
    await post(owner, '/invoices/run', { date: RUN_DATE }); // A: 20,000; B: 10,000
    // An overdue one-off for Ann, due 45 days ago.
    const old = formatDateOnly(addDays(parseDateOnly(TODAY), -45));
    await post(
      owner,
      '/invoices',
      {
        tenancyId: ta.id,
        lines: [{ description: 'Repairs recharge', amount: KES(3000) }],
        dueDate: old,
      },
      201,
    );
    const cash = (await post(owner, '/payment-channels', { kind: 'CASH', name: 'Cash' }, 201)).data;
    // Ann pays 15,000 (oldest first: 3,000 one-off, 12,000 rent); Ben pays 10,000 then it is reversed.
    await post(
      owner,
      '/payments',
      {
        tenantId: ta.tenant.id,
        channelId: cash.id,
        amount: KES(15000),
        receivedAt: TODAY,
        notifyTenant: false,
      },
      201,
    );
    const pb = (
      await post(
        owner,
        '/payments',
        {
          tenantId: tb.tenant.id,
          channelId: cash.id,
          amount: KES(10000),
          receivedAt: TODAY,
          notifyTenant: false,
        },
        201,
      )
    ).data;
    await post(owner, `/payments/${pb.id}/reverse`, { reason: 'Bounced' });
    await post(
      owner,
      '/expenses',
      { propertyId: a.id, category: 'REPAIRS', name: 'Roof', amount: KES(2500), incurredOn: TODAY },
      201,
    );
    await post(
      owner,
      '/expenses',
      {
        propertyId: b.id,
        category: 'SECURITY',
        name: 'Guard',
        amount: KES(1000),
        incurredOn: TODAY,
      },
      201,
    );

    const pnl = (await get(owner, `/reports/property-pnl?from=${PERIOD}&to=${PERIOD}`)).data;
    const rowA = pnl.rows.find((r: { property: { id: string } }) => r.property.id === a.id);
    const rowB = pnl.rows.find((r: { property: { id: string } }) => r.property.id === b.id);
    expect(rowA.invoiced).toEqual({
      rent: KES(20000),
      charges: 0,
      moveIn: 0,
      other: KES(3000),
      total: KES(23000),
    });
    expect(rowA).toMatchObject({ collected: KES(15000), net: KES(12500) });
    expect(rowA.expenses).toMatchObject({ REPAIRS: KES(2500), total: KES(2500) });
    expect(rowB).toMatchObject({ collected: 0, net: -KES(1000) }); // reversal cancels the payment
    expect(pnl.totals).toMatchObject({ collected: KES(15000), net: KES(11500) });

    const arrears = (await get(owner, '/reports/arrears')).data;
    const ann = arrears.rows.find((r: { tenant: { id: string } }) => r.tenant.id === ta.tenant.id);
    expect(ann).toMatchObject({ total: KES(8000), units: ['A1 · Block RPA'] });
    expect(arrears.totals.total).toBe(KES(18000)); // Ann 8,000 + Ben 10,000
    expect(arrears.totals.d31_60).toBe(0); // the overdue one-off was fully paid

    const occ = (await get(owner, '/reports/occupancy')).data;
    const occA = occ.rows.find((r: { property: { id: string } }) => r.property.id === a.id);
    expect(occA).toMatchObject({
      units: 3,
      occupied: 1,
      notice: 0,
      vacant: 1,
      unavailable: 1,
      rate: 0.5,
    });
    expect(occA.vacantUnits.map((u: { number: string }) => u.number)).toEqual(['A2']);
    expect(occ.totals).toMatchObject({ units: 4, occupied: 2, rate: 0.6667 });

    const dash = (await get(owner, `/reports/dashboard?period=${PERIOD}`)).data;
    expect(dash).toMatchObject({
      period: PERIOD,
      invoiced: KES(33000),
      collected: KES(15000),
      expenses: KES(3500),
      net: KES(11500),
      unmatchedMpesa: 0,
    });
    expect(dash.collectionRate).toBeCloseTo(15000 / 33000, 3);
    expect(dash.trend).toHaveLength(12);
    expect(dash.trend.at(-1)).toMatchObject({ period: PERIOD, invoiced: KES(33000) });

    const csv = await t.http().get(`/api/v1/reports/arrears?format=csv`).set(auth(owner));
    expect(csv.text.split('\r\n')[0]).toContain('Over 90 days');
    expect(
      (await t.http().get(`/api/v1/reports/occupancy?format=csv`).set(auth(owner))).text,
    ).toContain('50.0%');

    // Property-limited staff only see their property's figures.
    const role = await roleId(t, owner, 'ACCOUNTANT');
    await post(
      owner,
      '/users/invitations',
      {
        firstName: 'Acc',
        lastName: 'B',
        email: 'accb@example.invalid',
        roleId: role,
        propertyIds: [b.id],
      },
      201,
    );
    const accB = await acceptInvite(t, 'accb@example.invalid');
    const limited = (await get(accB, `/reports/property-pnl?from=${PERIOD}&to=${PERIOD}`)).data;
    expect(limited.rows.map((r: { property: { id: string } }) => r.property.id)).toEqual([b.id]);
    expect((await get(accB, '/reports/arrears')).data.totals.total).toBe(KES(10000));
    expect((await get(accB, `/reports/dashboard?period=${PERIOD}`)).data.invoiced).toBe(KES(10000));
    await get(accB, `/reports/occupancy?propertyId=${a.id}`, 404);
    // Another organisation sees nothing of it.
    expect((await get(other, `/reports/dashboard?period=${PERIOD}`)).data).toMatchObject({
      invoiced: 0,
      collected: 0,
      expenses: 0,
    });
  });
});
