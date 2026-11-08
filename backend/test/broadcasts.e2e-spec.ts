import { vi } from 'vitest';
import { todayInNairobi } from '../src/modules/billing/billing-math.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { outbox } from '../src/modules/notifications/senders.js';
import {
  acceptInvite,
  auth,
  createPlatformAdmin,
  createTestApp,
  login,
  onboardOrg,
  resetDb,
  roleId,
  type Session,
  type TestApp,
} from './helpers.js';

const TODAY = todayInNairobi();
const KES = (major: number) => major * 100;

type Res = { status: number; body: any };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('Broadcasts to tenants (e2e)', () => {
  let t: TestApp;
  let owner: Session;
  let orgId: string;
  const post = async (s: Session, path: string, body: object = {}, status = 201) =>
    check(await t.http().post(`/api/v1${path}`).set(auth(s)).send(body), status);
  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    const admin = await login(t, 'admin@example.invalid');
    ({ owner, orgId } = await onboardOrg(t, admin, {
      name: 'Notice Org',
      ownerEmail: 'notice-owner@example.invalid',
      ownerPhone: '+254700000061',
    }));
  });

  async function setUp() {
    const a = (await post(owner, '/properties', { name: 'Acacia', code: 'ACA' })).data;
    const b = (await post(owner, '/properties', { name: 'Baobab', code: 'BAO' })).data;
    const unit = async (propertyId: string, number: string) =>
      (await post(owner, '/units', { propertyId, number, rentAmount: KES(10000) })).data;
    const moveIn = async (unitId: string, tenant: object | { tenantId: string }) =>
      (
        await post(owner, '/tenancies', {
          unitId,
          ...('tenantId' in tenant ? tenant : { tenant }),
          startDate: TODAY,
          issueMoveInInvoice: false,
        })
      ).data;
    const ann = await moveIn((await unit(a.id, 'A1')).id, {
      firstName: 'Ann',
      lastName: 'A',
      phone: '0711000701',
      email: 'ann@example.invalid',
    });
    const ben = await moveIn((await unit(a.id, 'A2')).id, {
      firstName: 'Ben',
      lastName: 'B',
      phone: '0711000702',
    });
    await moveIn((await unit(b.id, 'B1')).id, { tenantId: ben.tenant.id }); // Ben rents in both
    await moveIn((await unit(b.id, 'B2')).id, {
      firstName: 'Cat',
      lastName: 'C',
      phone: '0711000703',
    });
    const dan = await moveIn((await unit(a.id, 'A3')).id, {
      firstName: 'Dan',
      lastName: 'D',
      phone: '0711000704',
    });
    await post(owner, `/tenancies/${dan.id}/move-out`, { endDate: TODAY }, 200); // left: no notice
    await post(owner, `/tenants/${ann.tenant.id}/portal-access`, {}, 200);
    return { a, b, ann, ben };
  }

  const waitDone = async (id: string) => {
    for (let i = 0; i < 40; i++) {
      const b = (await get(owner, `/broadcasts/${id}`)).data;
      if (b.status === 'DONE') return b;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('broadcast did not finish');
  };

  it('texts each current tenant of the chosen properties once, with email and app copies', async () => {
    const x = await setUp();
    expect((await post(owner, '/broadcasts/preview', { propertyIds: [x.a.id] }, 200)).data).toEqual(
      {
        recipients: 2,
        withEmail: 1,
        withPortal: 1,
      },
    );

    const notifications = t.app.get(NotificationsService);
    const realSms = notifications.sendSms.bind(notifications);
    vi.spyOn(notifications, 'sendSms').mockImplementation(async (spec, phone, text) => {
      if (phone === '+254711000702') throw new Error('Network down');
      return realSms(spec, phone, text);
    });
    const before = outbox.length;
    const created = (
      await post(
        owner,
        '/broadcasts',
        { propertyIds: [x.a.id], text: 'Water off Saturday 9am to noon.', alsoEmail: true },
        202,
      )
    ).data;
    expect(created.recipients).toBe(2);
    const done = await waitDone(created.id);
    expect(done).toMatchObject({ recipients: 2, sent: 1, failed: 1, emailed: 1, notified: 1 });

    const out = outbox.slice(before);
    expect(out.filter((m) => m.channel === 'sms').map((m) => m.to)).toEqual(['+254711000701']);
    expect(out.some((m) => m.channel === 'email' && m.to === 'ann@example.invalid')).toBe(true);
    expect(out.some((m) => m.to === '+254711000703')).toBe(false); // Cat is in the other property
    const annUser = await t.prisma.tenant.findUniqueOrThrow({ where: { id: x.ann.tenant.id } });
    expect(
      await t.prisma.userNotification.count({
        where: { userId: annUser.userId!, kind: 'BROADCAST' },
      }),
    ).toBe(1);
    // Every attempt is logged against the broadcast, failures included.
    expect(done.messages.map((m: { status: string; tenantId: string }) => m.status).sort()).toEqual(
      ['FAILED', 'SENT'],
    );

    // One broadcast a minute.
    await post(owner, '/broadcasts', { propertyIds: [x.b.id], text: 'Again' }, 429);
    expect((await get(owner, '/broadcasts')).data.map((r: { id: string }) => r.id)).toEqual([
      created.id,
    ]);
  });

  it('checks permission, property access and text length', async () => {
    const x = await setUp();
    await post(owner, '/broadcasts', { propertyIds: [x.a.id], text: 'x'.repeat(481) }, 422);
    await post(owner, '/broadcasts', { propertyIds: [], text: 'Hi' }, 422);

    const invite = async (email: string, key: string, propertyIds?: string[]) => {
      await post(owner, '/users/invitations', {
        firstName: key,
        lastName: 'Staff',
        email,
        roleId: await roleId(t, owner, key),
        ...(propertyIds ? { propertyIds } : {}),
      });
      return acceptInvite(t, email);
    };
    const accountant = await invite('acc@example.invalid', 'ACCOUNTANT');
    await post(accountant, '/broadcasts', { propertyIds: [x.a.id], text: 'Hi' }, 403);
    const managerB = await invite('mgr@example.invalid', 'MANAGER', [x.b.id]);
    await post(managerB, '/broadcasts/preview', { propertyIds: [x.a.id] }, 404);
    expect(
      (await post(managerB, '/broadcasts/preview', { propertyIds: [x.b.id] }, 200)).data.recipients,
    ).toBe(2);
  });

  it('shows staff limited to some properties only broadcasts that stay within them', async () => {
    const x = await setUp();
    const send = async (propertyIds: string[]) => {
      const b = (await post(owner, '/broadcasts', { propertyIds, text: 'Notice' }, 202)).data;
      // The org may send one broadcast a minute; age this one so the next is allowed.
      await t.prisma.broadcast.update({
        where: { id: b.id },
        data: { createdAt: new Date(Date.now() - 5 * 60_000) },
      });
      return b.id as string;
    };
    const toA = await send([x.a.id]);
    const toBoth = await send([x.a.id, x.b.id]);
    const toB = await send([x.b.id]);

    await post(owner, '/users/invitations', {
      firstName: 'Mgr',
      lastName: 'Staff',
      email: 'mgr-b@example.invalid',
      roleId: await roleId(t, owner, 'MANAGER'),
      propertyIds: [x.b.id],
    });
    const managerB = await acceptInvite(t, 'mgr-b@example.invalid');

    const seen = await get(managerB, '/broadcasts');
    expect(seen.data.map((r: { id: string }) => r.id)).toEqual([toB]);
    expect(seen.meta.total).toBe(1);
    await get(managerB, `/broadcasts/${toA}`, 404);
    await get(managerB, `/broadcasts/${toBoth}`, 404);
    await get(managerB, `/broadcasts/${toB}`);
    expect((await get(owner, '/broadcasts')).data).toHaveLength(3);
  });

  describe('SMS units', () => {
    const LONG = 'Water will be off on Saturday from 9am to noon while the tank is cleaned. '
      .repeat(3)
      .slice(0, 200);
    const setBalance = (balance: number, mode: 'PLATFORM' | 'OWN' = 'PLATFORM') =>
      t.prisma.smsAccount.update({ where: { orgId }, data: { balance, mode } });

    it('previews the units a broadcast needs', async () => {
      const x = await setUp();
      await setBalance(5);
      const preview = (
        await post(owner, '/broadcasts/preview', { propertyIds: [x.a.id, x.b.id], text: LONG }, 200)
      ).data;
      expect(preview).toMatchObject({
        recipients: 3,
        unitsPerMessage: 2,
        unitsNeeded: 6,
        balance: 5,
        mode: 'PLATFORM',
      });
    });

    it('refuses a broadcast the balance cannot cover', async () => {
      const x = await setUp();
      await setBalance(5);
      const res = await t
        .http()
        .post('/api/v1/broadcasts')
        .set(auth(owner))
        .send({ propertyIds: [x.a.id, x.b.id], text: LONG });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        code: 'SMS_UNITS_LOW',
        message: 'Not enough SMS units for this notice: it needs 6, you have 5.',
      });
      expect(await t.prisma.broadcast.count({ where: { orgId } })).toBe(0);
    });

    it('lets own-SMS organisations broadcast without units', async () => {
      const x = await setUp();
      await setBalance(0, 'OWN');
      await post(owner, '/broadcasts', { propertyIds: [x.a.id, x.b.id], text: LONG }, 202);
    });
  });
});
