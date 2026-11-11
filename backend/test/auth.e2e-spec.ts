import { outbox } from '../src/modules/notifications/senders.js';
import {
  auth,
  clearRateLimits,
  createPlatformAdmin,
  createTestApp,
  lastCode,
  lastInviteToken,
  login,
  onboardOrg,
  PASSWORD,
  refreshCookieFrom,
  resetDb,
  type Session,
  type TestApp,
} from './helpers.js';

const OWNER_EMAIL = 'owner@example.invalid';
const OWNER_PHONE = '+254700000003';

describe('Auth (e2e)', () => {
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

  describe('password login', () => {
    it('returns the same 401 for a wrong password and an unknown account', async () => {
      const wrong = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ identifier: 'admin@example.invalid', password: 'nope-nope-nope' })
        .expect(401);
      const unknown = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ identifier: 'ghost@example.invalid', password: 'nope-nope-nope' })
        .expect(401);
      expect(wrong.body.error).toEqual(unknown.body.error);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('web: sets an httpOnly SameSite=Strict refresh cookie scoped to /api/v1/auth, no token in body', async () => {
      const res = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ identifier: 'admin@example.invalid', password: PASSWORD })
        .expect(200);
      const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith('hodi_rt='),
      )!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
      expect(res.body.data.refreshToken).toBeUndefined();
      expect(res.body.data.user.isPlatformAdmin).toBe(true);
    });

    it('mobile: returns the refresh token in the body and sets no cookie', async () => {
      const res = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ identifier: 'admin@example.invalid', password: PASSWORD, client: 'mobile' })
        .expect(200);
      expect(res.body.data.refreshToken).toEqual(expect.any(String));
      expect(refreshCookieFrom(res)).toBeNull();
    });

    it('accepts any Kenyan phone format', async () => {
      for (const phone of ['0700000099', '254700000099', '+254 700 000 099']) {
        await login(t, phone);
      }
    });

    it('rate limits repeated failures with 429 and Retry-After', async () => {
      for (let i = 0; i < 5; i++) {
        await t
          .http()
          .post('/api/v1/auth/login')
          .send({ identifier: 'admin@example.invalid', password: 'wrong-wrong-1' })
          .expect(401);
      }
      const res = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ identifier: 'admin@example.invalid', password: PASSWORD })
        .expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('refresh tokens', () => {
    const refresh = (cookie: string) =>
      t.http().post('/api/v1/auth/refresh').set('Cookie', cookie).send({});

    it('rotates on every use', async () => {
      const first = await refresh(admin.refreshCookie!).expect(200);
      const second = refreshCookieFrom(first)!;
      expect(second).not.toEqual(admin.refreshCookie);
      await refresh(second).expect(200);
    });

    it('tolerates a near-simultaneous double use (two tabs) within the grace window', async () => {
      await refresh(admin.refreshCookie!).expect(200);
      await refresh(admin.refreshCookie!).expect(200);
    });

    it('treats reuse after the grace window as theft: the whole session is revoked', async () => {
      const rotated = refreshCookieFrom(await refresh(admin.refreshCookie!).expect(200))!;
      await t.prisma.refreshToken.updateMany({
        where: { usedAt: { not: null } },
        data: { usedAt: new Date(Date.now() - 60_000) },
      });
      const stolen = await refresh(admin.refreshCookie!).expect(401);
      expect(stolen.body.error.code).toBe('SESSION_REVOKED');
      // The legitimate holder's newer token is dead too, and so is the access token.
      await refresh(rotated).expect(401);
      const me = await t.http().get('/api/v1/me').set(auth(admin)).expect(401);
      expect(me.body.error.code).toBe('SESSION_REVOKED');
    });

    it('logout revokes the session and clears the cookie', async () => {
      const res = await t
        .http()
        .post('/api/v1/auth/logout')
        .set('Cookie', admin.refreshCookie!)
        .send({})
        .expect(204);
      expect((res.headers['set-cookie'] as unknown as string[]).join()).toMatch(/hodi_rt=;/);
      await refresh(admin.refreshCookie!).expect(401);
      await t.http().get('/api/v1/me').set(auth(admin)).expect(401);
    });

    it('mobile refresh works with the token in the body', async () => {
      const res = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ identifier: 'admin@example.invalid', password: PASSWORD, client: 'mobile' });
      const next = await t
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: res.body.data.refreshToken })
        .expect(200);
      expect(next.body.data.refreshToken).toEqual(expect.any(String));
    });

    it('rejects tampered and missing access tokens', async () => {
      await t.http().get('/api/v1/me').expect(401);
      await t
        .http()
        .get('/api/v1/me')
        .set(auth(`${admin.token}x`))
        .expect(401);
    });
  });

  describe('phone OTP login', () => {
    beforeEach(async () => {
      await onboardOrg(t, admin, {
        name: 'Acme Homes',
        ownerEmail: OWNER_EMAIL,
        ownerPhone: OWNER_PHONE,
      });
      outbox.length = 0;
    });

    it('does not reveal unknown numbers (202, nothing sent)', async () => {
      await t.http().post('/api/v1/auth/otp/request').send({ phone: '0799999999' }).expect(202);
      expect(outbox).toHaveLength(0);
    });

    it('signs in with the code once; the code cannot be reused', async () => {
      await t.http().post('/api/v1/auth/otp/request').send({ phone: '0700000003' }).expect(202);
      const code = lastCode(OWNER_PHONE);
      const res = await t
        .http()
        .post('/api/v1/auth/otp/verify')
        .send({ phone: '0700000003', code })
        .expect(200);
      expect(res.body.data.activeOrganization.name).toBe('Acme Homes');
      const again = await t
        .http()
        .post('/api/v1/auth/otp/verify')
        .send({ phone: '0700000003', code })
        .expect(401);
      expect(again.body.error.code).toBe('INVALID_CODE');
    });

    it('burns the code after 5 wrong attempts', async () => {
      await t.http().post('/api/v1/auth/otp/request').send({ phone: OWNER_PHONE }).expect(202);
      const code = lastCode(OWNER_PHONE);
      const wrong = code === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) {
        await t
          .http()
          .post('/api/v1/auth/otp/verify')
          .send({ phone: OWNER_PHONE, code: wrong })
          .expect(401);
      }
      await t.http().post('/api/v1/auth/otp/verify').send({ phone: OWNER_PHONE, code }).expect(401);
    });

    it('a newer code replaces the older one', async () => {
      await t.http().post('/api/v1/auth/otp/request').send({ phone: OWNER_PHONE }).expect(202);
      const old = lastCode(OWNER_PHONE);
      await t.http().post('/api/v1/auth/otp/request').send({ phone: OWNER_PHONE }).expect(202);
      const fresh = lastCode(OWNER_PHONE);
      if (old !== fresh) {
        await t
          .http()
          .post('/api/v1/auth/otp/verify')
          .send({ phone: OWNER_PHONE, code: old })
          .expect(401);
      }
      await t
        .http()
        .post('/api/v1/auth/otp/verify')
        .send({ phone: OWNER_PHONE, code: fresh })
        .expect(200);
    });

    it('signs in with a one-time code sent to an email address', async () => {
      await t.http().post('/api/v1/auth/otp/request').send({ phone: OWNER_EMAIL }).expect(202);
      const code = lastCode(OWNER_EMAIL);
      const res = await t
        .http()
        .post('/api/v1/auth/otp/verify')
        .send({ phone: OWNER_EMAIL, code })
        .expect(200);
      expect(res.body.data.activeOrganization.name).toBe('Acme Homes');
    });

    it('lets a newly created tenant set their password via forgot-password email OTP or sign in by email code', async () => {
      const { owner } = await onboardOrg(t, admin, {
        name: 'Sunrise Homes',
        ownerEmail: 'sunrise@example.invalid',
        ownerPhone: '+254700000044',
      });
      outbox.length = 0;

      const tenantEmail = 'grace.tenant@example.invalid';
      await t
        .http()
        .post('/api/v1/tenants')
        .set(auth(owner))
        .send({
          firstName: 'Grace',
          lastName: 'Wanjiku',
          phone: '0712333444',
          email: tenantEmail,
        })
        .expect(201);

      const welcome = outbox.find(
        (m): m is Extract<(typeof outbox)[number], { channel: 'email' }> =>
          m.channel === 'email' && m.to === tenantEmail,
      );
      expect(welcome).toBeDefined();
      expect(welcome!.text).toContain(
        `/forgot-password?identifier=${encodeURIComponent(tenantEmail)}`,
      );

      // Tenant requests password reset using their email -> receives OTP email
      await t
        .http()
        .post('/api/v1/auth/password/forgot')
        .send({ identifier: tenantEmail })
        .expect(202);
      const resetCode = lastCode(tenantEmail);
      await t
        .http()
        .post('/api/v1/auth/password/reset')
        .send({
          identifier: tenantEmail,
          code: resetCode,
          newPassword: 'Grace-new-password-2026',
        })
        .expect(204);

      // Tenant can sign in with their newly set password
      const pwLogin = await login(t, tenantEmail, 'Grace-new-password-2026');
      expect(pwLogin.body).toMatchObject({
        tenantOf: [expect.objectContaining({ name: 'Grace Wanjiku' })],
      });

      // Tenant can also sign in with a 6-digit code sent to their email
      await t.http().post('/api/v1/auth/otp/request').send({ phone: tenantEmail }).expect(202);
      const emailOtp = lastCode(tenantEmail);
      const otpLogin = await t
        .http()
        .post('/api/v1/auth/otp/verify')
        .send({ phone: tenantEmail, code: emailOtp })
        .expect(200);
      expect(otpLogin.body.data.tenantOf).toHaveLength(1);
    });

    it('prevents account takeover via unverified tenant contact fields (C1 email & phone variants)', async () => {
      const { owner } = await onboardOrg(t, admin, {
        name: 'Attacker Org',
        ownerEmail: 'attacker-org@example.invalid',
        ownerPhone: '+254700000055',
      });
      outbox.length = 0;

      // Variant 1: Attacker creates a tenant using the platform admin's phone (+254700000099)
      // and an attacker-controlled email address.
      const attackerEmail = 'attacker-takeover@evil.invalid';
      await t
        .http()
        .post('/api/v1/tenants')
        .set(auth(owner))
        .send({
          firstName: 'Fake',
          lastName: 'Tenant',
          phone: '0700000099',
          email: attackerEmail,
        })
        .expect(201);
      outbox.length = 0;

      // Requesting login OTP or password reset for attackerEmail must NOT resolve to the victim
      // or send any OTP code.
      await t.http().post('/api/v1/auth/otp/request').send({ phone: attackerEmail }).expect(202);
      await t
        .http()
        .post('/api/v1/auth/password/forgot')
        .send({ identifier: attackerEmail })
        .expect(202);
      expect(outbox.filter((m) => m.to === attackerEmail)).toHaveLength(0);

      // Victim's email and phone remain unchanged
      const adminUser = await t.prisma.user.findUniqueOrThrow({
        where: { email: 'admin@example.invalid' },
      });
      expect(adminUser.email).toBe('admin@example.invalid');
      expect(adminUser.phone).toBe('+254700000099');

      // Variant 2: Victim is an email-only user (phone is null). Attacker creates a tenant
      // with victim's email and an attacker-controlled phone, then grants portal access.
      const emailOnlyVictim = await t.prisma.user.create({
        data: {
          email: 'victim-no-phone@example.invalid',
          phone: null,
          firstName: 'Vera',
          lastName: 'Victim',
        },
      });
      const attackerPhone = '+254799888777';
      const createdTenant = await t
        .http()
        .post('/api/v1/tenants')
        .set(auth(owner))
        .send({
          firstName: 'Vera',
          lastName: 'Clone',
          phone: attackerPhone,
          email: 'victim-no-phone@example.invalid',
        })
        .expect(201);
      await t
        .http()
        .post(`/api/v1/tenants/${createdTenant.body.data.id}/portal-access`)
        .set(auth(owner))
        .expect(200);
      outbox.length = 0;

      // Victim's phone must still be null (never backfilled from unverified tenant data)
      const refreshedVictim = await t.prisma.user.findUniqueOrThrow({
        where: { id: emailOnlyVictim.id },
      });
      expect(refreshedVictim.phone).toBeNull();
    });
  });

  describe('password reset', () => {
    it('resets by email code, signs out everywhere, and the new password works', async () => {
      await t
        .http()
        .post('/api/v1/auth/password/forgot')
        .send({ identifier: 'admin@example.invalid' })
        .expect(202);
      const code = lastCode('admin@example.invalid');
      await t
        .http()
        .post('/api/v1/auth/password/reset')
        .send({ identifier: 'admin@example.invalid', code, newPassword: 'short' })
        .expect(422);
      await t
        .http()
        .post('/api/v1/auth/password/reset')
        .send({ identifier: 'admin@example.invalid', code, newPassword: 'A-brand-new-password' })
        .expect(204);
      await t.http().get('/api/v1/me').set(auth(admin)).expect(401);
      await clearRateLimits(t.prisma);
      await login(t, 'admin@example.invalid', 'A-brand-new-password');
    });

    it('always answers 202 for unknown accounts', async () => {
      await t
        .http()
        .post('/api/v1/auth/password/forgot')
        .send({ identifier: 'nobody@example.invalid' })
        .expect(202);
      expect(outbox.filter((m) => m.to === 'nobody@example.invalid')).toHaveLength(0);
    });
  });

  describe('invitations', () => {
    it('previews, requires a password for new accounts, and works only once', async () => {
      await t
        .http()
        .post('/api/v1/platform/organizations')
        .set(auth(admin))
        .send({
          name: 'Beta Lets',
          kind: 'AGENCY',
          phone: '0711000000',
          email: 'office@example.invalid',
          owner: { firstName: 'Bo', lastName: 'B', email: OWNER_EMAIL },
        })
        .expect(201);
      const token = lastInviteToken(OWNER_EMAIL);
      const preview = await t.http().get(`/api/v1/auth/invitations/${token}`).expect(200);
      expect(preview.body.data).toMatchObject({
        organizationName: 'Beta Lets',
        hasPassword: false,
        inviterName: 'Platform Admin',
      });

      const noPw = await t
        .http()
        .post('/api/v1/auth/invitations/accept')
        .send({ token })
        .expect(422);
      expect(noPw.body.error.details[0].field).toBe('password');

      const res = await t
        .http()
        .post('/api/v1/auth/invitations/accept')
        .send({ token, password: PASSWORD })
        .expect(200);
      expect(res.body.data.activeOrganization.name).toBe('Beta Lets');
      expect(res.body.data.permissions).toContain('roles:update');

      const reuse = await t
        .http()
        .post('/api/v1/auth/invitations/accept')
        .send({ token, password: PASSWORD })
        .expect(410);
      expect(reuse.body.error.code).toBe('INVITATION_INVALID');
    });

    it('only platform admins can onboard organisations', async () => {
      const { owner } = await onboardOrg(t, admin, {
        name: 'Acme Homes',
        ownerEmail: OWNER_EMAIL,
        ownerPhone: OWNER_PHONE,
      });
      await t
        .http()
        .post('/api/v1/platform/organizations')
        .set(auth(owner))
        .send({
          name: 'Sneaky',
          kind: 'LANDLORD',
          phone: '0711000000',
          email: 'x@example.invalid',
          owner: { firstName: 'X', lastName: 'Y', email: 'x2@example.invalid' },
        })
        .expect(403);
    });

    it('accepts my own pending invitation while signed in and switches into it', async () => {
      const { owner } = await onboardOrg(t, admin, {
        name: 'Makini Homes',
        ownerEmail: OWNER_EMAIL,
        ownerPhone: OWNER_PHONE,
      });

      const uzuri = (
        await t
          .http()
          .post('/api/v1/platform/organizations')
          .set(auth(admin))
          .send({
            name: 'Uzuri Stays',
            kind: 'HOST',
            phone: '0711000030',
            email: 'uzuri30@example.invalid',
            owner: {
              firstName: 'Olive',
              lastName: 'Owner',
              email: OWNER_EMAIL,
              phone: OWNER_PHONE,
            },
          })
          .expect(201)
      ).body.data;

      const me = (await t.http().get('/api/v1/me').set(auth(owner)).expect(200)).body.data;
      const membershipId: string = me.invitations[0].membershipId;

      const res = await t
        .http()
        .post(`/api/v1/auth/memberships/${membershipId}/accept`)
        .set(auth(owner))
        .send({})
        .expect(200);

      expect(res.body.data.activeOrganization.id).toBe(uzuri.id);
      expect(res.body.data.user.defaultPlace).toBe('STAFF');
      expect(res.body.data.user.defaultOrgId).toBe(uzuri.id);
      expect(res.body.data.invitations).toEqual([]);

      const membership = await t.prisma.membership.findUniqueOrThrow({
        where: { id: membershipId },
      });
      expect(membership.status).toBe('ACTIVE');
      expect(membership.joinedAt).not.toBeNull();

      const invRows = await t.prisma.invitation.findMany({ where: { membershipId } });
      expect(invRows).toHaveLength(1);
      expect(invRows[0]!.acceptedAt).not.toBeNull();

      const audit = await t.prisma.auditLog.findFirst({
        where: { action: 'user.invitation_accept', entityId: membershipId },
      });
      expect(audit).toMatchObject({
        entity: 'membership',
        orgId: uzuri.id,
        actorId: owner.body.user.id,
      });

      const again = await t
        .http()
        .post(`/api/v1/auth/memberships/${membershipId}/accept`)
        .set(auth(owner))
        .send({})
        .expect(410);
      expect(again.body.error.code).toBe('INVITATION_INVALID');
    });

    it("refuses someone else's, an expired or a revoked invitation", async () => {
      const { owner } = await onboardOrg(t, admin, {
        name: 'Makini Homes',
        ownerEmail: OWNER_EMAIL,
        ownerPhone: OWNER_PHONE,
      });

      const otherOrg = (
        await t
          .http()
          .post('/api/v1/platform/organizations')
          .set(auth(admin))
          .send({
            name: 'Other Org',
            kind: 'LANDLORD',
            phone: '0711000031',
            email: 'other31@example.invalid',
            owner: {
              firstName: 'Other',
              lastName: 'Person',
              email: 'other-owner@example.invalid',
              phone: '+254700000031',
            },
          })
          .expect(201)
      ).body.data;
      const otherMembership = await t.prisma.membership.findFirstOrThrow({
        where: { orgId: otherOrg.id },
      });

      const expiredOrg = (
        await t
          .http()
          .post('/api/v1/platform/organizations')
          .set(auth(admin))
          .send({
            name: 'Expired Org',
            kind: 'AGENCY',
            phone: '0711000032',
            email: 'expired32@example.invalid',
            owner: {
              firstName: 'Olive',
              lastName: 'Owner',
              email: OWNER_EMAIL,
              phone: OWNER_PHONE,
            },
          })
          .expect(201)
      ).body.data;
      const expiredMembership = await t.prisma.membership.findFirstOrThrow({
        where: { orgId: expiredOrg.id },
      });
      await t.prisma.invitation.updateMany({
        where: { membershipId: expiredMembership.id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      const revokedOrg = (
        await t
          .http()
          .post('/api/v1/platform/organizations')
          .set(auth(admin))
          .send({
            name: 'Revoked Org',
            kind: 'HOST',
            phone: '0711000033',
            email: 'revoked33@example.invalid',
            owner: {
              firstName: 'Olive',
              lastName: 'Owner',
              email: OWNER_EMAIL,
              phone: OWNER_PHONE,
            },
          })
          .expect(201)
      ).body.data;
      const revokedMembership = await t.prisma.membership.findFirstOrThrow({
        where: { orgId: revokedOrg.id },
      });
      await t.prisma.invitation.updateMany({
        where: { membershipId: revokedMembership.id },
        data: { revokedAt: new Date() },
      });

      await t
        .http()
        .post(`/api/v1/auth/memberships/${otherMembership.id}/accept`)
        .set(auth(owner))
        .send({})
        .expect(404);

      const expRes = await t
        .http()
        .post(`/api/v1/auth/memberships/${expiredMembership.id}/accept`)
        .set(auth(owner))
        .send({})
        .expect(410);
      expect(expRes.body.error.code).toBe('INVITATION_INVALID');

      const revRes = await t
        .http()
        .post(`/api/v1/auth/memberships/${revokedMembership.id}/accept`)
        .set(auth(owner))
        .send({})
        .expect(410);
      expect(revRes.body.error.code).toBe('INVITATION_INVALID');

      expect(
        (await t.prisma.membership.findUniqueOrThrow({ where: { id: expiredMembership.id } }))
          .status,
      ).toBe('INVITED');
      expect(
        (await t.prisma.membership.findUniqueOrThrow({ where: { id: revokedMembership.id } }))
          .status,
      ).toBe('INVITED');
    });
  });

  describe('remembered place', () => {
    it('saves the place and home and returns them on the next sign-in (another device)', async () => {
      const { owner } = await onboardOrg(t, admin, {
        name: 'Makini Homes',
        ownerEmail: OWNER_EMAIL,
        ownerPhone: OWNER_PHONE,
      });
      const { owner: landlord } = await onboardOrg(t, admin, {
        name: 'Baraka Estates',
        ownerEmail: 'baraka@example.invalid',
        ownerPhone: '+254700000004',
      });
      const prop = (
        await t
          .http()
          .post('/api/v1/properties')
          .set(auth(landlord))
          .send({ name: 'Baraka Court', code: 'BAR' })
          .expect(201)
      ).body.data;
      await t
        .http()
        .post('/api/v1/units/bulk')
        .set(auth(landlord))
        .send({ propertyId: prop.id, numbers: ['B1'], rentAmount: 2_000_000 })
        .expect(201);
      const units = (
        await t.http().get(`/api/v1/units?propertyId=${prop.id}`).set(auth(landlord)).expect(200)
      ).body.data;
      const tenancy = (
        await t
          .http()
          .post('/api/v1/tenancies')
          .set(auth(landlord))
          .send({
            unitId: units[0].id,
            tenant: {
              firstName: 'Olive',
              lastName: 'Owner',
              phone: OWNER_PHONE,
              email: OWNER_EMAIL,
            },
            startDate: '2026-11-01',
            billingDay: 1,
          })
          .expect(201)
      ).body.data;

      const me = (await t.http().get('/api/v1/me').set(auth(owner)).expect(200)).body.data;
      const tenantId: string = me.tenantOf[0].tenantId;

      const switched = await t
        .http()
        .post('/api/v1/auth/switch-context')
        .set(auth(owner))
        .send({ tenantId, homeId: tenancy.id, place: 'TENANT' })
        .expect(200);
      expect(switched.body.data.user.defaultPlace).toBe('TENANT');
      expect(switched.body.data.user.defaultHomeId).toBe(tenancy.id);

      const secondDevice = await login(t, OWNER_EMAIL);
      expect(secondDevice.body.user).toMatchObject({
        defaultPlace: 'TENANT',
        defaultHomeId: tenancy.id,
      });

      const allHomes = await t
        .http()
        .post('/api/v1/auth/switch-context')
        .set(auth(owner))
        .send({ tenantId: null, homeId: null, place: 'TENANT' })
        .expect(200);
      expect(allHomes.body.data.user).toMatchObject({
        defaultPlace: 'TENANT',
        defaultTenantId: null,
        defaultHomeId: null,
      });
    });

    it('refuses a place the person does not have', async () => {
      const { owner } = await onboardOrg(t, admin, {
        name: 'Makini Homes',
        ownerEmail: OWNER_EMAIL,
        ownerPhone: OWNER_PHONE,
      });
      const prop = (
        await t
          .http()
          .post('/api/v1/properties')
          .set(auth(owner))
          .send({ name: 'Makini Court', code: 'MAK' })
          .expect(201)
      ).body.data;
      await t
        .http()
        .post('/api/v1/units/bulk')
        .set(auth(owner))
        .send({ propertyId: prop.id, numbers: ['M1'], rentAmount: 1_500_000 })
        .expect(201);
      const units = (
        await t.http().get(`/api/v1/units?propertyId=${prop.id}`).set(auth(owner)).expect(200)
      ).body.data;
      const someoneElseTenancy = (
        await t
          .http()
          .post('/api/v1/tenancies')
          .set(auth(owner))
          .send({
            unitId: units[0].id,
            tenant: {
              firstName: 'Sam',
              lastName: 'Renter',
              phone: '+254700000019',
              email: 'sam@example.invalid',
            },
            startDate: '2026-11-01',
            billingDay: 1,
          })
          .expect(201)
      ).body.data;

      await t
        .http()
        .post('/api/v1/auth/switch-context')
        .set(auth(owner))
        .send({ place: 'PLATFORM' })
        .expect(404);
      await t
        .http()
        .post('/api/v1/auth/switch-context')
        .set(auth(owner))
        .send({ place: 'TENANT' })
        .expect(404);
      await t
        .http()
        .post('/api/v1/auth/switch-context')
        .set(auth(owner))
        .send({ place: 'OWNER' })
        .expect(404);
      await t
        .http()
        .post('/api/v1/auth/switch-context')
        .set(auth(owner))
        .send({ homeId: someoneElseTenancy.id })
        .expect(404);
    });

    it('a home must belong to the tenant account sent with it', async () => {
      const { owner } = await onboardOrg(t, admin, {
        name: 'Makini Homes',
        ownerEmail: OWNER_EMAIL,
        ownerPhone: OWNER_PHONE,
      });
      // The same person rents one home from each of two landlords: two tenant accounts.
      const rentFrom = async (name: string, email: string, phone: string, code: string) => {
        const { owner: landlord } = await onboardOrg(t, admin, {
          name,
          ownerEmail: email,
          ownerPhone: phone,
        });
        const prop = (
          await t
            .http()
            .post('/api/v1/properties')
            .set(auth(landlord))
            .send({ name: `${name} Court`, code })
            .expect(201)
        ).body.data;
        await t
          .http()
          .post('/api/v1/units/bulk')
          .set(auth(landlord))
          .send({ propertyId: prop.id, numbers: [`${code}1`], rentAmount: 2_000_000 })
          .expect(201);
        const units = (
          await t.http().get(`/api/v1/units?propertyId=${prop.id}`).set(auth(landlord)).expect(200)
        ).body.data;
        const created = (
          await t
            .http()
            .post('/api/v1/tenancies')
            .set(auth(landlord))
            .send({
              unitId: units[0].id,
              tenant: {
                firstName: 'Olive',
                lastName: 'Owner',
                phone: OWNER_PHONE,
                email: OWNER_EMAIL,
              },
              startDate: '2026-11-01',
              billingDay: 1,
            })
            .expect(201)
        ).body.data as { id: string };
        const row = await t.prisma.tenancy.findUniqueOrThrow({ where: { id: created.id } });
        return { id: row.id, tenantId: row.tenantId };
      };
      const homeA = await rentFrom(
        'Baraka Estates',
        'baraka@example.invalid',
        '+254700000004',
        'BAR',
      );
      const homeB = await rentFrom(
        'Tumaini Estates',
        'tumaini@example.invalid',
        '+254700000005',
        'TUM',
      );
      expect(homeA.tenantId).not.toBe(homeB.tenantId);

      const switchTo = (body: object) =>
        t.http().post('/api/v1/auth/switch-context').set(auth(owner)).send(body);

      // Mismatched pairs are refused and nothing is saved.
      await switchTo({ tenantId: homeA.tenantId, homeId: homeB.id, place: 'TENANT' }).expect(404);
      await switchTo({ tenantId: null, homeId: homeA.id, place: 'TENANT' }).expect(404);
      const me = (await t.http().get('/api/v1/me').set(auth(owner)).expect(200)).body.data;
      expect(me.user).toMatchObject({ defaultHomeId: null, defaultTenantId: null });

      // A home alone brings its own tenant account with it.
      const picked = (await switchTo({ homeId: homeB.id, place: 'TENANT' }).expect(200)).body.data;
      expect(picked.activeTenantId).toBe(homeB.tenantId);
      expect(picked.user).toMatchObject({
        defaultHomeId: homeB.id,
        defaultTenantId: homeB.tenantId,
      });
    });

    it('lists pending invitations and omits accepted or expired ones', async () => {
      const { owner } = await onboardOrg(t, admin, {
        name: 'Makini Homes',
        ownerEmail: OWNER_EMAIL,
        ownerPhone: OWNER_PHONE,
      });

      const uzuri = (
        await t
          .http()
          .post('/api/v1/platform/organizations')
          .set(auth(admin))
          .send({
            name: 'Uzuri Stays',
            kind: 'HOST',
            phone: '0711000021',
            email: 'uzuri-office@example.invalid',
            owner: {
              firstName: 'Olive',
              lastName: 'Owner',
              email: OWNER_EMAIL,
              phone: OWNER_PHONE,
            },
          })
          .expect(201)
      ).body.data;
      const uzuriToken = lastInviteToken(OWNER_EMAIL);

      const expiredOrg = (
        await t
          .http()
          .post('/api/v1/platform/organizations')
          .set(auth(admin))
          .send({
            name: 'Expired Estates',
            kind: 'AGENCY',
            phone: '0711000022',
            email: 'expired-office@example.invalid',
            owner: {
              firstName: 'Olive',
              lastName: 'Owner',
              email: OWNER_EMAIL,
              phone: OWNER_PHONE,
            },
          })
          .expect(201)
      ).body.data;
      await t.prisma.invitation.updateMany({
        where: { orgId: expiredOrg.id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      const me = (await t.http().get('/api/v1/me').set(auth(owner)).expect(200)).body.data;
      expect(me.invitations).toEqual([
        {
          membershipId: expect.any(String),
          organization: { id: uzuri.id, name: 'Uzuri Stays', kind: 'HOST' },
          roleName: 'Owner',
        },
      ]);

      const accepted = await t
        .http()
        .post('/api/v1/auth/invitations/accept')
        .send({ token: uzuriToken })
        .expect(200);
      expect(accepted.body.data.invitations).toEqual([]);
    });
  });
});
