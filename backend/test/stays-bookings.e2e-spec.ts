import { hashPassword } from '../src/modules/auth/crypto.js';
import { smsKes } from '../src/common/money/money.js';
import { outbox } from '../src/modules/notifications/senders.js';
import { nairobiToday } from '../src/modules/stays/bookings/booking-view.js';
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
        m.text.includes(
          'your stay at Coral Reef Villa, 1 Dec to 4 Dec is confirmed. Booking B00001',
        ),
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

    // …and can't price stays either: quoting is for making bookings (bookings:create).
    await t
      .http()
      .post('/api/v1/host/bookings/quote')
      .set(auth(caretaker))
      .send({ listingId, checkIn: '2026-12-10', checkOut: '2026-12-13', guests: 2 })
      .expect(403);
    expect(caretakerView.body.data.guest.phone).toBeNull();

    // Check-in then check-out -> COMPLETED and creates a CleaningTask. Check-in is only
    // allowed on a night of the stay, so the stay is moved to start today.
    await t.prisma.booking.update({
      where: { id: bookingId },
      data: { checkIn: new Date(`${nairobiToday()}T00:00:00Z`) },
    });
    // Check-in is allowed with a balance; check-out waits until the stay is paid in full.
    const checkedIn = await t
      .http()
      .post(`/api/v1/host/bookings/${bookingId}/check-in`)
      .set(auth(owner))
      .send({})
      .expect(200);
    const owed = BigInt(checkedIn.body.data.total) - 1_000_000n;
    expect(owed).toBeGreaterThan(0n);
    expect(checkedIn.body.data.owed).toBe(owed.toString());
    const unpaid = await t
      .http()
      .post(`/api/v1/host/bookings/${bookingId}/check-out`)
      .set(auth(owner))
      .send({})
      .expect(409);
    expect(unpaid.body.error.code).toBe('BALANCE_DUE');
    expect(unpaid.body.error.message).toBe(
      `${smsKes(owed)} is still owed on this stay. Record the payment, or write off the balance, before checking the guest out.`,
    );
    await t.prisma.booking.update({
      where: { id: bookingId },
      data: { amountPaid: BigInt(checkedIn.body.data.total) },
    });
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

  it('allows a no-show only from the check-in day, then frees the dates', async () => {
    const { owner, listingId } = await setupHost();
    const today = nairobiToday();
    const day = (n: number) => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const book = async (checkIn: string, checkOut: string) =>
      (
        await t
          .http()
          .post('/api/v1/host/bookings')
          .set(auth(owner))
          .send({
            listingId,
            checkIn,
            checkOut,
            guests: 2,
            guest: { name: 'Late Guest', phone: '0733111223' },
            confirm: true,
          })
          .expect(201)
      ).body.data.id as string;

    const future = await book(day(5), day(7));
    const early = await t
      .http()
      .post(`/api/v1/host/bookings/${future}/no-show`)
      .set(auth(owner))
      .send({})
      .expect(409);
    expect(early.body.error.code).toBe('TOO_EARLY');
    expect(early.body.error.message).toBe(
      `You can mark a no-show from the check-in day (${day(5)}).`,
    );

    const arriving = await book(today, day(2));
    const marked = await t
      .http()
      .post(`/api/v1/host/bookings/${arriving}/no-show`)
      .set(auth(owner))
      .send({})
      .expect(200);
    expect(marked.body.data.status).toBe('NO_SHOW');

    // The nights are free again.
    await book(today, day(2));
  });

  it('writes off what a checked-in guest owes, so the stay can be checked out', async () => {
    const { owner, listingId } = await setupHost();
    const today = nairobiToday();
    const inTwoDays = new Date(`${today}T00:00:00Z`);
    inTwoDays.setUTCDate(inTwoDays.getUTCDate() + 2);
    const created = await t
      .http()
      .post('/api/v1/host/bookings')
      .set(auth(owner))
      .send({
        listingId,
        checkIn: today,
        checkOut: inTwoDays.toISOString().slice(0, 10),
        guests: 2,
        guest: { name: 'Gone Guest', phone: '0733111225' },
        confirm: true,
      })
      .expect(201);
    const id = created.body.data.id as string;
    const total = BigInt(created.body.data.total);
    const post = (path: string, body: object, status: number) =>
      t
        .http()
        .post(`/api/v1/host/bookings/${id}/${path}`)
        .set(auth(owner))
        .send(body)
        .expect(status);

    // Only a checked-in stay can be written off.
    const notYet = await post('write-off', { reason: 'Left without paying' }, 409);
    expect(notYet.body.error.code).toBe('INVALID_STATUS');
    await post('check-in', {}, 200);

    await post('write-off', { reason: '  ' }, 422);
    const written = await post('write-off', { reason: 'Left without paying' }, 200);
    expect(written.body.data.owed).toBe('0');
    expect(written.body.data.amountPaid).toBe('0');
    expect(written.body.data.writeOff).toMatchObject({
      amount: total.toString(),
      reason: 'Left without paying',
    });
    const again = await post('write-off', { reason: 'Left without paying' }, 409);
    expect(again.body.error.code).toBe('NOTHING_OWED');

    // The guest pays KES 5,000 later: it comes off the write-off, and nothing is owed.
    await post('payments', { method: 'CASH', amount: '500000' }, 201);
    const after = await t.prisma.booking.findUniqueOrThrow({ where: { id } });
    expect(after.amountPaid).toBe(500_000n);
    expect(after.amountWrittenOff).toBe(total - 500_000n);

    const audit = await t.prisma.auditLog.findFirst({
      where: { entityId: id, action: 'booking.balance_written_off' },
    });
    expect(audit).toBeTruthy();

    const out = await post('check-out', {}, 200);
    expect(out.body.data.status).toBe('COMPLETED');
  });

  it('allows check-in only on a night of the stay', async () => {
    const { owner, listingId } = await setupHost();
    const today = nairobiToday();
    const day = (n: number) => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const book = async (checkIn: string, checkOut: string) =>
      (
        await t
          .http()
          .post('/api/v1/host/bookings')
          .set(auth(owner))
          .send({
            listingId,
            checkIn,
            checkOut,
            guests: 2,
            guest: { name: 'Early Guest', phone: '0733111224' },
            confirm: true,
          })
          .expect(201)
      ).body.data.id as string;
    const checkIn = (id: string, status: number) =>
      t
        .http()
        .post(`/api/v1/host/bookings/${id}/check-in`)
        .set(auth(owner))
        .send({})
        .expect(status);

    // Today's guest can.
    const arriving = await book(today, day(1));
    const done = await checkIn(arriving, 200);
    expect(done.body.data.status).toBe('CHECKED_IN');

    // Tomorrow's guest can't be checked in today.
    const tomorrow = await book(day(1), day(3));
    const early = await checkIn(tomorrow, 409);
    expect(early.body.error.code).toBe('TOO_EARLY');
    expect(early.body.error.message).toBe(
      `You can check the guest in from the check-in day (${day(1)}).`,
    );

    // A stay that is already over can't be checked in either.
    const ended = await book(day(10), day(12));
    await t.prisma.booking.update({
      where: { id: ended },
      data: {
        checkIn: new Date(`${day(-3)}T00:00:00Z`),
        checkOut: new Date(`${today}T00:00:00Z`),
      },
    });
    const late = await checkIn(ended, 409);
    expect(late.body.error.code).toBe('STAY_ENDED');
  });
});
