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
  });
});
