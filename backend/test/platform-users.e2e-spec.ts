import { outbox } from '../src/modules/notifications/senders.js';
import {
  acceptInvite,
  addMember,
  auth,
  createPlatformAdmin,
  createTestApp,
  login,
  onboardOrg,
  PASSWORD,
  resetDb,
  type Session,
  stepUp,
  type TestApp,
} from './helpers.js';

type Res = { status: number; body: any };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

const ADMIN_EMAIL = 'admin@example.invalid';
const OWNER = { email: 'pu-owner@example.invalid', phone: '+254700000071' };
const MANAGER = { email: 'pu-manager@example.invalid', phone: '+254700000072' };

function lastTemporaryPassword(to: string): string {
  for (let i = outbox.length - 1; i >= 0; i--) {
    const m = outbox[i]!;
    const found = m.to === to ? /Temporary password:? (\S+)/.exec(m.text)?.[1] : undefined;
    if (found) return found;
  }
  throw new Error(`No temporary password sent to ${to}`);
}

describe('Platform: customers’ accounts and organisation teams (e2e)', () => {
  let t: TestApp;
  let admin: Session;
  let owner: Session;
  let orgId: string;
  let manager: Session & { userId: string };

  const req = (
    method: 'get' | 'post' | 'patch' | 'delete',
    s: Session,
    path: string,
    body?: object,
    headers: Record<string, string> = {},
  ) =>
    t
      .http()
      [method](`/api/v1${path}`)
      .set(auth(s))
      .set(headers)
      .send(body ?? {});
  const adminStepUp = async () => ({ 'X-Step-Up': await stepUp(t, admin, '+254700000099') });

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    admin = await login(t, ADMIN_EMAIL);
    ({ owner, orgId } = await onboardOrg(t, admin, {
      name: 'People Org',
      ownerEmail: OWNER.email,
      ownerPhone: OWNER.phone,
    }));
    manager = await addMember(t, owner, { ...MANAGER, role: 'MANAGER' });
  });

  it('lists and searches customers (never operators), with their organisations', async () => {
    const all = check(await req('get', admin, '/platform/users'), 200);
    expect(all.data.map((u: { email: string }) => u.email).sort()).toEqual(
      [MANAGER.email, OWNER.email].sort(),
    );
    const found = check(await req('get', admin, '/platform/users?q=0700000072'), 200);
    expect(found.data).toHaveLength(1);
    expect(found.data[0]).toMatchObject({
      email: MANAGER.email,
      hasPassword: true,
      organizations: [{ id: orgId, name: 'People Org', role: 'Manager', status: 'ACTIVE' }],
    });
    const business = check(await req('get', admin, '/platform/users?filter=business'), 200);
    expect(business.meta.total).toBe(2);

    const detail = check(await req('get', admin, `/platform/users/${manager.userId}`), 200).data;
    expect(detail).toMatchObject({
      canManage: true,
      activeSessions: 1,
      memberships: [{ organization: { id: orgId }, role: { name: 'Manager', isOwner: false } }],
    });
  });

  it('edits contact details (step-up, ends sessions), disables, signs out and resets passwords', async () => {
    const path = `/platform/users/${manager.userId}`;
    // A name alone needs no code and keeps them signed in.
    check(await req('patch', admin, path, { firstName: 'Mercy' }), 200);
    check(await req('get', manager, '/me'), 200);

    // A new sign-in email needs a code, refuses one that's taken, and ends their sessions.
    const noCode = await req('patch', admin, path, { email: 'mercy@example.invalid' });
    expect(noCode.body.error.code).toBe('STEP_UP_REQUIRED');
    const up = await adminStepUp();
    const taken = check(await req('patch', admin, path, { email: OWNER.email }, up), 422);
    expect(taken.error.details[0].field).toBe('email');
    const edited = check(
      await req('patch', admin, path, { email: 'Mercy@Example.invalid' }, up),
      200,
    );
    expect(edited.data).toMatchObject({ firstName: 'Mercy', email: 'mercy@example.invalid' });
    await t
      .http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', manager.refreshCookie!)
      .send({})
      .expect(401);

    // Disable: sign-in refused and sessions ended; enable lets them back in.
    const s = await login(t, 'mercy@example.invalid');
    check(await req('post', admin, `${path}/status`, { status: 'DISABLED' }), 200);
    expect((await req('get', s, '/me')).status).toBe(401);
    expect(
      (
        await t
          .http()
          .post('/api/v1/auth/login')
          .send({ identifier: 'mercy@example.invalid', password: PASSWORD })
      ).status,
    ).not.toBe(200);
    check(await req('post', admin, `${path}/status`, { status: 'ACTIVE' }), 200);
    const again = await login(t, 'mercy@example.invalid');

    // Sign out everywhere.
    const out = check(await req('post', admin, `${path}/sign-out`), 200);
    expect(out.data.sessionsEnded).toBeGreaterThanOrEqual(1);
    expect((await req('get', again, '/me')).status).toBe(401);

    // Reset: a temporary password by email and SMS (code required); they must change it.
    expect((await req('post', admin, `${path}/reset-password`)).body.error.code).toBe(
      'STEP_UP_REQUIRED',
    );
    const reset = check(await req('post', admin, `${path}/reset-password`, {}, up), 200);
    expect(reset.data).toMatchObject({ delivered: true });
    const temp = lastTemporaryPassword('mercy@example.invalid');
    expect(outbox.some((m) => m.to === MANAGER.phone && m.text.includes(temp))).toBe(true);
    const withTemp = await login(t, 'mercy@example.invalid', temp);
    expect(withTemp.body.user).toMatchObject({ mustChangePassword: true });

    const audit = await t.prisma.auditLog.findMany({
      where: { entityId: manager.userId, action: { startsWith: 'platform.user_' } },
      select: { action: true },
    });
    expect(new Set(audit.map((a) => a.action))).toEqual(
      new Set([
        'platform.user_update',
        'platform.user_disable',
        'platform.user_enable',
        'platform.user_sign_out',
        'platform.user_password_reset',
      ]),
    );
  });

  it('closes an account for someone, lists it as deleted, restores it, and purges on request', async () => {
    const ownerId = owner.body.user.id;
    const up = await adminStepUp();
    // The only owner can't be closed; a manager can.
    const sole = check(await req('post', admin, `/platform/users/${ownerId}/close`, {}, up), 409);
    expect(sole.error.code).toBe('SOLE_OWNER');
    const path = `/platform/users/${manager.userId}`;
    expect((await req('post', admin, `${path}/close`, { reason: 'Emailed privacy@' })).status).toBe(
      403,
    );
    check(await req('post', admin, `${path}/close`, { reason: 'Emailed privacy@' }, up), 200);

    const deleted = check(await req('get', admin, '/platform/users?filter=deleted'), 200);
    expect(deleted.data).toHaveLength(1);
    expect(deleted.data[0]).toMatchObject({
      id: manager.userId,
      email: null,
      deleted: { email: MANAGER.email, phone: MANAGER.phone, reason: 'Emailed privacy@' },
    });
    expect(deleted.data[0].deleted.purgeOn).toBeTruthy();
    expect(check(await req('get', admin, '/platform/users'), 200).meta.total).toBe(1);
    // A deleted account can't be edited until it's restored.
    expect(check(await req('patch', admin, path, { firstName: 'X' }), 409).error.code).toBe(
      'ACCOUNT_DELETED',
    );

    // Restore: contact details back, membership stays ended, no password until a reset.
    const restored = check(await req('post', admin, `${path}/restore`), 200).data;
    expect(restored).toMatchObject({
      email: MANAGER.email,
      phone: MANAGER.phone,
      status: 'ACTIVE',
      hasPassword: false,
      deleted: null,
      memberships: [{ status: 'INACTIVE' }],
    });
    check(await req('post', admin, `${path}/reset-password`, {}, up), 200);
    await login(t, MANAGER.email, lastTemporaryPassword(MANAGER.email));

    // Close again and erase now: the kept details go and it can't be restored.
    check(await req('post', admin, `${path}/close`, {}, up), 200);
    expect((await req('post', admin, `${path}/purge`)).status).toBe(403);
    const purged = check(await req('post', admin, `${path}/purge`, {}, up), 200).data;
    expect(purged).toMatchObject({ firstName: 'Deleted', lastName: 'user' });
    expect(purged.deleted).toMatchObject({ email: null, phone: null, purgeOn: null });
    expect(check(await req('post', admin, `${path}/restore`), 409).error.code).toBe(
      'ACCOUNT_PURGED',
    );
  });

  it('shows an organisation’s team, resends invitations and removes members (never the last owner)', async () => {
    const owners = await t.prisma.membership.findMany({
      where: { orgId, role: { systemKey: 'OWNER' } },
    });
    const ownerMembership = owners[0]!.id;
    const team = check(await req('get', admin, `/platform/organizations/${orgId}/members`), 200);
    expect(team.data).toHaveLength(2);

    // A pending invitation can be resent.
    const roles = check(await req('get', owner, '/roles'), 200).data;
    const caretaker = roles.find((r: { systemKey: string }) => r.systemKey === 'CARETAKER').id;
    const invited = check(
      await req('post', owner, '/users/invitations', {
        firstName: 'Cate',
        lastName: 'Taker',
        email: 'pu-caretaker@example.invalid',
        roleId: caretaker,
      }),
      201,
    ).data;
    const pending = (
      check(await req('get', admin, `/platform/organizations/${orgId}/members`), 200).data as {
        id: string;
        status: string;
        user: { id: string };
      }[]
    ).find((m) => m.user.id === invited.userId)!;
    expect(pending.status).toBe('INVITED');
    const resent = check(
      await req('post', admin, `/platform/organizations/${orgId}/members/${pending.id}/resend`),
      200,
    );
    expect(resent.data.invitationDelivered).toBe(true);
    await acceptInvite(t, 'pu-caretaker@example.invalid');

    // Removing needs a code; the only owner stays.
    const up = await adminStepUp();
    const memberPath = (id: string) => `/platform/organizations/${orgId}/members/${id}`;
    expect((await req('delete', admin, memberPath(pending.id))).status).toBe(403);
    check(await req('delete', admin, memberPath(pending.id), undefined, up), 204);
    const last = check(await req('delete', admin, memberPath(ownerMembership), undefined, up), 409);
    expect(last.error.code).toBe('LAST_OWNER');
    expect(
      check(await req('get', admin, `/platform/organizations/${orgId}/members`), 200).data,
    ).toHaveLength(2);
  });

  it('limits salespeople to the organisations they look after', async () => {
    check(
      await req('post', admin, '/platform/operators', {
        firstName: 'Sam',
        lastName: 'Seller',
        email: 'pu-sam@example.invalid',
        phone: '0722000444',
        role: 'SALESPERSON',
        password: PASSWORD,
      }),
      201,
    );
    const sam = await login(t, 'pu-sam@example.invalid');
    // Sam's own organisation, whose owner is also the manager of People Org (not Sam's).
    const mine = check(
      await req('post', sam, '/platform/organizations', {
        name: 'Sam Org',
        kind: 'LANDLORD',
        phone: '0711000001',
        email: 'office@samorg.example.invalid',
        owner: { firstName: 'Mem', lastName: 'Ber', email: MANAGER.email, phone: MANAGER.phone },
      }),
      201,
    ).data.id;
    const solo = check(
      await req('post', sam, '/platform/organizations', {
        name: 'Solo Org',
        kind: 'HOST',
        phone: '0711000002',
        email: 'office@solo.example.invalid',
        owner: {
          firstName: 'Sol',
          lastName: 'Owner',
          email: 'pu-solo@example.invalid',
          phone: '+254700000073',
        },
      }),
      201,
    ).data.id;
    const soloOwner = await acceptInvite(t, 'pu-solo@example.invalid');

    // Sam sees people linked to Sam's organisations, not People Org's owner.
    const seen = check(await req('get', sam, '/platform/users'), 200).data.map(
      (u: { email: string }) => u.email,
    );
    expect(seen.sort()).toEqual([MANAGER.email, 'pu-solo@example.invalid'].sort());
    expect((await req('get', sam, `/platform/users/${owner.body.user.id}`)).status).toBe(404);

    // The manager also belongs to People Org: Sam may look, not change.
    const shared = check(await req('get', sam, `/platform/users/${manager.userId}`), 200).data;
    expect(shared.canManage).toBe(false);
    const refused = check(
      await req('post', sam, `/platform/users/${manager.userId}/sign-out`),
      403,
    );
    expect(refused.error.code).toBe('OUTSIDE_YOUR_BOOK');

    // Solo Org's owner is wholly Sam's.
    const soloId = soloOwner.body.user.id;
    expect(check(await req('get', sam, `/platform/users/${soloId}`), 200).data.canManage).toBe(
      true,
    );
    check(await req('post', sam, `/platform/users/${soloId}/sign-out`), 200);

    // Deleted accounts and closing are for superadmins; teams only within the book.
    expect((await req('get', sam, '/platform/users?filter=deleted')).status).toBe(403);
    expect((await req('post', sam, `/platform/users/${soloId}/close`)).status).toBe(403);
    check(await req('get', sam, `/platform/organizations/${mine}/members`), 200);
    check(await req('get', sam, `/platform/organizations/${solo}/members`), 200);
    expect((await req('get', sam, `/platform/organizations/${orgId}/members`)).status).toBe(404);
  });
});
