import { FieldCipher } from '../src/common/crypto/field-cipher.js';
import { AppError } from '../src/common/errors/app-error.js';
import { randomUUID } from 'node:crypto';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { outbox } from '../src/modules/notifications/senders.js';
import { MessagesService } from '../src/modules/tenant-portal/messages.service.js';
import { SmsService } from '../src/modules/notifications/sms/sms.service.js';
import {
  createPlatformAdmin,
  createTestApp,
  login,
  onboardOrg,
  resetDb,
  type Session,
  type TestApp,
} from './helpers.js';

const GUEST = '+254722000111';

describe('SMS: platform vs organisation (e2e)', () => {
  let t: TestApp;
  let sms: SmsService;
  let cipher: FieldCipher;
  let orgId: string;
  let owner: Session;

  const account = () => t.prisma.smsAccount.findUniqueOrThrow({ where: { orgId } });
  const setAccount = (data: Record<string, unknown>) =>
    t.prisma.smsAccount.upsert({ where: { orgId }, create: { orgId, ...data }, update: data });
  const ownSms = (apiKey = 'ok', extra: Record<string, unknown> = {}) =>
    setAccount({
      mode: 'OWN',
      provider: 'TEXTSMS',
      providerUser: '1234',
      senderId: 'MAKINI',
      providerKeyEnc: Buffer.from(cipher.encrypt(apiKey, `sms.org.apikey:${orgId}`)),
      ...extra,
    });
  const ledger = () =>
    t.prisma.smsLedgerEntry.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } });
  const sentTo = (to: string) => outbox.filter((m) => m.channel === 'sms' && m.to === to);

  beforeAll(async () => {
    t = await createTestApp();
    sms = t.app.get(SmsService);
    cipher = t.app.get(FieldCipher);
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    const admin = await login(t, 'admin@example.invalid');
    ({ orgId, owner } = await onboardOrg(t, admin, {
      name: 'Makini Homes',
      ownerEmail: 'olive@example.invalid',
      ownerPhone: '0712000001',
      kind: 'HOST',
    }));
    void owner;
  });
  afterAll(async () => t?.close());
  beforeEach(async () => {
    outbox.length = 0;
    await t.prisma.smsLedgerEntry.deleteMany({ where: { orgId } });
    await t.prisma.smsLog.deleteMany({});
    await t.prisma.platformSettings.deleteMany({});
    await setAccount({
      mode: 'PLATFORM',
      provider: null,
      providerUser: null,
      providerKeyEnc: null,
      providerSecretEnc: null,
      senderId: null,
      balance: 100,
      fallbackToPlatform: false,
      lowBalanceLevel: 50,
      lowWarnedOn: null,
      emptyWarnedOn: null,
      failWarnedOn: null,
      failingSince: null,
      lastFailReason: null,
    });
  });

  it('charges units for an organisation SMS and logs it', async () => {
    const out = await sms.send(
      { kind: 'org', orgId, type: 'booking' },
      GUEST,
      'Your stay is confirmed.',
    );
    expect(out).toMatchObject({ status: 'SENT', route: 'PLATFORM', units: 1, warn: null });
    expect((await account()).balance).toBe(99);
    expect(await ledger()).toMatchObject([
      { kind: 'CHARGE', units: -1, balanceAfter: 99, smsLogId: out.logId },
    ]);
    expect(sentTo(GUEST)).toMatchObject([{ via: 'platform' }]);
    expect(await t.prisma.smsLog.findUniqueOrThrow({ where: { id: out.logId } })).toMatchObject({
      orgId,
      kind: 'ORG',
      type: 'booking',
      units: 1,
      status: 'SENT',
    });
  });

  it('stamps unit changes in UTC like the rest of the app', async () => {
    await sms.send({ kind: 'org', orgId, type: 'booking' }, GUEST, 'Confirmed.');
    const drift = Math.abs((await account()).updatedAt.getTime() - Date.now());
    expect(drift).toBeLessThan(60_000);
  });

  it('counts long messages as several units', async () => {
    const out = await sms.send({ kind: 'org', orgId, type: 'broadcast' }, GUEST, 'a'.repeat(200));
    expect(out.units).toBe(2);
    expect((await account()).balance).toBe(98);
  });

  it('does not send without units and warns once a day', async () => {
    await setAccount({ balance: 0 });
    const first = await sms.send(
      { kind: 'org', orgId, type: 'rent_reminder' },
      GUEST,
      'Rent is due.',
    );
    expect(first).toMatchObject({ status: 'NO_UNITS', route: null, units: 0, warn: 'EMPTY' });
    expect(sentTo(GUEST)).toHaveLength(0);
    const second = await sms.send(
      { kind: 'org', orgId, type: 'rent_reminder' },
      GUEST,
      'Rent is due.',
    );
    expect(second).toMatchObject({ status: 'NO_UNITS', warn: null });
    expect(await ledger()).toHaveLength(0);
  });

  it('sends guest booking codes free at zero units', async () => {
    await setAccount({ balance: 0 });
    const out = await sms.send(
      { kind: 'org', orgId, type: 'booking_otp' },
      GUEST,
      'Your booking code is 123456.',
    );
    expect(out).toMatchObject({ status: 'SENT', route: 'PLATFORM_FREE', units: 0, warn: 'EMPTY' });
    expect((await account()).balance).toBe(0);
    expect(sentTo(GUEST)).toMatchObject([{ via: 'platform' }]);
  });

  it('never charges platform messages', async () => {
    await setAccount({ balance: 0 });
    const out = await sms.send(
      { kind: 'platform', type: 'login_otp' },
      GUEST,
      'Your KodiHub sign-in code is 123456.',
    );
    expect(out).toMatchObject({ status: 'SENT', route: 'PLATFORM', units: 0 });
    expect((await account()).balance).toBe(0);
    expect(await ledger()).toHaveLength(0);
  });

  it('sends through the organisation provider without units', async () => {
    await ownSms();
    const out = await sms.send({ kind: 'org', orgId, type: 'booking' }, GUEST, 'Confirmed.');
    expect(out).toMatchObject({ status: 'SENT', route: 'ORG_PROVIDER', units: 0 });
    expect(sentTo(GUEST)).toMatchObject([{ via: `org:${orgId}` }]);
    expect((await account()).balance).toBe(100);
  });

  it('does not rescue own-SMS failures without fallback', async () => {
    await ownSms('test-reject');
    const out = await sms.send(
      { kind: 'org', orgId, type: 'booking_otp' },
      GUEST,
      'Your booking code is 123456.',
    );
    expect(out).toMatchObject({
      status: 'FAILED',
      reason: 'The SMS provider rejected the API key',
      warn: 'FAILING',
    });
    expect(sentTo(GUEST)).toHaveLength(0);
    const acc = await account();
    expect(acc.failingSince).not.toBeNull();
    expect(acc.lastFailReason).toBe('The SMS provider rejected the API key');
  });

  it('falls back to KodiHub when the owner allows it and units cover it', async () => {
    await ownSms('test-reject', { fallbackToPlatform: true, balance: 5 });
    const out = await sms.send({ kind: 'org', orgId, type: 'booking' }, GUEST, 'Confirmed.');
    expect(out).toMatchObject({ status: 'SENT', route: 'PLATFORM_FALLBACK', units: 1 });
    expect((await account()).balance).toBe(4);
    expect(sentTo(GUEST)).toMatchObject([{ via: 'platform' }]);
  });

  it('clears the failing state after a successful send', async () => {
    await ownSms('test-reject');
    await sms.send({ kind: 'org', orgId, type: 'booking' }, GUEST, 'Confirmed.');
    await ownSms('ok');
    await sms.send({ kind: 'org', orgId, type: 'booking' }, GUEST, 'Confirmed.');
    const acc = await account();
    expect(acc.failingSince).toBeNull();
    expect(acc.lastFailReason).toBeNull();
  });

  it('charges atomically under concurrency', async () => {
    await setAccount({ balance: 1 });
    const outs = await Promise.all([
      sms.send({ kind: 'org', orgId, type: 'broadcast' }, GUEST, 'One.'),
      sms.send({ kind: 'org', orgId, type: 'broadcast' }, '+254722000222', 'Two.'),
    ]);
    expect(outs.map((o) => o.status).sort()).toEqual(['NO_UNITS', 'SENT']);
    expect((await account()).balance).toBe(0);
  });

  it('refunds units when the provider rejects', async () => {
    await t.prisma.platformSettings.create({
      data: {
        id: 1,
        smsProvider: 'TEXTSMS',
        textsmsPartnerId: '1',
        textsmsSenderId: 'KODIHUB',
        textsmsKeyEnc: Buffer.from(cipher.encrypt('test-reject', 'platform.sms.textsms')),
      },
    });
    const out = await sms.send({ kind: 'org', orgId, type: 'booking' }, GUEST, 'Confirmed.');
    expect(out).toMatchObject({
      status: 'FAILED',
      reason: 'The SMS provider rejected the API key',
      units: 0,
    });
    expect((await account()).balance).toBe(100);
    expect((await ledger()).map((e) => [e.kind, e.units])).toEqual([
      ['CHARGE', -1],
      ['REFUND', 1],
    ]);
  });

  describe('every existing SMS goes through its route', () => {
    it('sends a staff password-reset code through KodiHub even at zero units', async () => {
      await ownSms('test-reject', { balance: 0 });
      await t
        .http()
        .post('/api/v1/auth/password/forgot')
        .send({ identifier: '+254712000001' })
        .expect(202);
      const last = sentTo('+254712000001').at(-1);
      expect(last).toMatchObject({ via: 'platform' });
      expect(last!.text).toMatch(/KodiHub password reset code is \d{6}/);
      expect((await account()).balance).toBe(0);
    });

    it('records an organisation message the balance cannot cover as not sent', async () => {
      await setAccount({ balance: 0 });
      const row = await t.app.get(MessagesService).sms({
        orgId,
        tenantId: randomUUID(),
        kind: 'REMINDER_MANUAL',
        to: GUEST,
        text: 'Hi, your rent is due.',
      });
      expect(row).toMatchObject({ status: 'FAILED', error: 'Not sent — no SMS units' });
      expect(sentTo(GUEST)).toHaveLength(0);
    });

    it('sends a host guest booking code as the host', async () => {
      await ownSms('ok');
      await t.app
        .get(NotificationsService)
        .sendBookingCode(orgId, GUEST, '123456', 10, 'Makini Homes');
      expect(sentTo(GUEST).at(-1)).toMatchObject({ via: `org:${orgId}` });
      expect(sentTo(GUEST).at(-1)!.text).toBe(
        'Your Makini Homes booking code is 123456. It expires in 10 minutes.',
      );
    });
  });

  it('tells a guest plainly when the host’s SMS account can’t send their booking code', async () => {
    await ownSms('test-reject');
    const err = await t.app
      .get(NotificationsService)
      .sendBookingCode(orgId, GUEST, '123456', 10, 'Makini Homes')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status: 502, code: 'DELIVERY_FAILED' });
  });

  it('never sends real SMS to the log when the chosen KodiHub provider is incomplete', async () => {
    await t.prisma.platformSettings.create({
      data: {
        id: 1,
        smsProvider: 'TEXTSMS', // chosen, but no partner ID or key saved
        atUsername: 'kodihub',
        atApiKeyEnc: Buffer.from(cipher.encrypt('test-reject', 'platform.sms.africastalking')),
      },
    });
    const out = await sms.send(
      { kind: 'platform', type: 'login_otp' },
      GUEST,
      'Your KodiHub sign-in code is 123456.',
    );
    // Falls back to the complete Africa's Talking settings (which reject here), not the log sender.
    expect(out).toMatchObject({
      status: 'FAILED',
      reason: 'The SMS provider rejected the API key',
    });
  });

  it('opens new organisations with the free units', async () => {
    const admin = await login(t, 'admin@example.invalid');
    const other = await onboardOrg(t, admin, {
      name: 'Second Landlord',
      ownerEmail: 'sam@example.invalid',
      ownerPhone: '0712000002',
    });
    expect(
      await t.prisma.smsAccount.findUniqueOrThrow({ where: { orgId: other.orgId } }),
    ).toMatchObject({
      mode: 'PLATFORM',
      balance: 100,
    });
    expect(await t.prisma.smsLedgerEntry.findMany({ where: { orgId: other.orgId } })).toMatchObject(
      [{ kind: 'ADJUSTMENT', units: 100, balanceAfter: 100, reason: 'Opening balance' }],
    );
  });

  describe('owners are told', () => {
    const notices = (kind: string) =>
      t.prisma.userNotification.findMany({ where: { orgId, kind } });
    const notifications = () => t.app.get(NotificationsService);
    beforeEach(() => t.prisma.userNotification.deleteMany({}));

    it('tells owners once a day when units run out', async () => {
      await setAccount({ balance: 0 });
      for (let i = 0; i < 2; i++) {
        await notifications()
          .sendSms({ kind: 'org', orgId, type: 'booking' }, GUEST, 'Confirmed.')
          .catch(() => undefined);
      }
      const rows = await notices('sms_empty');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ title: 'Out of SMS units', actionUrl: '/app/settings/sms' });
    });

    it('tells owners when their own SMS account fails', async () => {
      await ownSms('test-reject');
      await notifications()
        .sendSms({ kind: 'org', orgId, type: 'booking' }, GUEST, 'Confirmed.')
        .catch(() => undefined);
      const rows = await notices('sms_failing');
      expect(rows).toHaveLength(1);
      expect(rows[0]!.title).toBe('Your SMS account isn’t sending');
      expect(rows[0]!.body.startsWith('The SMS provider rejected the API key.')).toBe(true);
    });

    it('warns when the balance drops below the low level', async () => {
      await setAccount({ balance: 51, lowBalanceLevel: 50 });
      await notifications().sendSms(
        { kind: 'org', orgId, type: 'broadcast' },
        GUEST,
        'a'.repeat(200),
      );
      const rows = await notices('sms_low');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        title: 'SMS units running low',
        body: '49 SMS units left. Buy more so messages to your tenants and guests keep going.',
      });
    });
  });
});
