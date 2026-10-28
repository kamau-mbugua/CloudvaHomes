import {
  acceptInvite,
  addMember,
  auth,
  createPlatformAdmin,
  createTestApp,
  login,
  onboardOrg,
  roleId,
  resetDb,
  type Session,
  stepUp,
  type TestApp,
} from './helpers.js';

const A_OWNER = { email: 'owner-a@example.invalid', phone: '+254700000010' };
const B_OWNER = { email: 'owner-b@example.invalid', phone: '+254700000020' };

describe('Access control (e2e)', () => {
  let t: TestApp;
  let admin: Session;
  let orgA: string;
  let ownerA: Session;
  let orgB: string;
  let ownerB: Session;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    admin = await login(t, 'admin@example.invalid');
    ({ orgId: orgA, owner: ownerA } = await onboardOrg(t, admin, {
      name: 'Org A',
      ownerEmail: A_OWNER.email,
      ownerPhone: A_OWNER.phone,
    }));
    ({ orgId: orgB, owner: ownerB } = await onboardOrg(t, admin, {
      name: 'Org B',
      ownerEmail: B_OWNER.email,
      ownerPhone: B_OWNER.phone,
      kind: 'AGENCY',
    }));
  });

  describe('permissions', () => {
    it('an accountant gets 403 on admin screens but can read organisation settings', async () => {
      const acc = await addMember(t, ownerA, { email: 'acc@example.invalid', role: 'ACCOUNTANT' });
      expect(acc.body.permissions).toContain('payments:create');
      expect(acc.body.permissions).not.toContain('users:view');

      const users = await t.http().get('/api/v1/users').set(auth(acc)).expect(403);
      expect(users.body.error.code).toBe('PERMISSION_DENIED');
      await t.http().get('/api/v1/roles').set(auth(acc)).expect(403);
      await t.http().get('/api/v1/audit-logs').set(auth(acc)).expect(403);
      await t.http().get('/api/v1/organization').set(auth(acc)).expect(200);
      await t
        .http()
        .patch('/api/v1/organization')
        .set(auth(acc))
        .send({ name: 'Hacked' })
        .expect(403);
    });

    it('a role change applies on the next request, without a new token', async () => {
      const acc = await addMember(t, ownerA, { email: 'acc@example.invalid', role: 'ACCOUNTANT' });
      const accountantRole = await roleId(t, ownerA, 'ACCOUNTANT');
      const header = await stepUp(t, ownerA, A_OWNER.phone);
      await t
        .http()
        .patch(`/api/v1/roles/${accountantRole}`)
        .set(auth(ownerA))
        .set('X-Step-Up', header)
        .send({ permissions: ['users:view'] })
        .expect(200);
      await t.http().get('/api/v1/users').set(auth(acc)).expect(200);
      // users:view alone is enough to list roles (needed for the role pickers)
      await t.http().get('/api/v1/roles').set(auth(acc)).expect(200);
      await t
        .http()
        .post('/api/v1/roles')
        .set(auth(acc))
        .send({ name: 'X', permissions: [] })
        .expect(403);
    });

    it('a deactivated member loses organisation access immediately', async () => {
      const acc = await addMember(t, ownerA, { email: 'acc@example.invalid', role: 'ACCOUNTANT' });
      await t
        .http()
        .patch(`/api/v1/users/${acc.userId}`)
        .set(auth(ownerA))
        .send({ status: 'INACTIVE' })
        .expect(200);
      const res = await t.http().get('/api/v1/organization').set(auth(acc)).expect(403);
      expect(res.body.error.code).toBe('NO_ACTIVE_ORGANIZATION');
    });
  });

  describe('step-up', () => {
    it('changing a member’s role needs a fresh one-time code', async () => {
      const acc = await addMember(t, ownerA, { email: 'acc@example.invalid', role: 'ACCOUNTANT' });
      const manager = await roleId(t, ownerA, 'MANAGER');

      const denied = await t
        .http()
        .patch(`/api/v1/users/${acc.userId}`)
        .set(auth(ownerA))
        .send({ roleId: manager })
        .expect(403);
      expect(denied.body.error.code).toBe('STEP_UP_REQUIRED');

      const header = await stepUp(t, ownerA, A_OWNER.phone);
      const ok = await t
        .http()
        .patch(`/api/v1/users/${acc.userId}`)
        .set(auth(ownerA))
        .set('X-Step-Up', header)
        .send({ roleId: manager })
        .expect(200);
      expect(ok.body.data.role.name).toBe('Manager');
    });

    it('a step-up token is bound to its session', async () => {
      const header = await stepUp(t, ownerA, A_OWNER.phone);
      const other = await login(t, A_OWNER.email);
      const acc = await addMember(t, ownerA, { email: 'acc@example.invalid', role: 'ACCOUNTANT' });
      const res = await t
        .http()
        .delete(`/api/v1/users/${acc.userId}`)
        .set(auth(other))
        .set('X-Step-Up', header)
        .expect(403);
      expect(res.body.error.code).toBe('STEP_UP_REQUIRED');
    });
  });

  describe('owners', () => {
    it('you cannot change your own role or remove yourself', async () => {
      const me = ownerA.body.user.id;
      const r = await t
        .http()
        .patch(`/api/v1/users/${me}`)
        .set(auth(ownerA))
        .send({ status: 'INACTIVE' })
        .expect(403);
      expect(r.body.error.code).toBe('CANNOT_CHANGE_SELF');
      await t.http().delete(`/api/v1/users/${me}`).set(auth(ownerA)).expect(403);
    });

    it('the last active owner cannot be deactivated', async () => {
      const manager = await addMember(t, ownerA, { email: 'mgr@example.invalid', role: 'MANAGER' });
      const res = await t
        .http()
        .patch(`/api/v1/users/${ownerA.body.user.id}`)
        .set(auth(manager))
        .send({ status: 'INACTIVE' })
        .expect(409);
      expect(res.body.error.code).toBe('LAST_OWNER');
    });
  });

  describe('roles', () => {
    it('custom role lifecycle: create, reject unknown permissions, block delete while in use', async () => {
      const created = await t
        .http()
        .post('/api/v1/roles')
        .set(auth(ownerA))
        .send({ name: 'Viewer', permissions: ['reports:view', 'invoices:view'] })
        .expect(201);
      const id = created.body.data.id;
      await t
        .http()
        .post('/api/v1/roles')
        .set(auth(ownerA))
        .send({ name: 'viewer', permissions: [] })
        .expect(409);
      const bad = await t
        .http()
        .post('/api/v1/roles')
        .set(auth(ownerA))
        .send({ name: 'Bad', permissions: ['bank:rob'] })
        .expect(422);
      expect(bad.body.error.details[0].field).toBe('permissions');

      await t
        .http()
        .post('/api/v1/users/invitations')
        .set(auth(ownerA))
        .send({ firstName: 'V', lastName: 'W', email: 'v@example.invalid', roleId: id })
        .expect(201);
      const inUse = await t.http().delete(`/api/v1/roles/${id}`).set(auth(ownerA)).expect(409);
      expect(inUse.body.error.code).toBe('ROLE_IN_USE');
    });

    it('the Owner role is immutable and built-in roles cannot be deleted', async () => {
      const owner = await roleId(t, ownerA, 'OWNER');
      const caretaker = await roleId(t, ownerA, 'CARETAKER');
      const header = await stepUp(t, ownerA, A_OWNER.phone);
      await t
        .http()
        .patch(`/api/v1/roles/${owner}`)
        .set(auth(ownerA))
        .set('X-Step-Up', header)
        .send({ permissions: [] })
        .expect(403);
      await t.http().delete(`/api/v1/roles/${caretaker}`).set(auth(ownerA)).expect(403);
    });

    it('serves the permission catalogue to any member', async () => {
      const res = await t.http().get('/api/v1/permissions').set(auth(ownerA)).expect(200);
      expect(res.body.data.map((g: { group: string }) => g.group)).toContain('money');
    });
  });

  describe('organisation switching', () => {
    it('a member of two organisations can switch, and refresh keeps the choice', async () => {
      // Owner A is invited into org B as an accountant.
      const accountantB = await roleId(t, ownerB, 'ACCOUNTANT');
      await t
        .http()
        .post('/api/v1/users/invitations')
        .set(auth(ownerB))
        .send({ firstName: 'Olive', lastName: 'Owner', email: A_OWNER.email, roleId: accountantB })
        .expect(201);
      const accepted = await acceptInvite(t, A_OWNER.email);
      expect(accepted.body.organizations).toHaveLength(2);

      const session = await login(t, A_OWNER.email);
      const switched = await t
        .http()
        .post('/api/v1/auth/switch-org')
        .set(auth(session))
        .send({ organizationId: orgB })
        .expect(200);
      expect(switched.body.data.activeOrganization.id).toBe(orgB);
      expect(switched.body.data.permissions).not.toContain('users:view');

      const refreshed = await t
        .http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', session.refreshCookie!)
        .send({})
        .expect(200);
      expect(refreshed.body.data.activeOrganization.id).toBe(orgB);
    });

    it('cannot switch into an organisation you are not a member of', async () => {
      await t
        .http()
        .post('/api/v1/auth/switch-org')
        .set(auth(ownerA))
        .send({ organizationId: orgB })
        .expect(404);
    });
  });

  describe('cross-organisation isolation', () => {
    it('ids from another organisation behave exactly like missing ids (404)', async () => {
      const bRole = await roleId(t, ownerB, 'MANAGER');
      const bOwnerId = ownerB.body.user.id;
      const header = await stepUp(t, ownerA, A_OWNER.phone);

      await t.http().get(`/api/v1/roles/${bRole}`).set(auth(ownerA)).expect(404);
      await t
        .http()
        .patch(`/api/v1/roles/${bRole}`)
        .set(auth(ownerA))
        .set('X-Step-Up', header)
        .send({ description: 'x' })
        .expect(404);
      await t.http().delete(`/api/v1/roles/${bRole}`).set(auth(ownerA)).expect(404);
      await t
        .http()
        .patch(`/api/v1/users/${bOwnerId}`)
        .set(auth(ownerA))
        .send({ status: 'INACTIVE' })
        .expect(404);
      await t
        .http()
        .delete(`/api/v1/users/${bOwnerId}`)
        .set(auth(ownerA))
        .set('X-Step-Up', header)
        .expect(404);
      await t
        .http()
        .post(`/api/v1/users/${bOwnerId}/invitation/resend`)
        .set(auth(ownerA))
        .expect(404);
      // Inviting with another org's role id must not attach it.
      await t
        .http()
        .post('/api/v1/users/invitations')
        .set(auth(ownerA))
        .send({ firstName: 'X', lastName: 'Y', email: 'x@example.invalid', roleId: bRole })
        .expect(422);
    });

    it('lists only show the caller’s organisation', async () => {
      const users = await t.http().get('/api/v1/users').set(auth(ownerA)).expect(200);
      expect(users.body.data.map((u: { email: string }) => u.email)).toEqual([A_OWNER.email]);

      const roles = await t.http().get('/api/v1/roles').set(auth(ownerA)).expect(200);
      expect(roles.body.data).toHaveLength(4);

      const audit = await t
        .http()
        .get('/api/v1/audit-logs?pageSize=100')
        .set(auth(ownerA))
        .expect(200);
      const ownIds = new Set([orgA]);
      const rows = await t.prisma.auditLog.findMany({
        where: { id: { in: audit.body.data.map((a: { id: string }) => a.id) } },
      });
      expect(rows.every((r) => ownIds.has(r.orgId!))).toBe(true);
      expect(rows.length).toBeGreaterThan(0);

      const org = await t.http().get('/api/v1/organization').set(auth(ownerA)).expect(200);
      expect(org.body.data.id).toBe(orgA);
    });
  });
});
