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

function latestOtpFromSms(phone: string): string {
  for (let i = outbox.length - 1; i >= 0; i--) {
    const s = outbox[i]!;
    if (s.channel === 'sms' && s.to === phone) {
      const m = /\b(\d{6})\b/.exec(s.text);
      if (m) return m[1]!;
    }
  }
  throw new Error(`No 6-digit OTP found in outbox for ${phone}`);
}

describe('Stays — Guests and cleaning tasks (e2e)', () => {
  let t: TestApp;
  let admin: Session;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t?.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    outbox.length = 0;
    await createPlatformAdmin(t.prisma);
    admin = await login(t, 'admin@example.invalid');
  });

  it('lists cleaning tasks after check-out with nextCheckIn, caretaker marks done and gets 403 on guests, and PATCH guest seals idNumber and enforces doNotAccept', async () => {
    const { orgId, owner } = await onboardOrg(t, admin, {
      name: 'Kilifi Stays',
      ownerEmail: 'host-ops@example.invalid',
      ownerPhone: '+254719222333',
      kind: 'HOST',
    });

    const propRes = await t
      .http()
      .post('/api/v1/properties')
      .set(auth(owner))
      .send({ name: 'Bofa Beach', code: 'BFB', county: 'Kilifi' })
      .expect(201);
    const propertyId = propRes.body.data.id as string;

    const listRes = await t
      .http()
      .post('/api/v1/host/listings')
      .set(auth(owner))
      .send({
        propertyId,
        unitNumber: 'C1',
        title: 'Bofa Cottage',
        maxGuests: 4,
        bedrooms: 2,
        bathrooms: 2,
        nightlyPrice: '500000',
        cleaningFee: '50000',
        minNights: 1,
        published: true,
      })
      .expect(201);
    const listingId = listRes.body.data.id as string;
    const unitId = listRes.body.data.unitId as string;

    // Publish site on INSTANT mode
    await t
      .http()
      .patch('/api/v1/host/site')
      .set(auth(owner))
      .send({
        slug: 'kilifi-stays',
        businessName: 'Kilifi Stays',
        published: true,
        rules: {
          bookingMode: 'INSTANT',
          payWhen: 'ON_ARRIVAL',
          cancellation: 'FLEXIBLE',
        },
      })
      .expect(200);

    // Create two stays: first 2026-12-01..2026-12-03, next check-in 2026-12-05..2026-12-07
    const b1 = await t
      .http()
      .post('/api/v1/host/bookings')
      .set(auth(owner))
      .send({
        listingId,
        checkIn: '2026-12-01',
        checkOut: '2026-12-03',
        guests: 2,
        guest: { name: 'Grace Njeri', phone: '+254722333444', email: 'grace@example.invalid' },
        confirm: true,
      })
      .expect(201);
    const booking1Id = b1.body.data.id as string;
    const guestId = b1.body.data.guest.id as string;

    await t
      .http()
      .post('/api/v1/host/bookings')
      .set(auth(owner))
      .send({
        listingId,
        checkIn: '2026-12-05',
        checkOut: '2026-12-07',
        guests: 2,
        guest: { name: 'Peter Otieno', phone: '+254722555666' },
        confirm: true,
      })
      .expect(201);

    // Check-in and check-out booking 1 -> creates OPEN cleaning task
    await t
      .http()
      .post(`/api/v1/host/bookings/${booking1Id}/check-in`)
      .set(auth(owner))
      .send({})
      .expect(200);
    await t
      .http()
      .post(`/api/v1/host/bookings/${booking1Id}/check-out`)
      .set(auth(owner))
      .send({})
      .expect(200);

    // Set up Caretaker session
    const caretakerRole = await t.prisma.role.findFirstOrThrow({
      where: { orgId, systemKey: 'CARETAKER' },
    });
    const caretakerUser = await t.prisma.user.create({
      data: {
        firstName: 'Sam',
        lastName: 'Caretaker',
        email: 'caretaker-ops@example.invalid',
        phone: '+254799000222',
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
    const caretaker = await login(t, 'caretaker-ops@example.invalid');

    // Caretaker lists OPEN cleaning tasks -> sees task with nextCheckIn = 2026-12-05
    const openRes = await t
      .http()
      .get('/api/v1/host/cleaning?status=OPEN')
      .set(auth(caretaker))
      .expect(200);
    expect(openRes.body.data).toHaveLength(1);
    const task = openRes.body.data[0];
    expect(task.unit.id).toBe(unitId);
    expect(task.nextCheckIn).toBe('2026-12-05');

    // Caretaker marks task done
    const doneRes = await t
      .http()
      .post(`/api/v1/host/cleaning/${task.id}/done`)
      .set(auth(caretaker))
      .send({ note: 'Fresh linens and towels ready' })
      .expect(200);
    expect(doneRes.body.data.status).toBe('DONE');
    expect(doneRes.body.data.note).toBe('Fresh linens and towels ready');

    // Caretaker creates an ad-hoc cleaning task
    const adhocRes = await t
      .http()
      .post('/api/v1/host/cleaning')
      .set(auth(caretaker))
      .send({ unitId, note: 'Deep clean patio' })
      .expect(201);
    expect(adhocRes.body.data.status).toBe('OPEN');

    // Caretaker GET /host/guests -> 403
    await t.http().get('/api/v1/host/guests').set(auth(caretaker)).expect(403);

    // Owner lists guests and fetches guest detail
    const guestsList = await t
      .http()
      .get('/api/v1/host/guests?q=Grace')
      .set(auth(owner))
      .expect(200);
    expect(guestsList.body.data).toHaveLength(1);
    expect(guestsList.body.data[0].name).toBe('Grace Njeri');
    expect(guestsList.body.data[0].stays).toBe(1);

    // Owner PATCHes guest with idNumber and doNotAccept: true
    const patched = await t
      .http()
      .patch(`/api/v1/host/guests/${guestId}`)
      .set(auth(owner))
      .send({
        notes: 'Left the AC running',
        doNotAccept: true,
        idNumber: '29384756',
      })
      .expect(200);
    expect(patched.body.data.doNotAccept).toBe(true);
    expect(patched.body.data.notes).toBe('Left the AC running');
    expect(patched.body.data.idNumberHint).toContain('756');
    expect(patched.body.data.idNumber).toBeUndefined();
    expect(patched.body.data.idNumberEnc).toBeUndefined();

    const detail = await t
      .http()
      .get(`/api/v1/host/guests/${guestId}`)
      .set(auth(owner))
      .expect(200);
    expect(detail.body.data.stays).toHaveLength(1);
    expect(detail.body.data.idNumberHint).toContain('756');
    expect(detail.body.data.idNumber).toBeUndefined();

    // Now Grace books on the INSTANT site -> becomes REQUESTED because doNotAccept is true
    await t
      .http()
      .post('/api/v1/public/sites/kilifi-stays/verify')
      .send({ phone: '+254722333444' })
      .expect(202);
    const otp = latestOtpFromSms('+254722333444');
    const pubBook = await t
      .http()
      .post('/api/v1/public/sites/kilifi-stays/bookings')
      .send({
        listingId,
        checkIn: '2026-12-10',
        checkOut: '2026-12-12',
        guests: 1,
        name: 'Grace Njeri',
        phone: '+254722333444',
        code: otp,
      })
      .expect(201);
    expect(pubBook.body.data.status).toBe('REQUESTED');
  });

  it('guest list and detail respect property limits and hide money from roles without stay-payments:view', async () => {
    const { orgId, owner } = await onboardOrg(t, admin, {
      name: 'Twin Stays',
      ownerEmail: 'host-twin@example.invalid',
      ownerPhone: '+254719444555',
      kind: 'HOST',
    });
    const api = (path: string) => `/api/v1${path}`;
    const mkListing = async (name: string, code: string) => {
      const prop = await t
        .http()
        .post(api('/properties'))
        .set(auth(owner))
        .send({ name, code })
        .expect(201);
      const listing = await t
        .http()
        .post(api('/host/listings'))
        .set(auth(owner))
        .send({
          propertyId: prop.body.data.id,
          unitNumber: 'U1',
          title: `${name} Studio`,
          maxGuests: 2,
          bedrooms: 1,
          bathrooms: 1,
          nightlyPrice: '300000',
          cleaningFee: '0',
          minNights: 1,
        })
        .expect(201);
      return { propertyId: prop.body.data.id as string, listingId: listing.body.data.id as string };
    };
    const a = await mkListing('Alpha House', 'ALP');
    const b = await mkListing('Beta House', 'BET');
    const book = async (
      listingId: string,
      name: string,
      phone: string,
      checkIn: string,
      checkOut: string,
    ) => {
      const res = await t
        .http()
        .post(api('/host/bookings'))
        .set(auth(owner))
        .send({ listingId, checkIn, checkOut, guests: 1, guest: { name, phone }, confirm: true })
        .expect(201);
      await t
        .http()
        .post(api(`/host/bookings/${res.body.data.id}/payments`))
        .set(auth(owner))
        .send({ method: 'CASH', amount: '300000' })
        .expect(201);
      return res.body.data.guest.id as string;
    };
    const both = await book(
      a.listingId,
      'Both Places',
      '+254733000111',
      '2026-12-01',
      '2026-12-02',
    );
    await book(b.listingId, 'Both Places', '+254733000111', '2026-12-05', '2026-12-06');
    await book(b.listingId, 'Beta Only', '+254733000222', '2026-12-10', '2026-12-11');

    const role = await t.prisma.role.create({
      data: { orgId, name: 'Front desk', permissions: ['guests:view'] },
    });
    const user = await t.prisma.user.create({
      data: {
        firstName: 'Fran',
        lastName: 'Desk',
        email: 'frontdesk@example.invalid',
        phone: '+254799000333',
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    await t.prisma.membership.create({
      data: {
        orgId,
        userId: user.id,
        roleId: role.id,
        status: 'ACTIVE',
        propertyIds: [a.propertyId],
      },
    });
    const desk = await login(t, 'frontdesk@example.invalid');

    const list = await t.http().get(api('/host/guests')).set(auth(desk)).expect(200);
    expect(list.body.data.map((g: { name: string }) => g.name)).toEqual(['Both Places']);
    expect(list.body.data[0].stays).toBe(1);
    expect(list.body.data[0].totalPaid).toBeUndefined();

    const detail = await t
      .http()
      .get(api(`/host/guests/${both}`))
      .set(auth(desk))
      .expect(200);
    expect(detail.body.data.stays).toHaveLength(1);
    expect(detail.body.data.stays[0].property.name).toBe('Alpha House');
    expect(detail.body.data.totalPaid).toBeUndefined();
    expect(detail.body.data.stays[0].total).toBeUndefined();
    expect(detail.body.data.stays[0].amountPaid).toBeUndefined();

    // The owner still sees everything, money included.
    const ownerDetail = await t
      .http()
      .get(api(`/host/guests/${both}`))
      .set(auth(owner))
      .expect(200);
    expect(ownerDetail.body.data.stays).toHaveLength(2);
    expect(ownerDetail.body.data.totalPaid).toBe('600000');
  });
});
