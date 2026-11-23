import {
  auth,
  createPlatformAdmin,
  createTestApp,
  lastCode,
  login,
  onboardOrg,
  resetDb,
  type Session,
  stepUp,
  type TestApp,
} from './helpers.js';

const OWNER = { email: 'pw-owner@example.invalid', phone: '+254700000071' };
const NEW_PASSWORD = 'Tenant-chose-this-2026';

describe('A first password for code-only sign-ins (e2e)', () => {
  let t: TestApp;
  let owner: Session;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    const admin = await login(t, 'admin@example.invalid');
    ({ owner } = await onboardOrg(t, admin, {
      name: 'Password Org',
      ownerEmail: OWNER.email,
      ownerPhone: OWNER.phone,
    }));
  });

  async function codeOnlyTenant(): Promise<Session> {
    const p = (
      await t
        .http()
        .post('/api/v1/properties')
        .set(auth(owner))
        .send({ name: 'Pw Court', code: 'PWC' })
        .expect(201)
    ).body.data;
    await t
      .http()
      .post('/api/v1/units/bulk')
      .set(auth(owner))
      .send({ propertyId: p.id, numbers: ['P1'], rentAmount: 1_000_000 })
      .expect(201);
    const units = (
      await t.http().get(`/api/v1/units?propertyId=${p.id}`).set(auth(owner)).expect(200)
    ).body.data;
    await t
      .http()
      .post('/api/v1/tenancies')
      .set(auth(owner))
      .send({
        unitId: units[0].id,
        tenant: { firstName: 'Pia', lastName: 'T', phone: '0711000901' },
        startDate: '2026-11-01',
        billingDay: 1,
      })
      .expect(201);
    await t.http().post('/api/v1/auth/otp/request').send({ phone: '0711000901' }).expect(202);
    const res = await t
      .http()
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '0711000901', code: lastCode('+254711000901') })
      .expect(200);
    return { token: res.body.data.accessToken, refreshCookie: null, body: res.body.data };
  }

  it('the session says whether there is a password', async () => {
    expect(owner.body).toMatchObject({ user: { hasPassword: true } });
    const pia = await codeOnlyTenant();
    expect(pia.body).toMatchObject({ user: { hasPassword: false } });
  });

  it('sets a first password with a one-time code, then signs in with it', async () => {
    const pia = await codeOnlyTenant();
    const without = await t
      .http()
      .post('/api/v1/me/password')
      .set(auth(pia))
      .send({ newPassword: NEW_PASSWORD });
    expect(without.status).toBe(403);
    expect(without.body.error.code).toBe('STEP_UP_REQUIRED');

    const header = await stepUp(t, pia, '+254711000901');
    await t
      .http()
      .post('/api/v1/me/password')
      .set(auth(pia))
      .set('X-Step-Up', header)
      .send({ newPassword: NEW_PASSWORD })
      .expect(204);

    const signedIn = await login(t, '0711000901', NEW_PASSWORD);
    expect(signedIn.body).toMatchObject({ user: { hasPassword: true } });
    expect(await t.prisma.auditLog.count({ where: { action: 'auth.password_set' } })).toBe(1);
  });

  it('someone with a password still needs the current one', async () => {
    const res = await t
      .http()
      .post('/api/v1/me/password')
      .set(auth(owner))
      .send({ newPassword: NEW_PASSWORD });
    expect(res.status).toBe(422);
  });
});
