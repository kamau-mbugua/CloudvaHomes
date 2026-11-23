import {
  addMember,
  auth,
  createPlatformAdmin,
  createTestApp,
  lastCode,
  login,
  onboardOrg,
  PASSWORD,
  resetDb,
  type Session,
  stepUp,
  type TestApp,
} from './helpers.js';

const JOB_SECRET = 'account-jobs-test-secret-0123456789abcdef';
const DAY = 24 * 3600 * 1000;
const OWNER = { email: 'del-owner@example.invalid', phone: '+254700000081' };
const MANAGER = { email: 'del-manager@example.invalid', phone: '+254700000082' };

describe('Deleting your own account (e2e)', () => {
  let t: TestApp;
  let admin: Session;
  let owner: Session;
  let orgId: string;

  const del = (s: Session, headers: Record<string, string> = {}, body: object = {}) =>
    t.http().post('/api/v1/me/delete').set(auth(s)).set(headers).send(body);

  const purge = (now: Date) =>
    t
      .http()
      .post('/api/v1/internal/jobs/account-purge')
      .set('Authorization', `Bearer ${JOB_SECRET}`)
      .send({ now: now.toISOString() });

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
    await createPlatformAdmin(t.prisma);
    admin = await login(t, 'admin@example.invalid');
    ({ owner, orgId } = await onboardOrg(t, admin, {
      name: 'Deletion Org',
      ownerEmail: OWNER.email,
      ownerPhone: OWNER.phone,
    }));
  });

  it('needs a fresh one-time code first', async () => {
    const res = await del(owner);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('STEP_UP_REQUIRED');
  });

  it("won't leave an organisation without an owner", async () => {
    const header = await stepUp(t, owner, OWNER.phone);
    const res = await del(owner, { 'X-Step-Up': header });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SOLE_OWNER');
    expect(res.body.error.message).toContain('Deletion Org');
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email: OWNER.email } });
    expect(user.deletedAt).toBeNull();
  });

  it('KodiHQ team accounts are not closed from the app', async () => {
    const adminUser = await t.prisma.user.findUniqueOrThrow({
      where: { email: 'admin@example.invalid' },
    });
    await t.prisma.user.update({ where: { id: adminUser.id }, data: { phone: '+254700000089' } });
    const header = await stepUp(t, admin, '+254700000089');
    const res = await del(admin, { 'X-Step-Up': header });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PLATFORM_ACCOUNT');
  });

  it('a team member deletes their account: signed out everywhere, sign-in details gone, records kept', async () => {
    const manager = await addMember(t, owner, { ...MANAGER, role: 'MANAGER' });
    const header = await stepUp(t, manager, MANAGER.phone);
    await del(manager, { 'X-Step-Up': header }, { reason: 'Changed jobs' }).expect(204);

    // The access token stops working at once, and the password no longer signs in.
    await t.http().get('/api/v1/me').set(auth(manager)).expect(401);
    await t
      .http()
      .post('/api/v1/auth/login')
      .send({ identifier: MANAGER.email, password: PASSWORD })
      .expect(401);

    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: manager.userId } });
    expect(row).toMatchObject({
      status: 'DISABLED',
      email: null,
      phone: null,
      passwordHash: null,
      deletedEmail: MANAGER.email,
      deletedPhone: MANAGER.phone,
      deletionReason: 'Changed jobs',
    });
    expect(row.deletedAt).toBeInstanceOf(Date);
    const membership = await t.prisma.membership.findFirstOrThrow({
      where: { userId: manager.userId, orgId },
    });
    expect(membership.status).toBe('INACTIVE');
    expect(
      await t.prisma.refreshToken.count({ where: { userId: manager.userId, revokedAt: null } }),
    ).toBe(0);
    const audit = await t.prisma.auditLog.findFirstOrThrow({
      where: { action: 'user.account_delete', entityId: manager.userId },
    });
    expect(audit.after).toEqual({ hadEmail: true, hadPhone: true, gaveReason: true });

    // The email is free again: the owner can invite the same person afresh.
    const again = await addMember(t, owner, { ...MANAGER, role: 'MANAGER' });
    expect(again.userId).not.toBe(manager.userId);
  });

  it('a tenant deletes their login; the organisation keeps the tenant record, and they can come back', async () => {
    const p = (
      await t
        .http()
        .post('/api/v1/properties')
        .set(auth(owner))
        .send({ name: 'Del Court', code: 'DEL' })
        .expect(201)
    ).body.data;
    await t
      .http()
      .post('/api/v1/units/bulk')
      .set(auth(owner))
      .send({ propertyId: p.id, numbers: ['D1'], rentAmount: 1_000_000 })
      .expect(201);
    const units = (
      await t.http().get(`/api/v1/units?propertyId=${p.id}`).set(auth(owner)).expect(200)
    ).body.data;
    const tenancy = (
      await t
        .http()
        .post('/api/v1/tenancies')
        .set(auth(owner))
        .send({
          unitId: units[0].id,
          tenant: { firstName: 'Tess', lastName: 'T', phone: '0711000801' },
          startDate: '2026-11-01',
          billingDay: 1,
        })
        .expect(201)
    ).body.data;
    const tenantId: string = tenancy.tenant.id;

    const signIn = async (): Promise<Session> => {
      await t.http().post('/api/v1/auth/otp/request').send({ phone: '0711000801' }).expect(202);
      const res = await t
        .http()
        .post('/api/v1/auth/otp/verify')
        .send({ phone: '0711000801', code: lastCode('+254711000801') })
        .expect(200);
      return { token: res.body.data.accessToken, refreshCookie: null, body: res.body.data };
    };

    const tess = await signIn();
    const firstUserId = (await t.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }))
      .userId;
    expect(firstUserId).toBeTruthy();

    const header = await stepUp(t, tess, '+254711000801');
    await del(tess, { 'X-Step-Up': header }).expect(204);
    const record = await t.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(record).toMatchObject({ userId: null, phone: '+254711000801', firstName: 'Tess' });

    // Signing in again later is a new login, linked to the same tenant record.
    const back = await signIn();
    expect(back.body).toMatchObject({ tenantOf: [expect.objectContaining({ tenantId })] });
    const relinked = await t.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(relinked.userId).not.toBe(firstUserId);
  });

  it('the purge job erases a deleted account after 30 days, once', async () => {
    const manager = await addMember(t, owner, { ...MANAGER, role: 'MANAGER' });
    const header = await stepUp(t, manager, MANAGER.phone);
    await del(manager, { 'X-Step-Up': header }, { reason: 'Changed jobs' }).expect(204);
    const deletedAt = (await t.prisma.user.findUniqueOrThrow({ where: { id: manager.userId } }))
      .deletedAt!;
    const audits = await t.prisma.auditLog.count({ where: { entityId: manager.userId } });

    // Day 29: still within the grace period, nothing changes.
    const early = await purge(new Date(deletedAt.getTime() + 29 * DAY)).expect(200);
    expect(early.body.data).toEqual({ purged: 0 });
    expect(await t.prisma.user.findUniqueOrThrow({ where: { id: manager.userId } })).toMatchObject({
      firstName: 'Mem',
      deletedEmail: MANAGER.email,
      purgedAt: null,
    });

    // Day 31: erased. The row stays for the records and the audit log that point at it.
    const later = new Date(deletedAt.getTime() + 31 * DAY);
    expect((await purge(later).expect(200)).body.data).toEqual({ purged: 1 });
    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: manager.userId } });
    expect(row).toMatchObject({
      firstName: 'Deleted',
      lastName: 'user',
      email: null,
      phone: null,
      deletedEmail: null,
      deletedPhone: null,
      deletionReason: null,
      lastLoginAt: null,
      purgedAt: later,
    });
    expect(await t.prisma.refreshToken.count({ where: { userId: manager.userId } })).toBe(0);
    expect(await t.prisma.otpCode.count({ where: { userId: manager.userId } })).toBe(0);
    expect(await t.prisma.membership.count({ where: { userId: manager.userId } })).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { entityId: manager.userId } })).toBe(audits + 1);

    // Running again changes nothing.
    expect((await purge(new Date(later.getTime() + DAY)).expect(200)).body.data).toEqual({
      purged: 0,
    });
  });

  it('the purge job needs the scheduler token and leaves live accounts alone', async () => {
    await t.http().post('/api/v1/internal/jobs/account-purge').send({}).expect(401);
    expect((await purge(new Date(Date.now() + 365 * DAY)).expect(200)).body.data).toEqual({
      purged: 0,
    });
    expect(await t.prisma.user.findUniqueOrThrow({ where: { email: OWNER.email } })).toMatchObject({
      firstName: 'Olive',
      purgedAt: null,
    });
  });
});
