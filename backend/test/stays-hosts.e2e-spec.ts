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

describe('HOST organisations, roles & billing (e2e)', () => {
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
    await t.prisma.platformSettings.upsert({
      where: { id: 1 },
      create: { id: 1, allowPublicSignup: true },
      update: { allowPublicSignup: true },
    });
  });

  it('registers a HOST organisation and seeds its HostSite row', async () => {
    const res = await t
      .http()
      .post('/api/v1/auth/register')
      .send({
        organizationName: 'Nairobi Cozy Stays',
        organizationKind: 'HOST',
        phone: '+254700000201',
        email: 'host1@example.invalid',
        firstName: 'Hilda',
        lastName: 'Host',
        password: PASSWORD,
      })
      .expect(201);

    expect(res.body.data.activeOrganization.kind).toBe('HOST');

    const me = await t.http().get('/api/v1/me').set(auth(res.body.data.accessToken)).expect(200);
    expect(me.body.data.activeOrganization.kind).toBe('HOST');

    const site = await t.prisma.hostSite.findUnique({
      where: { orgId: res.body.data.activeOrganization.id },
    });
    expect(site).toBeTruthy();
    expect(site?.businessName).toBe('Nairobi Cozy Stays');
    expect(site?.published).toBe(false);
    expect(site?.slug).toBeNull();
  });

  it('refuses creating a tenancy inside a HOST organisation with 409 HOST_ORG_NO_TENANCIES', async () => {
    const { owner } = await onboardOrg(t, admin, {
      name: 'Beach Stays',
      ownerEmail: 'beach@example.invalid',
      ownerPhone: '+254700000202',
      kind: 'HOST',
    });

    const prop = await t
      .http()
      .post('/api/v1/properties')
      .set(auth(owner))
      .send({ name: 'Beach House', code: 'BH' })
      .expect(201);

    const unit = await t
      .http()
      .post('/api/v1/units')
      .set(auth(owner))
      .send({ propertyId: prop.body.data.id, number: 'U1', rentAmount: 0 })
      .expect(201);

    const res = await t
      .http()
      .post('/api/v1/tenancies')
      .set(auth(owner))
      .send({
        unitId: unit.body.data.id,
        rentAmount: 1000000,
        startDate: '2026-11-01',
        tenant: {
          firstName: 'Tom',
          lastName: 'Tenant',
          phone: '+254700000299',
        },
      })
      .expect(409);

    expect(res.body.error.code).toBe('HOST_ORG_NO_TENANCIES');
    expect(res.body.error.message).toBe("Short-stay hosts don't have tenancies");
  });

  it('lets one phone number that is a HOST member and a tenant elsewhere sign in once and see both', async () => {
    const sharedPhone = '+254700000203';
    const sharedEmail = 'dual@example.invalid';

    // 1. Register as a HOST owner with sharedPhone
    const hostReg = await t
      .http()
      .post('/api/v1/auth/register')
      .send({
        organizationName: 'Dual Host BNB',
        organizationKind: 'HOST',
        phone: sharedPhone,
        email: sharedEmail,
        firstName: 'Diana',
        lastName: 'Dual',
        password: PASSWORD,
      })
      .expect(201);
    const hostUserId = hostReg.body.data.user.id;

    // 2. A landlord organisation has a tenant linked to that same userId
    const { orgId: landlordOrgId } = await onboardOrg(t, admin, {
      name: 'Mainline Apartments',
      ownerEmail: 'landlord@example.invalid',
      ownerPhone: '+254700000204',
      kind: 'LANDLORD',
    });
    const prop = await t.prisma.property.create({
      data: { orgId: landlordOrgId, name: 'Mainline', code: 'ML' },
    });
    const unit = await t.prisma.unit.create({
      data: { orgId: landlordOrgId, propertyId: prop.id, number: 'B2', rentAmount: 2500000n },
    });
    const tenant = await t.prisma.tenant.create({
      data: {
        orgId: landlordOrgId,
        userId: hostUserId,
        code: 'T00001',
        firstName: 'Diana',
        lastName: 'Dual',
        phone: sharedPhone,
        email: sharedEmail,
      },
    });
    await t.prisma.tenancy.create({
      data: {
        orgId: landlordOrgId,
        tenantId: tenant.id,
        unitId: unit.id,
        rentAmount: 2500000n,
        billingDay: 1,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        status: 'ACTIVE',
      },
    });

    // 3. Sign in once and inspect /me
    const session = await login(t, sharedPhone, PASSWORD);
    const me = await t.http().get('/api/v1/me').set(auth(session)).expect(200);
    expect(me.body.data.organizations).toHaveLength(1);
    expect(me.body.data.organizations[0].kind).toBe('HOST');
    expect(me.body.data.tenantOf).toHaveLength(1);
    expect(me.body.data.tenantOf[0].tenantId).toBe(tenant.id);
  });

  it('bills a HOST organisation per published listing in the monthly run', async () => {
    const plan = await t.prisma.plan.create({
      data: {
        name: 'Host Plan',
        pricePerUnit: 50000n, // KES 500 per published listing
        minimumMonthly: 0n,
        trialDays: 0,
        isDefault: true,
        active: true,
      },
    });
    await t.prisma.platformSettings.update({
      where: { id: 1 },
      data: { defaultPlanId: plan.id },
    });

    const { orgId } = await onboardOrg(t, admin, {
      name: 'Savanna Stays',
      ownerEmail: 'savanna@example.invalid',
      ownerPhone: '+254700000205',
      kind: 'HOST',
    });
    await t.prisma.organization.update({
      where: { id: orgId },
      data: { status: 'ACTIVE', trialEndsAt: null },
    });

    const prop = await t.prisma.property.create({
      data: { orgId, name: 'Savanna Suites', code: 'SS' },
    });

    for (const [idx, pub] of [true, true, false].entries()) {
      const u = await t.prisma.unit.create({
        data: { orgId, propertyId: prop.id, number: `S${idx + 1}`, rentAmount: 0n },
      });
      await t.prisma.listing.create({
        data: {
          orgId,
          unitId: u.id,
          propertyId: prop.id,
          title: `Suite ${idx + 1}`,
          maxGuests: 2,
          nightlyPrice: 400000n,
          published: pub,
        },
      });
    }

    const runRes = await t
      .http()
      .post('/api/v1/platform/invoices/run')
      .set(auth(admin))
      .send({ period: '2026-09' })
      .expect(200);
    expect(runRes.body.data.created).toBe(1);

    const inv = await t.prisma.platformInvoice.findFirstOrThrow({
      where: { orgId, period: '2026-09' },
    });
    expect(inv.occupiedUnits).toBe(2);
    expect(inv.total).toBe(100000n);
  });
});
