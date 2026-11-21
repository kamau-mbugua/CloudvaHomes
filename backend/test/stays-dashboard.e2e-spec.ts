import { hashPassword } from '../src/modules/auth/crypto.js';
import { parseDateOnly } from '../src/common/dates/date-only.js';
import { nairobiToday } from '../src/modules/stays/bookings/booking-view.js';
import { addIsoDays } from '../src/modules/stays/rules/report-math.js';
import {
  auth,
  createPlatformAdmin,
  createTestApp,
  login,
  onboardOrg,
  PASSWORD,
  resetDb,
  type Session,
  type TestApp,
} from './helpers.js';

describe('Host dashboard API (e2e)', () => {
  let t: TestApp;
  let admin: Session;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    admin = await login(t, 'admin@example.invalid');
  });

  it('gives the owner today’s stays, what needs them, nights ahead and money; hides money from a caretaker', async () => {
    const today = nairobiToday();
    const { orgId, owner } = await onboardOrg(t, admin, {
      name: 'Makini Homes',
      ownerEmail: 'dash-host@example.invalid',
      ownerPhone: '+254719333444',
      kind: 'HOST',
    });
    const property = (
      await t
        .http()
        .post('/api/v1/properties')
        .set(auth(owner))
        .send({ name: 'Makini Court', code: 'MK', county: 'Nairobi' })
        .expect(201)
    ).body.data;

    const listing = async (unitNumber: string) =>
      (
        await t
          .http()
          .post('/api/v1/host/listings')
          .set(auth(owner))
          .send({
            propertyId: property.id,
            unitNumber,
            title: `Unit ${unitNumber}`,
            maxGuests: 2,
            nightlyPrice: '500000',
            cleaningFee: '0',
            minNights: 1,
            published: true,
          })
          .expect(201)
      ).body.data as { id: string; unitId: string };
    const l101 = await listing('101');
    const l102 = await listing('102');
    await listing('103');

    const book = async (listingId: string, checkIn: string, checkOut: string, name: string) =>
      (
        await t
          .http()
          .post('/api/v1/host/bookings')
          .set(auth(owner))
          .send({
            listingId,
            checkIn,
            checkOut,
            guests: 1,
            guest: { name, phone: '0733111222' },
            confirm: true,
          })
          .expect(201)
      ).body.data as { id: string; code: string; total: string };

    // 101: arrives today, half paid, unit still dirty.
    const arriving = await book(l101.id, today, addIsoDays(today, 2), 'Arriving Guest');
    await t.prisma.booking.update({
      where: { id: arriving.id },
      data: { amountPaid: BigInt(arriving.total) / 2n },
    });
    await t.prisma.cleaningTask.create({ data: { orgId, unitId: l101.unitId } });

    // 102: checked in, was due out two days ago.
    const overdue = await book(l102.id, addIsoDays(today, 20), addIsoDays(today, 22), 'Late Guest');
    await t.prisma.booking.update({
      where: { id: overdue.id },
      data: {
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
        checkIn: parseDateOnly(addIsoDays(today, -4)),
        checkOut: parseDateOnly(addIsoDays(today, -2)),
        amountPaid: BigInt(overdue.total),
      },
    });

    const res = await t.http().get('/api/v1/host/dashboard').set(auth(owner)).expect(200);
    const d = res.body.data;

    expect(d.today).toBe(today);
    expect(d.summary.units).toBe(3);
    expect(d.summary.properties).toEqual([{ id: property.id, code: 'MK', name: 'Makini Court' }]);
    expect(d.stays.arriving.map((r: any) => [r.code, r.unitReady])).toEqual([
      [arriving.code, false],
    ]);
    expect(d.stays.staying.map((r: any) => [r.code, r.stage])).toEqual([[overdue.code, 'OVERDUE']]);
    expect(d.needs.map((n: any) => n.kind)).toEqual(['OVERDUE_CHECKOUT', 'UNIT_NOT_READY']);
    expect(d.nights).toHaveLength(14);
    expect(d.nights[0]).toEqual({ date: today, booked: 1 });
    expect(d.units.counts).toMatchObject({ LATE: 1, TO_CLEAN: 1, READY: 1 });
    expect(d.summary.toClean).toBe(1);
    expect(d.summary.toCleanBeforeArrival).toBe(1);
    expect(d.summary.money.owed).toBe((BigInt(arriving.total) / 2n).toString());
    expect(d.balances.map((b: any) => b.code)).toEqual([arriving.code]);

    // A caretaker sees the day's work but no money.
    const caretakerRole = await t.prisma.role.findFirstOrThrow({
      where: { orgId, systemKey: 'CARETAKER' },
    });
    const user = await t.prisma.user.create({
      data: {
        firstName: 'Care',
        lastName: 'Taker',
        email: 'dash-caretaker@example.invalid',
        phone: '+254799000222',
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    await t.prisma.membership.create({
      data: { orgId, userId: user.id, roleId: caretakerRole.id, status: 'ACTIVE' },
    });
    const caretaker = await login(t, 'dash-caretaker@example.invalid');
    const cv = (await t.http().get('/api/v1/host/dashboard').set(auth(caretaker)).expect(200)).body
      .data;
    expect(cv.summary.money).toBeNull();
    expect(cv.balances).toEqual([]);
    expect(cv.stays.arriving[0].owed).toBeUndefined();
    expect(cv.stays.arriving).toHaveLength(1);
  });

  it('is for host organisations only', async () => {
    const { owner } = await onboardOrg(t, admin, {
      name: 'Long Lets Ltd',
      ownerEmail: 'dash-landlord@example.invalid',
      ownerPhone: '+254719555666',
    });
    const res = await t.http().get('/api/v1/host/dashboard').set(auth(owner));
    expect([403, 409]).toContain(res.status);
  });
});
