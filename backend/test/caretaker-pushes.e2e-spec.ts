import { parseDateOnly } from '../src/common/dates/date-only.js';
import { outbox } from '../src/modules/notifications/senders.js';
import {
  addMember,
  auth,
  createPlatformAdmin,
  createTestApp,
  login,
  onboardOrg,
  resetDb,
  type Session,
  type TestApp,
} from './helpers.js';

const KES = (major: number) => major * 100;
const JOB_SECRET = 'caretaker-pushes-test-secret-0123456789';

type Res = { status: number; body: any };
const check = (res: Res, status: number) => {
  if (res.status !== status) {
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body;
};

describe('Unit readiness & caretaker task pushes (e2e)', () => {
  let t: TestApp;
  let admin: Session;
  let orgId: string;
  let owner: Session;

  const post = async (s: Session, path: string, body: object, status = 200) =>
    check(await t.http().post(`/api/v1${path}`).set(auth(s)).send(body), status);
  const patch = async (s: Session, path: string, body: object, status = 200) =>
    check(await t.http().patch(`/api/v1${path}`).set(auth(s)).send(body), status);
  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);
  const jobPost = async (path: string, body: object = {}, status = 200) =>
    check(
      await t
        .http()
        .post(`/api/v1/internal/jobs/${path}`)
        .set('Authorization', `Bearer ${JOB_SECRET}`)
        .send(body),
      status,
    );

  beforeAll(async () => {
    process.env.JOBS_SHARED_SECRET = JOB_SECRET;
    t = await createTestApp();
  });

  afterAll(async () => {
    delete process.env.JOBS_SHARED_SECRET;
    await t?.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    outbox.length = 0;
    await createPlatformAdmin(t.prisma);
    admin = await login(t, 'admin@example.invalid');
    ({ orgId, owner } = await onboardOrg(t, admin, {
      name: 'Kilimani Homes',
      ownerEmail: 'owner@kilimani.invalid',
      ownerPhone: '+254700000301',
    }));
  });

  async function createPropertyWithUnit(code: string, name: string, unitNo = 'A1', s = owner) {
    const prop = (await post(s, '/properties', { name, code }, 201)).data;
    const unit = (
      await post(s, '/units', { propertyId: prop.id, number: unitNo, rentAmount: KES(25000) }, 201)
    ).data;
    return { prop, unit };
  }

  async function attachWaterMeter(propertyId: string, unitId: string, serialNo: string, s = owner) {
    const ct = (
      await post(
        s,
        '/charge-types',
        {
          propertyId,
          name: `Water-${serialNo}`,
          kind: 'METERED',
          unitRate: KES(150),
          unitLabel: 'm³',
        },
        201,
      )
    ).data;
    return (await post(s, '/meters', { unitId, chargeTypeId: ct.id, serialNo }, 201)).data;
  }

  describe('1. Unit readiness', () => {
    it('sets READY, clears with null, exposes readiness in GET, writes audit logs, and enforces 422 / 403 / 404', async () => {
      const { prop: propA, unit: unitA } = await createPropertyWithUnit('PA', 'Court A');
      const { prop: propB } = await createPropertyWithUnit('PB', 'Court B');

      expect(unitA.readiness).toBeNull();

      // PATCH sets READY -> visible in response, GET /units/:id, and GET /units
      const setReady = (await patch(owner, `/units/${unitA.id}`, { readiness: 'READY' })).data;
      expect(setReady.readiness).toBe('READY');
      expect((await get(owner, `/units/${unitA.id}`)).data.readiness).toBe('READY');
      const listedReady = (await get(owner, `/units?propertyId=${propA.id}`)).data;
      expect(listedReady[0].readiness).toBe('READY');

      // PATCH null clears it -> visible in GET /units/:id and GET /units
      const cleared = (await patch(owner, `/units/${unitA.id}`, { readiness: null })).data;
      expect(cleared.readiness).toBeNull();
      expect((await get(owner, `/units/${unitA.id}`)).data.readiness).toBeNull();
      expect((await get(owner, `/units?propertyId=${propA.id}`)).data[0].readiness).toBeNull();

      // Audit rows recorded before/after snapshots
      const audits = await t.prisma.auditLog.findMany({
        where: { orgId, entity: 'unit', entityId: unitA.id, action: 'unit.update' },
        orderBy: { createdAt: 'asc' },
      });
      expect(audits).toHaveLength(2);
      expect(audits[0]!.before).toMatchObject({ readiness: null });
      expect(audits[0]!.after).toMatchObject({ readiness: 'READY' });
      expect(audits[1]!.before).toMatchObject({ readiness: 'READY' });
      expect(audits[1]!.after).toMatchObject({ readiness: null });

      // Invalid value "CLEAN" -> 422 VALIDATION_FAILED
      const bad = await patch(owner, `/units/${unitA.id}`, { readiness: 'CLEAN' }, 422);
      expect(bad.error.code).toBe('VALIDATION_FAILED');

      // Role without units:update (ACCOUNTANT) -> 403
      const accountant = await addMember(t, owner, {
        email: 'acc@kilimani.invalid',
        role: 'ACCOUNTANT',
      });
      await patch(accountant, `/units/${unitA.id}`, { readiness: 'NEEDS_CLEANING' }, 403);

      // Caretaker (has units:update by custom/role grant, limited to propB) -> 404 on unitA
      const caretakerB = await addMember(t, owner, {
        email: 'caretaker-b@kilimani.invalid',
        role: 'MANAGER',
      });
      await t.prisma.membership.update({
        where: { orgId_userId: { orgId, userId: caretakerB.userId } },
        data: { propertyIds: [propB.id] },
      });
      await patch(caretakerB, `/units/${unitA.id}`, { readiness: 'UNDER_REPAIR' }, 404);
    });
  });

  describe('2–4. caretaker-daily METER_READINGS_DUE', () => {
    it('sends once per eligible person on the 1st, skips non-metered / unauthorized / suspended orgs, is idempotent, and skips the 2nd', async () => {
      const { prop: propA, unit: unitA } = await createPropertyWithUnit('PA', 'Court A', 'A1');
      const { prop: propA2, unit: unitA2 } = await createPropertyWithUnit('PA2', 'Court A2', 'A2');
      const { prop: propB } = await createPropertyWithUnit('PB', 'Court B', 'B1');

      await attachWaterMeter(propA.id, unitA.id, 'WM-A1');
      await attachWaterMeter(propA2.id, unitA2.id, 'WM-A2');

      // Caretaker limited to metered properties A and A2 -> still gets ONLY ONE push
      const caretakerA = await addMember(t, owner, {
        email: 'caretaker-a@kilimani.invalid',
        role: 'CARETAKER',
      });
      await t.prisma.membership.update({
        where: { orgId_userId: { orgId, userId: caretakerA.userId } },
        data: { propertyIds: [propA.id, propA2.id] },
      });

      // Caretaker limited to property B (no meter) -> gets none
      const caretakerB = await addMember(t, owner, {
        email: 'caretaker-b@kilimani.invalid',
        role: 'CARETAKER',
      });
      await t.prisma.membership.update({
        where: { orgId_userId: { orgId, userId: caretakerB.userId } },
        data: { propertyIds: [propB.id] },
      });

      // Accountant (no meters:create) -> gets none
      const accountant = await addMember(t, owner, {
        email: 'acc@kilimani.invalid',
        role: 'ACCOUNTANT',
      });

      // Second organisation that is SUSPENDED, with a metered property and a caretaker -> gets none
      const { orgId: suspendedOrgId, owner: suspendedOwner } = await onboardOrg(t, admin, {
        name: 'Suspended Estates',
        ownerEmail: 'owner@suspended.invalid',
        ownerPhone: '+254700000399',
      });
      const { prop: suspProp, unit: suspUnit } = await createPropertyWithUnit(
        'SP',
        'Suspended Court',
        'S1',
        suspendedOwner,
      );
      await attachWaterMeter(suspProp.id, suspUnit.id, 'WM-S1', suspendedOwner);
      const suspendedCaretaker = await addMember(t, suspendedOwner, {
        email: 'caretaker@suspended.invalid',
        role: 'CARETAKER',
      });
      await t.prisma.organization.update({
        where: { id: suspendedOrgId },
        data: { status: 'SUSPENDED' },
      });

      // Running on the 2nd sends no METER_READINGS_DUE
      const onSecond = (await jobPost('caretaker-daily', { today: '2026-12-02' })).data;
      expect(onSecond).toEqual({ readingsDue: 0, finalReadings: 0 });
      expect(await t.prisma.userNotification.count({ where: { kind: 'METER_READINGS_DUE' } })).toBe(
        0,
      );

      // Running on the 1st sends exactly 1 to caretakerA (and 1 to owner), 0 to caretakerB, accountant, suspendedCaretaker
      const run1 = (await jobPost('caretaker-daily', { today: '2026-12-01' })).data;
      expect(run1).toEqual({ readingsDue: 2, finalReadings: 0 });

      const caretakerANotifs = await t.prisma.userNotification.findMany({
        where: { userId: caretakerA.userId, kind: 'METER_READINGS_DUE' },
      });
      expect(caretakerANotifs).toHaveLength(1);
      expect(caretakerANotifs[0]).toMatchObject({
        orgId,
        title: 'Meter readings due',
        body: 'Meter readings for December 2026 are due.',
        actionUrl: '/app/meter-readings',
      });

      expect(
        await t.prisma.userNotification.count({
          where: { userId: caretakerB.userId, kind: 'METER_READINGS_DUE' },
        }),
      ).toBe(0);
      expect(
        await t.prisma.userNotification.count({
          where: { userId: accountant.userId, kind: 'METER_READINGS_DUE' },
        }),
      ).toBe(0);
      expect(
        await t.prisma.userNotification.count({
          where: { userId: suspendedCaretaker.userId, kind: 'METER_READINGS_DUE' },
        }),
      ).toBe(0);
      expect(
        await t.prisma.userNotification.count({
          where: { orgId: suspendedOrgId, kind: 'METER_READINGS_DUE' },
        }),
      ).toBe(0);

      // Running again the same day creates no new notifications
      const beforeCount = await t.prisma.userNotification.count({
        where: { kind: 'METER_READINGS_DUE' },
      });
      const run2 = (await jobPost('caretaker-daily', { today: '2026-12-01' })).data;
      expect(run2).toEqual({ readingsDue: 0, finalReadings: 0 });
      expect(await t.prisma.userNotification.count({ where: { kind: 'METER_READINGS_DUE' } })).toBe(
        beforeCount,
      );
    });
  });

  describe('5. FINAL_METER_READING on move-out day', () => {
    it('notifies only for NOTICE tenancies ending today on units with an ACTIVE meter, once', async () => {
      const { prop, unit: meteredTodayUnit } = await createPropertyWithUnit(
        'MC',
        'Milimani Court',
        'A4',
      );
      const noMeterUnit = (
        await post(
          owner,
          '/units',
          { propertyId: prop.id, number: 'A5', rentAmount: KES(20000) },
          201,
        )
      ).data;
      const tomorrowUnit = (
        await post(
          owner,
          '/units',
          { propertyId: prop.id, number: 'A6', rentAmount: KES(20000) },
          201,
        )
      ).data;

      await attachWaterMeter(prop.id, meteredTodayUnit.id, 'WM-A4');
      await attachWaterMeter(prop.id, tomorrowUnit.id, 'WM-A6');

      const caretaker = await addMember(t, owner, {
        email: 'caretaker-final@kilimani.invalid',
        role: 'CARETAKER',
      });

      const makeNoticeTenancy = async (unitId: string, phone: string, endDay: string) => {
        const tenant = (
          await post(owner, '/tenants', { firstName: 'Grace', lastName: 'Mutua', phone }, 201)
        ).data;
        const tenancy = (
          await post(
            owner,
            '/tenancies',
            { unitId, tenantId: tenant.id, startDate: '2026-06-01' },
            201,
          )
        ).data;
        await t.prisma.tenancy.update({
          where: { id: tenancy.id },
          data: { status: 'NOTICE', endDate: parseDateOnly(endDay) },
        });
        return tenancy;
      };

      await makeNoticeTenancy(meteredTodayUnit.id, '0711200001', '2026-12-15');
      await makeNoticeTenancy(noMeterUnit.id, '0711200002', '2026-12-15');
      await makeNoticeTenancy(tomorrowUnit.id, '0711200003', '2026-12-16');

      const run1 = (await jobPost('caretaker-daily', { today: '2026-12-15' })).data;
      expect(run1).toEqual({ readingsDue: 0, finalReadings: 2 }); // owner + caretaker

      const notifs = await t.prisma.userNotification.findMany({
        where: { userId: caretaker.userId, kind: 'FINAL_METER_READING' },
      });
      expect(notifs).toHaveLength(1);
      expect(notifs[0]).toMatchObject({
        orgId,
        title: 'Final meter reading',
        body: 'Take the final meter reading for Milimani Court Unit A4. The tenant moves out today.',
        actionUrl: `/app/units/${meteredTodayUnit.id}`,
      });

      // Second run the same day sends nothing new
      const run2 = (await jobPost('caretaker-daily', { today: '2026-12-15' })).data;
      expect(run2).toEqual({ readingsDue: 0, finalReadings: 0 });
    });
  });

  describe('6. maintenance-late', () => {
    it('notifies once for requests newly late within 24h, skipping 3-day-late, closed, and out-of-scope staff', async () => {
      const { prop: propA, unit: unitA } = await createPropertyWithUnit('RA', 'Ridgeview', 'R1');
      const { prop: propB } = await createPropertyWithUnit('RB', 'Brookside', 'B1');

      const caretakerA = await addMember(t, owner, {
        email: 'maint-a@kilimani.invalid',
        role: 'CARETAKER',
      });
      await t.prisma.membership.update({
        where: { orgId_userId: { orgId, userId: caretakerA.userId } },
        data: { propertyIds: [propA.id] },
      });

      const caretakerB = await addMember(t, owner, {
        email: 'maint-b@kilimani.invalid',
        role: 'CARETAKER',
      });
      await t.prisma.membership.update({
        where: { orgId_userId: { orgId, userId: caretakerB.userId } },
        data: { propertyIds: [propB.id] },
      });

      const accountant = await addMember(t, owner, {
        email: 'maint-acc@kilimani.invalid',
        role: 'ACCOUNTANT',
      });

      const now = new Date('2026-12-10T12:00:00.000Z');
      const h = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000);

      // 1) URGENT (24h SLA) created 25h before now -> became late 1h ago -> notifies
      await t.prisma.maintenanceRequest.create({
        data: {
          orgId,
          propertyId: propA.id,
          unitId: unitA.id,
          number: 'MNT-2026-000001',
          priority: 'URGENT',
          status: 'OPEN',
          title: 'Burst kitchen pipe',
          description: 'Leaking under sink',
          createdAt: h(25),
        },
      });

      // 2) URGENT late for 3 days (created 24 + 72 = 96h ago) -> skipped
      await t.prisma.maintenanceRequest.create({
        data: {
          orgId,
          propertyId: propA.id,
          unitId: unitA.id,
          number: 'MNT-2026-000002',
          priority: 'URGENT',
          status: 'OPEN',
          title: 'Old broken gate',
          description: 'Already 3 days late',
          createdAt: h(96),
        },
      });

      // 3) Closed (RESOLVED and CANCELLED) created 25h ago -> skipped
      await t.prisma.maintenanceRequest.create({
        data: {
          orgId,
          propertyId: propA.id,
          unitId: unitA.id,
          number: 'MNT-2026-000003',
          priority: 'URGENT',
          status: 'RESOLVED',
          title: 'Fixed tap',
          description: 'Already resolved',
          createdAt: h(25),
          resolvedAt: h(2),
        },
      });
      await t.prisma.maintenanceRequest.create({
        data: {
          orgId,
          propertyId: propA.id,
          unitId: unitA.id,
          number: 'MNT-2026-000004',
          priority: 'URGENT',
          status: 'CANCELLED',
          title: 'Cancelled repair',
          description: 'Duplicate',
          createdAt: h(25),
        },
      });

      const run1 = (await jobPost('maintenance-late', { now: now.toISOString() })).data;
      expect(run1).toEqual({ late: 2 }); // owner + caretakerA

      const notifsA = await t.prisma.userNotification.findMany({
        where: { userId: caretakerA.userId, kind: 'MAINTENANCE_LATE' },
      });
      expect(notifsA).toHaveLength(1);
      expect(notifsA[0]).toMatchObject({
        orgId,
        title: 'Repair is late',
        body: 'Burst kitchen pipe — Ridgeview Unit R1 is past its 24-hour target.',
        actionUrl: '/app/maintenance?late=true',
      });

      expect(
        await t.prisma.userNotification.count({
          where: { userId: caretakerB.userId, kind: 'MAINTENANCE_LATE' },
        }),
      ).toBe(0);
      expect(
        await t.prisma.userNotification.count({
          where: { userId: accountant.userId, kind: 'MAINTENANCE_LATE' },
        }),
      ).toBe(0);

      // Second run -> none
      const run2 = (await jobPost('maintenance-late', { now: now.toISOString() })).data;
      expect(run2).toEqual({ late: 0 });
    });
  });

  describe('7. JobsGuard authentication', () => {
    it('rejects both job endpoints with 401 when Authorization is missing or wrong', async () => {
      await t.http().post('/api/v1/internal/jobs/caretaker-daily').send({}).expect(401);
      await t.http().post('/api/v1/internal/jobs/maintenance-late').send({}).expect(401);
      await t
        .http()
        .post('/api/v1/internal/jobs/caretaker-daily')
        .set('Authorization', 'Bearer wrong-secret')
        .send({})
        .expect(401);
      await t
        .http()
        .post('/api/v1/internal/jobs/maintenance-late')
        .set('Authorization', 'Bearer wrong-secret')
        .send({})
        .expect(401);
    });
  });
});
