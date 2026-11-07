import { createTestApp, resetDb, type TestApp } from './helpers.js';

describe('Stays schema & no-overlap constraint (e2e)', () => {
  let t: TestApp;
  let orgId: string;
  let propertyId: string;
  let unitId: string;
  let listingId: string;
  let seq = 0;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    seq = 0;
    const org = await t.prisma.organization.create({
      data: {
        name: 'Cozy Stays',
        kind: 'HOST',
        phone: '+254700000100',
        email: 'host@example.invalid',
      },
    });
    orgId = org.id;
    const property = await t.prisma.property.create({
      data: {
        orgId,
        name: 'Cozy Court',
        code: 'CC',
      },
    });
    propertyId = property.id;
    const unit = await t.prisma.unit.create({
      data: {
        orgId,
        propertyId,
        number: 'A1',
        rentAmount: 0n,
      },
    });
    unitId = unit.id;
    const listing = await t.prisma.listing.create({
      data: {
        orgId,
        unitId,
        propertyId,
        title: 'Sunny Studio A1',
        maxGuests: 2,
        nightlyPrice: 300000n,
      },
    });
    listingId = listing.id;
  });

  function booking(p: {
    kind?: 'STAY' | 'BLOCK';
    checkIn: string;
    checkOut: string;
    status: 'HELD' | 'REQUESTED' | 'CONFIRMED' | 'CHECKED_IN' | 'CANCELLED' | 'EXPIRED';
  }) {
    seq += 1;
    return t.prisma.booking.create({
      data: {
        orgId,
        code: `B${String(seq).padStart(5, '0')}`,
        kind: p.kind ?? 'STAY',
        unitId,
        propertyId,
        listingId,
        checkIn: new Date(`${p.checkIn}T00:00:00.000Z`),
        checkOut: new Date(`${p.checkOut}T00:00:00.000Z`),
        status: p.status,
        source: 'HOST',
        lines: [],
        rules: {},
      },
    });
  }

  it('refuses two blocking bookings on overlapping nights of one unit', async () => {
    await booking({ checkIn: '2026-12-01', checkOut: '2026-12-05', status: 'CONFIRMED' });
    await expect(
      booking({ checkIn: '2026-12-04', checkOut: '2026-12-06', status: 'HELD' }),
    ).rejects.toThrow(/bookings_no_overlap/);
  });

  it('allows back-to-back stays (check-out day = next check-in)', async () => {
    await booking({ checkIn: '2026-12-01', checkOut: '2026-12-05', status: 'CONFIRMED' });
    await expect(
      booking({ checkIn: '2026-12-05', checkOut: '2026-12-07', status: 'CONFIRMED' }),
    ).resolves.toBeTruthy();
  });

  it('ignores cancelled and expired bookings', async () => {
    await booking({ checkIn: '2026-12-01', checkOut: '2026-12-05', status: 'CANCELLED' });
    await expect(
      booking({ checkIn: '2026-12-02', checkOut: '2026-12-03', status: 'HELD' }),
    ).resolves.toBeTruthy();
  });

  it('counts a host BLOCK as taken', async () => {
    await booking({
      kind: 'BLOCK',
      checkIn: '2026-12-10',
      checkOut: '2026-12-12',
      status: 'CONFIRMED',
    });
    await expect(
      booking({ checkIn: '2026-12-11', checkOut: '2026-12-13', status: 'HELD' }),
    ).rejects.toThrow(/bookings_no_overlap/);
  });

  it('lets two parallel inserts for the same nights produce exactly one row', async () => {
    const r = await Promise.allSettled(
      [1, 2].map(() => booking({ checkIn: '2026-12-20', checkOut: '2026-12-22', status: 'HELD' })),
    );
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  });
});
