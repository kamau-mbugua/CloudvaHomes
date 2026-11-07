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

// Minimal valid 1x1 PNG
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('Host site settings & listings API (e2e)', () => {
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

  it('creates a listing, manages photos and special prices, and enforces whole-shilling prices', async () => {
    const { owner } = await onboardOrg(t, admin, {
      name: 'Cozy Stays',
      ownerEmail: 'cozy@example.invalid',
      ownerPhone: '+254700000401',
      kind: 'HOST',
    });

    const prop = await t
      .http()
      .post('/api/v1/properties')
      .set(auth(owner))
      .send({ name: 'Kilimani Court', code: 'KC' })
      .expect(201);

    // Rejects non-whole-shilling price (150050 = KES 1,500.50)
    await t
      .http()
      .post('/api/v1/host/listings')
      .set(auth(owner))
      .send({
        propertyId: prop.body.data.id,
        unitNumber: 'A1',
        title: 'Sunny 1BR',
        nightlyPrice: '150050',
      })
      .expect(422);

    // Creates listing + underlying Unit
    const created = await t
      .http()
      .post('/api/v1/host/listings')
      .set(auth(owner))
      .send({
        propertyId: prop.body.data.id,
        unitNumber: 'A1',
        title: 'Sunny 1BR in Kilimani',
        description: 'Bright apartment near Yaya',
        area: 'Kilimani, Nairobi',
        bedrooms: 1,
        bathrooms: 1,
        maxGuests: 2,
        amenities: ['Wi-Fi', 'Kitchen', 'Parking'],
        nightlyPrice: '450000',
        weekendPrice: '550000',
        cleaningFee: '100000',
        weeklyDiscountBps: 1000,
        minNights: 2,
        published: true,
      })
      .expect(201);

    const listingId = created.body.data.id as string;
    expect(created.body.data.title).toBe('Sunny 1BR in Kilimani');
    expect(created.body.data.unit.number).toBe('A1');
    expect(created.body.data.nightlyPrice).toBe('450000');
    expect(created.body.data.weekendPrice).toBe('550000');
    expect(created.body.data.cleaningFee).toBe('100000');
    expect(created.body.data.published).toBe(true);

    // Upload 2 photos
    const p1 = await t
      .http()
      .post(`/api/v1/host/listings/${listingId}/photos`)
      .set(auth(owner))
      .attach('file', TINY_PNG, { filename: 'one.png', contentType: 'image/png' })
      .expect(201);
    const p2 = await t
      .http()
      .post(`/api/v1/host/listings/${listingId}/photos`)
      .set(auth(owner))
      .attach('file', TINY_PNG, { filename: 'two.png', contentType: 'image/png' })
      .expect(201);

    const photo1Id = p1.body.data.id as string;
    const photo2Id = p2.body.data.id as string;

    // Reorder so photo 2 is the cover (first)
    const reordered = await t
      .http()
      .put(`/api/v1/host/listings/${listingId}/photos/order`)
      .set(auth(owner))
      .send({ photoIds: [photo2Id, photo1Id] })
      .expect(200);
    expect(reordered.body.data.photos.map((p: { id: string }) => p.id)).toEqual([
      photo2Id,
      photo1Id,
    ]);
    expect(reordered.body.data.coverPhotoId).toBe(photo2Id);

    // Overlapping special prices → 422
    await t
      .http()
      .put(`/api/v1/host/listings/${listingId}/special-prices`)
      .set(auth(owner))
      .send({
        items: [
          { fromDate: '2026-12-20', toDate: '2026-12-26', nightlyPrice: '700000', label: 'Xmas' },
          { fromDate: '2026-12-25', toDate: '2026-12-31', nightlyPrice: '800000', label: 'NYE' },
        ],
      })
      .expect(422);

    // Valid special prices replace all
    const sp = await t
      .http()
      .put(`/api/v1/host/listings/${listingId}/special-prices`)
      .set(auth(owner))
      .send({
        items: [
          { fromDate: '2026-12-20', toDate: '2026-12-26', nightlyPrice: '700000', label: 'Xmas' },
          { fromDate: '2026-12-27', toDate: '2027-01-02', nightlyPrice: '800000', label: 'NYE' },
        ],
      })
      .expect(200);
    expect(sp.body.data.specialPrices).toHaveLength(2);
    expect(sp.body.data.specialPrices[0].nightlyPrice).toBe('700000');

    // Delete first photo and verify upload is released
    await t
      .http()
      .delete(`/api/v1/host/listings/${listingId}/photos/${photo1Id}`)
      .set(auth(owner))
      .expect(200);
    const detail = await t
      .http()
      .get(`/api/v1/host/listings/${listingId}`)
      .set(auth(owner))
      .expect(200);
    expect(detail.body.data.photos).toHaveLength(1);
    expect(detail.body.data.photos[0].id).toBe(photo2Id);
  });

  it('manages site settings, enforces slug uniqueness and 30-day previousSlug reservation', async () => {
    const { owner: host1 } = await onboardOrg(t, admin, {
      name: 'Cozy Stays',
      ownerEmail: 'host1@example.invalid',
      ownerPhone: '+254700000402',
      kind: 'HOST',
    });
    const { owner: host2 } = await onboardOrg(t, admin, {
      name: 'Other Stays',
      ownerEmail: 'host2@example.invalid',
      ownerPhone: '+254700000403',
      kind: 'HOST',
    });
    const { owner: host3 } = await onboardOrg(t, admin, {
      name: 'Third Stays',
      ownerEmail: 'host3@example.invalid',
      ownerPhone: '+254700000404',
      kind: 'HOST',
    });

    // Cannot publish site without choosing a slug first (422)
    await t
      .http()
      .patch('/api/v1/host/site')
      .set(auth(host1))
      .send({ published: true })
      .expect(422);

    // Invalid/reserved slug → 422
    await t.http().patch('/api/v1/host/site').set(auth(host1)).send({ slug: 'admin' }).expect(422);

    // Set slug to cozy-stays and publish
    const site1 = await t
      .http()
      .patch('/api/v1/host/site')
      .set(auth(host1))
      .send({
        slug: 'cozy-stays',
        published: true,
        businessName: 'Cozy Stays Nairobi',
        checkInTime: '14:00',
        checkOutTime: '11:00',
      })
      .expect(200);
    expect(site1.body.data.slug).toBe('cozy-stays');
    expect(site1.body.data.published).toBe(true);
    expect(site1.body.data.address).toBe('https://cozy-stays.localhost');

    // Second HOST org cannot take cozy-stays (409 SLUG_TAKEN)
    const conflict1 = await t
      .http()
      .patch('/api/v1/host/site')
      .set(auth(host2))
      .send({ slug: 'cozy-stays' })
      .expect(409);
    expect(conflict1.body.error.code).toBe('SLUG_TAKEN');

    // slug-check reflects unavailability
    const checkTaken = await t
      .http()
      .get('/api/v1/host/site/slug-check?slug=cozy-stays')
      .set(auth(host2))
      .expect(200);
    expect(checkTaken.body.data.available).toBe(false);

    // Host 1 renames to cozy-homes → cozy-stays moves to previousSlug for 30 days
    const renamed = await t
      .http()
      .patch('/api/v1/host/site')
      .set(auth(host1))
      .send({ slug: 'cozy-homes' })
      .expect(200);
    expect(renamed.body.data.slug).toBe('cozy-homes');

    // Third org cannot take cozy-stays during the 30-day redirect window (409 SLUG_TAKEN)
    const conflict2 = await t
      .http()
      .patch('/api/v1/host/site')
      .set(auth(host3))
      .send({ slug: 'cozy-stays' })
      .expect(409);
    expect(conflict2.body.error.code).toBe('SLUG_TAKEN');

    // Logo upload works
    const logoRes = await t
      .http()
      .post('/api/v1/host/site/logo')
      .set(auth(host1))
      .attach('file', TINY_PNG, { filename: 'logo.png', contentType: 'image/png' })
      .expect(201);
    expect(logoRes.body.data.logoUrl).toBeTruthy();
  });

  it('refuses /host/listings for a LANDLORD organisation with 409 HOST_ONLY', async () => {
    const { owner: landlord } = await onboardOrg(t, admin, {
      name: 'Regular Landlord',
      ownerEmail: 'landlord@example.invalid',
      ownerPhone: '+254700000405',
      kind: 'LANDLORD',
    });

    const res = await t.http().get('/api/v1/host/listings').set(auth(landlord)).expect(409);
    expect(res.body.error.code).toBe('HOST_ONLY');
  });

  it('tells the host whether guests can pay: no channel, then a paybill', async () => {
    const { owner } = await onboardOrg(t, admin, {
      name: 'Pay Ready Stays',
      ownerEmail: 'host-payready@example.invalid',
      ownerPhone: '+254700000405',
      kind: 'HOST',
    });
    const before = await t.http().get('/api/v1/host/site').set(auth(owner)).expect(200);
    expect(before.body.data.guestPayments).toEqual({ paybill: false, mpesaPrompt: false });

    await t
      .http()
      .post('/api/v1/payment-channels')
      .set(auth(owner))
      .send({ kind: 'MPESA_PAYBILL', name: 'Stays Paybill', shortcode: '600333' })
      .expect(201);

    const after = await t.http().get('/api/v1/host/site').set(auth(owner)).expect(200);
    expect(after.body.data.guestPayments).toEqual({ paybill: true, mpesaPrompt: false });

    const patched = await t
      .http()
      .patch('/api/v1/host/site')
      .set(auth(owner))
      .send({ businessName: 'Pay Ready Stays' })
      .expect(200);
    expect(patched.body.data.guestPayments).toEqual({ paybill: true, mpesaPrompt: false });
  });
});
