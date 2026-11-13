import { FieldCipher } from '../src/common/crypto/field-cipher.js';
import { todayInNairobi } from '../src/modules/billing/billing-math.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { outbox } from '../src/modules/notifications/senders.js';
import {
  HOSTPINNACLE_KEY_CONTEXT,
  HOSTPINNACLE_PASSWORD_CONTEXT,
  SmsService,
  TEXTSMS_KEY_CONTEXT,
} from '../src/modules/notifications/sms/sms.service.js';
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

const TODAY = todayInNairobi();
const PHONE = '+254722000111';

type Res = { status: number; body: any };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('Platform SMS log, provider test and dashboard (e2e)', () => {
  let t: TestApp;
  let sms: SmsService;
  let cipher: FieldCipher;
  let admin: Session;
  let owner: Session;
  let orgId: string;
  let otherOrgId: string;

  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);
  const post = async (s: Session, path: string, body: object, status = 200) =>
    check(await t.http().post(`/api/v1${path}`).set(auth(s)).send(body), status);

  const hostPinnacle = (apiKey = 'hp-key', extra: Record<string, unknown> = {}) =>
    t.prisma.platformSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...settingsData(apiKey), ...extra },
      update: { ...settingsData(apiKey), ...extra },
    });
  const settingsData = (apiKey: string) => ({
    smsProvider: 'HOSTPINNACLE' as const,
    hostpinnacleUserId: 'kodihub',
    hostpinnacleSenderId: 'KODIHUB',
    hostpinnacleKeyEnc: Buffer.from(cipher.encrypt(apiKey, HOSTPINNACLE_KEY_CONTEXT)),
    hostpinnaclePasswordEnc: Buffer.from(cipher.encrypt('hp-pass', HOSTPINNACLE_PASSWORD_CONTEXT)),
  });

  beforeAll(async () => {
    t = await createTestApp();
    sms = t.app.get(SmsService);
    cipher = t.app.get(FieldCipher);
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    admin = await login(t, 'admin@example.invalid');
    ({ orgId, owner } = await onboardOrg(t, admin, {
      name: 'Makini Homes',
      ownerEmail: 'olive@example.invalid',
      ownerPhone: '0712000001',
      kind: 'HOST',
    }));
    ({ orgId: otherOrgId } = await onboardOrg(t, admin, {
      name: 'Baraka Lettings',
      ownerEmail: 'baraka@example.invalid',
      ownerPhone: '0712000002',
    }));
  });
  afterAll(async () => t?.close());
  beforeEach(async () => {
    outbox.length = 0;
    await t.prisma.smsLog.deleteMany({});
    await t.prisma.platformSettings.deleteMany({});
    await t.prisma.smsAccount.updateMany({
      data: { mode: 'PLATFORM', balance: 100, failingSince: null, lastFailReason: null },
    });
  });

  describe('message text', () => {
    it('keeps the text of each SMS with its code hidden until revealed with a reason', async () => {
      await hostPinnacle();
      await t.app
        .get(NotificationsService)
        .sendCode({ phone: PHONE, email: null }, 'login', '482913', 10);
      const list = await get(admin, '/platform/sms/logs');
      expect(list.data).toHaveLength(1);
      const row = list.data[0];
      expect(row).toMatchObject({
        kind: 'PLATFORM',
        type: 'login_otp',
        to: '+2547****111',
        status: 'SENT',
        canOpen: true,
        hasSecret: true,
        organization: null,
      });
      expect(JSON.stringify(list)).not.toContain('482913');

      const one = (await get(admin, `/platform/sms/logs/${row.id}`)).data;
      expect(one).toMatchObject({ to: PHONE, secret: { label: 'Code', hidden: true } });
      expect(one.text).toContain('Your KodiHub sign-in code is ••••••.');
      expect(one.text).not.toContain('482913');

      // The database holds no readable text.
      const stored = await t.prisma.smsLog.findUniqueOrThrow({ where: { id: row.id } });
      expect(Buffer.from(stored.bodyEnc!).toString('utf8')).not.toContain('sign-in');

      await post(admin, `/platform/sms/logs/${row.id}/reveal`, { reason: 'short' }, 422);
      await post(
        owner,
        `/platform/sms/logs/${row.id}/reveal`,
        { reason: 'The tenant called support' },
        403,
      );
      const revealed = (
        await post(admin, `/platform/sms/logs/${row.id}/reveal`, {
          reason: 'Customer says the code never arrived',
        })
      ).data;
      expect(revealed).toEqual({ label: 'Code', secret: '482913' });
      const audit = await t.prisma.auditLog.findFirstOrThrow({
        where: { action: 'platform.sms_secret_reveal', entityId: row.id },
      });
      expect(JSON.stringify(audit.after)).toContain('Customer says the code never arrived');
      expect(JSON.stringify(audit)).not.toContain('482913');
    });

    it('keeps organisation messages whole and has nothing to reveal', async () => {
      await hostPinnacle();
      await sms.send({ kind: 'org', orgId, type: 'booking' }, PHONE, 'Your stay is confirmed.');
      const [row] = (await get(admin, '/platform/sms/logs')).data;
      expect(row).toMatchObject({
        organization: { id: orgId, name: 'Makini Homes' },
        hasSecret: false,
        units: 1,
      });
      const one = (await get(admin, `/platform/sms/logs/${row.id}`)).data;
      expect(one).toMatchObject({ text: 'Your stay is confirmed.', secret: null });
      await post(
        admin,
        `/platform/sms/logs/${row.id}/reveal`,
        { reason: 'Checking the message' },
        409,
      );
    });

    it('opens messages logged before text was kept without failing', async () => {
      const old = await t.prisma.smsLog.create({
        data: { kind: 'PLATFORM', type: 'login_otp', to: PHONE, status: 'SENT' },
      });
      const one = (await get(admin, `/platform/sms/logs/${old.id}`)).data;
      expect(one).toMatchObject({ text: null, secret: null });
      expect((await get(admin, '/platform/sms/logs')).data[0]).toMatchObject({ canOpen: false });
    });
  });

  describe('all messages', () => {
    beforeEach(async () => {
      await sms.send({ kind: 'org', orgId, type: 'booking' }, PHONE, 'Booking one.');
      await sms.send({ kind: 'org', orgId, type: 'rent_reminder' }, '+254733000222', 'Rent due.');
      await t.prisma.smsAccount.update({ where: { orgId: otherOrgId }, data: { balance: 0 } });
      await sms.send({ kind: 'org', orgId: otherOrgId, type: 'broadcast' }, PHONE, 'Notice.');
      await sms.send({ kind: 'platform', type: 'password_reset' }, '+254744000333', 'Reset 1.');
    });

    it('lists every SMS newest first and filters by organisation, KodiHub, status and type', async () => {
      const all = await get(admin, '/platform/sms/logs');
      expect(all.meta.total).toBe(4);
      expect(all.data[0].type).toBe('password_reset');

      const makini = await get(admin, `/platform/sms/logs?orgId=${orgId}`);
      expect(makini.data.map((r: { type: string }) => r.type).sort()).toEqual([
        'booking',
        'rent_reminder',
      ]);
      const kodihub = await get(admin, '/platform/sms/logs?kind=PLATFORM');
      expect(kodihub.data.map((r: { type: string }) => r.type)).toEqual(['password_reset']);
      const blocked = await get(admin, '/platform/sms/logs?status=NO_UNITS');
      expect(blocked.data).toEqual([
        expect.objectContaining({
          organization: { id: otherOrgId, name: 'Baraka Lettings' },
          status: 'NO_UNITS',
        }),
      ]);
      const reminders = await get(admin, '/platform/sms/logs?type=rent_reminder');
      expect(reminders.meta.total).toBe(1);
    });

    it('finds messages by phone number in any format', async () => {
      expect((await get(admin, '/platform/sms/logs?q=0722000111')).meta.total).toBe(2);
      expect((await get(admin, '/platform/sms/logs?q=%2B254733000222')).meta.total).toBe(1);
    });

    it('filters by Nairobi dates', async () => {
      expect((await get(admin, `/platform/sms/logs?from=${TODAY}&to=${TODAY}`)).meta.total).toBe(4);
      expect(
        (await get(admin, '/platform/sms/logs?from=2020-01-01&to=2020-01-31')).meta.total,
      ).toBe(0);
      await get(admin, '/platform/sms/logs?from=2026-02-01&to=2026-01-01', 422);
    });

    it('is for KodiHub admins only', async () => {
      await get(owner, '/platform/sms/logs', 403);
      await get(owner, '/platform/sms/stats', 403);
    });
  });

  describe('testing KodiHub’s provider', () => {
    it('asks for a provider when none is saved', async () => {
      const r = (await post(admin, '/platform/sms/test', { phone: '0722000111' })).data;
      expect(r).toEqual({
        sent: false,
        provider: null,
        messageId: null,
        reason: 'Choose and save KodiHub’s SMS provider first.',
      });
      expect(outbox.filter((m) => m.channel === 'sms')).toHaveLength(0);
    });

    it('tests only the chosen provider, never another complete one', async () => {
      await t.prisma.platformSettings.create({
        data: {
          id: 1,
          smsProvider: 'HOSTPINNACLE',
          hostpinnacleUserId: 'kodihub', // no password, key or sender ID
          textsmsPartnerId: '9876',
          textsmsKeyEnc: Buffer.from(cipher.encrypt('ok', TEXTSMS_KEY_CONTEXT)),
        },
      });
      const r = (await post(admin, '/platform/sms/test', { phone: '0722000111' })).data;
      expect(r).toMatchObject({
        sent: false,
        provider: 'HOSTPINNACLE',
        reason: 'HostPinnacle is not fully set up. Save all its details first.',
      });
      expect(outbox.filter((m) => m.channel === 'sms')).toHaveLength(0);
    });

    it('sends one real SMS through the chosen provider and logs it', async () => {
      await hostPinnacle();
      const r = (await post(admin, '/platform/sms/test', { phone: '0722000111' })).data;
      expect(r).toMatchObject({ sent: true, provider: 'HOSTPINNACLE', reason: null });
      expect(outbox.at(-1)).toMatchObject({ to: PHONE, via: 'platform' });
      const [row] = (await get(admin, '/platform/sms/logs')).data;
      expect(row).toMatchObject({ type: 'sms_test', status: 'SENT', provider: 'HOSTPINNACLE' });
      const one = (await get(admin, `/platform/sms/logs/${row.id}`)).data;
      expect(one.text).toBe('KodiHub test message: SMS through HostPinnacle works.');
    });

    it('shows the provider’s own error', async () => {
      await hostPinnacle('test-reject');
      const r = (await post(admin, '/platform/sms/test', { phone: '0722000111' })).data;
      expect(r).toMatchObject({ sent: false, reason: 'The SMS provider rejected the API key' });
      expect((await get(admin, '/platform/sms/logs?status=FAILED')).meta.total).toBe(1);
    });

    it('checks the phone and is for superadmins only', async () => {
      await post(admin, '/platform/sms/test', { phone: 'abc' }, 422);
      await post(owner, '/platform/sms/test', { phone: '0722000111' }, 403);
    });
  });

  describe('dashboard', () => {
    it('counts, charts and breaks down SMS for a period', async () => {
      // No provider yet: the server only writes this one to its log.
      await sms.send({ kind: 'org', orgId: otherOrgId, type: 'booking' }, PHONE, 'Logged.');
      await hostPinnacle();
      await sms.send({ kind: 'org', orgId, type: 'booking' }, PHONE, 'Booking one.');
      await sms.send({ kind: 'org', orgId, type: 'booking' }, PHONE, 'Booking two.');
      await t.prisma.smsAccount.update({ where: { orgId: otherOrgId }, data: { balance: 0 } });
      await sms.send({ kind: 'org', orgId: otherOrgId, type: 'broadcast' }, PHONE, 'Notice.');
      await sms.send({ kind: 'platform', type: 'login_otp' }, PHONE, 'Code 1.');
      await hostPinnacle('test-reject');
      await sms.send({ kind: 'platform', type: 'login_otp' }, PHONE, 'Code 2.');

      const s = (await get(admin, `/platform/sms/stats?from=${TODAY}&to=${TODAY}`)).data;
      expect(s.totals).toMatchObject({
        messages: 6,
        sent: 3,
        failed: 1,
        noUnits: 1,
        logged: 1,
        successRate: 0.5,
        unitsUsed: 2,
        kodihubMessages: 2,
        orgMessages: 4,
      });
      expect(s.daily).toEqual([{ day: TODAY, sent: 3, failed: 1, noUnits: 1, logged: 1 }]);
      expect(s.byProvider).toEqual(
        expect.arrayContaining([{ provider: 'HOSTPINNACLE', sent: 3, failed: 1 }]),
      );
      expect(s.byType).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'booking', kind: 'ORG', sent: 2 }),
          expect.objectContaining({ type: 'login_otp', kind: 'PLATFORM', sent: 1, failed: 1 }),
        ]),
      );
      expect(s.topOrgs[0]).toMatchObject({ orgId, name: 'Makini Homes', sent: 2, units: 2 });
      expect(s.topOrgs[1]).toMatchObject({
        orgId: otherOrgId,
        sent: 0,
        noUnits: 1,
        logged: 1,
        units: 0,
      });
      expect((await get(admin, '/platform/sms/logs?status=LOGGED')).data).toMatchObject([
        { organization: { id: otherOrgId }, status: 'LOGGED', units: 0, provider: null },
      ]);
      expect(s.lowBalance).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ orgId: otherOrgId, name: 'Baraka Lettings', balance: 0 }),
        ]),
      );
      expect(s.topReasons).toEqual([{ reason: 'The SMS provider rejected the API key', count: 1 }]);
    });

    it('fills every day of the period, defaults to this month and refuses long periods', async () => {
      const s = (await get(admin, '/platform/sms/stats')).data;
      expect(s.from).toBe(`${TODAY.slice(0, 7)}-01`);
      expect(s.to).toBe(TODAY);
      expect(s.daily).toHaveLength(Number(TODAY.slice(8)));
      expect(s.totals).toMatchObject({ messages: 0, successRate: null });
      await get(admin, '/platform/sms/stats?from=2024-01-01&to=2026-01-01', 422);
    });

    it('lists own SMS accounts that are failing', async () => {
      await t.prisma.smsAccount.update({
        where: { orgId },
        data: {
          mode: 'OWN',
          provider: 'TEXTSMS',
          failingSince: new Date(),
          lastFailReason: 'Wrong key',
        },
      });
      const s = (await get(admin, '/platform/sms/stats')).data;
      expect(s.failing).toEqual([
        expect.objectContaining({
          orgId,
          name: 'Makini Homes',
          provider: 'TEXTSMS',
          reason: 'Wrong key',
        }),
      ]);
    });
  });
});
