import { hashPassword } from '../src/modules/auth/crypto.js';
import { outbox } from '../src/modules/notifications/senders.js';
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

describe('Host bookings, blocks, statuses & calendar API (e2e)', () => {
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

  async function setupHost() {
    const { orgId, owner } = await onboardOrg(t, admin, {
      name: 'Diani Stays',
      ownerEmail: 'host@example.invalid',
      ownerPhone: '+254719111222',
      kind: 'HOST',
    });

    const propRes = await t
      .http()
      .post('/api/v1/properties')
      .set(auth(owner))
      .send({ name: 'Coral Gardens', code: 'CG', county: 'Kwale' })
      .expect(201);
    const propertyId = propRes.body.data.id as string;

    const listRes = await t
      .http()
      .post('/api/v1/host/listings')
      .set(auth(owner))
      .send({
        propertyId,
        unitNumber: 'B1',
        title: 'Coral Reef Villa',
        maxGuests: 4,
        bedrooms: 2,
        bathrooms: 2,
        nightlyPrice: '400000', // KES 4,000
        cleaningFee: '100000', // KES 1,000
        minNights: 2,
        published: true,
      })
      .expect(201);

    return {
      owner,
      orgId,
      propertyId,
      listingId: listRes.body.data.id as string,
      unitId: listRes.body.data.unitId as string,
    };
  }

  it('books 3 nights as CONFIRMED with quote total, blocks overlaps and blocks, and snapshots lines/total', async () => {
    const { owner, listingId, unitId } = await setupHost();

    // 1. Quote 3 nights (3 * 400,000 + 100,000 cleaning = 1,300,000)
    const quoteRes = await t
      .http()
      .post('/api/v1/host/bookings/quote')
      .set(auth(owner))
      .send({
        listingId,
        checkIn: '2026-12-01',
        checkOut: '2026-12-04',
        guests: 2,
      })
      .expect(201);

    expect(quoteRes.body.data.available).toBe(true);
    expect(quoteRes.body.data.problems).toEqual([]);
    expect(quoteRes.body.data.quote.total).toBe('1300000');

    // 2. Host books 3 nights -> CONFIRMED with total from the quote
    const created = await t
      .http()
      .post('/api/v1/host/bookings')
      .set(auth(owner))
      .send({
        listingId,
        checkIn: '2026-12-01',
        checkOut: '2026-12-04',
        guests: 2,
        guest: {
          name: 'John Traveller',
          phone: '0722111222',
          email: 'john@example.invalid',
        },
        confirm: true,
      })
      .expect(201);

    const bookingId = created.body.data.id as string;
    expect(created.body.data.status).toBe('CONFIRMED');
    expect(created.body.data.source).toBe('HOST');
    expect(created.body.data.code).toBe('B00001');
    expect(created.body.data.total).toBe('1300000');
    expect(created.body.data.lines).toHaveLength(4); // 3 nights + cleaning

    const guestSmsMessages = outbox.filter((m) => m.channel === 'sms' && m.to === '+254722111222');
    expect(guestSmsMessages.length).toBeGreaterThanOrEqual(1);
    expect(
      guestSmsMessages.some((m) =>
        m.text.includes('your stay at Coral Reef Villa, 1 Dec–4 Dec is confirmed. Booking B00001'),
      ),
    ).toBe(true);

    // 3. Overlapping host booking -> 409 DATES_TAKEN
    const overlap = await t
      .http()
      .post('/api/v1/host/bookings')
      .set(auth(owner))
      .send({
        listingId,
        checkIn: '2026-12-03',
        checkOut: '2026-12-06',
        guests: 2,
        guest: { name: 'Second Guest', phone: '0722333444' },
        confirm: true,
      })
      .expect(409);
    expect(overlap.body.error.code).toBe('DATES_TAKEN');

    // 4. Host block then booking inside it -> 409 DATES_TAKEN
    const blockRes = await t
      .http()
      .post('/api/v1/host/blocks')
      .set(auth(owner))
      .send({
        unitId,
        from: '2026-12-10',
        to: '2026-12-14',
        reason: 'Painting walls',
      })
      .expect(201);
    expect(blockRes.body.data.kind).toBe('BLOCK');
    expect(blockRes.body.data.status).toBe('CONFIRMED');

    const blockedStay = await t
      .http()
      .post('/api/v1/host/bookings')
      .set(auth(owner))
      .send({
        listingId,
        checkIn: '2026-12-11',
        checkOut: '2026-12-13',
        guests: 2,
        guest: { name: 'Blocked Guest', phone: '0722555666' },
        confirm: true,
      })
      .expect(409);
    expect(blockedStay.body.error.code).toBe('DATES_TAKEN');

    // 5. Host changes the nightly price -> existing booking's total and lines unchanged
    await t
      .http()
      .patch(`/api/v1/host/listings/${listingId}`)
      .set(auth(owner))
      .send({ nightlyPrice: '850000' })
      .expect(200);

    const refetched = await t
      .http()
      .get(`/api/v1/host/bookings/${bookingId}`)
      .set(auth(owner))
      .expect(200);
    expect(refetched.body.data.total).toBe('1300000');
    expect(refetched.body.data.lines).toEqual(created.body.data.lines);
  });

  it('computes cancel dry-run suggestedRefund, creates CleaningTask on checkOut, refuses COMPLETED -> cancel, and hides total from caretaker', async () => {
    const { owner, orgId, listingId, unitId } = await setupHost();

    // Create a booking 6 days from today
    const sixDaysAhead = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);
    const nineDaysAhead = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);

    const created = await t
      .http()
      .post('/api/v1/host/bookings')
      .set(auth(owner))
      .send({
        listingId,
        checkIn: sixDaysAhead,
        checkOut: nineDaysAhead,
        guests: 2,
        guest: { name: 'Refund Guest', phone: '0733111222' },
        confirm: true,
      })
      .expect(201);
    const bookingId = created.body.data.id as string;

    // Seed amountPaid = KES 10,000 (1,000,000 minor units)
    await t.prisma.booking.update({
      where: { id: bookingId },
      data: { amountPaid: 1000000n },
    });

    // Cancel dry-run on MODERATE booking paid KES 10,000, 6 days before -> suggestedRefund: '1000000'
    const dryRunRes = await t
      .http()
      .post(`/api/v1/host/bookings/${bookingId}/cancel`)
      .set(auth(owner))
      .send({ dryRun: true })
      .expect(200);
    expect(dryRunRes.body.data.suggestedRefund).toBe('1000000');

    // Booking is still CONFIRMED after dryRun
    const stillConfirmed = await t
      .http()
      .get(`/api/v1/host/bookings/${bookingId}`)
      .set(auth(owner))
      .expect(200);
    expect(stillConfirmed.body.data.status).toBe('CONFIRMED');

    // Caretaker GET /host/bookings/:id has no total
    const caretakerRole = await t.prisma.role.findFirstOrThrow({
      where: { orgId, systemKey: 'CARETAKER' },
    });
    const caretakerUser = await t.prisma.user.create({
      data: {
        firstName: 'Care',
        lastName: 'Taker',
        email: 'caretaker@example.invalid',
        phone: '+254799000111',
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    await t.prisma.membership.create({
      data: {
        orgId,
        userId: caretakerUser.id,
        roleId: caretakerRole.id,
        status: 'ACTIVE',
      },
    });
    const caretaker = await login(t, 'caretaker@example.invalid');

    const caretakerView = await t
      .http()
      .get(`/api/v1/host/bookings/${bookingId}`)
      .set(auth(caretaker))
      .expect(200);
    expect(caretakerView.body.data.total).toBeUndefined();
    expect(caretakerView.body.data.guest.phone).toBeNull();

    // Check-in then check-out -> COMPLETED and creates a CleaningTask
    await t
      .http()
      .post(`/api/v1/host/bookings/${bookingId}/check-in`)
      .set(auth(owner))
      .send({})
      .expect(200);
    const checkedOut = await t
      .http()
      .post(`/api/v1/host/bookings/${bookingId}/check-out`)
      .set(auth(owner))
      .send({})
      .expect(200);
    expect(checkedOut.body.data.status).toBe('COMPLETED');

    const cleaningTask = await t.prisma.cleaningTask.findUnique({
      where: { bookingId },
    });
    expect(cleaningTask).toBeTruthy();
    expect(cleaningTask?.unitId).toBe(unitId);
    expect(cleaningTask?.status).toBe('OPEN');

    // COMPLETED -> cancel -> 409 INVALID_STATUS
    const invalidCancel = await t
      .http()
      .post(`/api/v1/host/bookings/${bookingId}/cancel`)
      .set(auth(owner))
      .send({ reason: 'Too late' })
      .expect(409);
    expect(invalidCancel.body.error.code).toBe('INVALID_STATUS');
  });
});
