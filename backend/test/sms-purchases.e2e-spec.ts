import { todayInNairobi } from '../src/modules/billing/billing-math.js';
import { DarajaClient, type StkQueryResult } from '../src/modules/mpesa/daraja.client.js';
import { outbox } from '../src/modules/notifications/senders.js';
import { SmsService } from '../src/modules/notifications/sms/sms.service.js';
import {
  addMember,
  auth,
  createPlatformAdmin,
  createTestApp,
  login,
  onboardOrg,
  resetDb,
  type Session,
  stepUp,
  type TestApp,
} from './helpers.js';

const TODAY = todayInNairobi();
const ADMIN_PHONE = '+254700000099';
const OWNER_PHONE = '+254712000001';

class FakeDaraja extends DarajaClient {
  pushes: {
    checkoutRequestId: string;
    accountReference: string;
    description: string;
    amountKes: number;
  }[] = [];
  answers = new Map<string, StkQueryResult>();
  stkPush(_t: unknown, r: { accountReference: string; description: string; amountKes: number }) {
    const checkoutRequestId = `ws_CO_SMS_${this.pushes.length + 1}`;
    this.pushes.push({ checkoutRequestId, ...r });
    return Promise.resolve({ merchantRequestId: 'M', checkoutRequestId });
  }
  stkQuery(_t: unknown, q: { checkoutRequestId: string }) {
    return Promise.resolve(
      this.answers.get(q.checkoutRequestId) ?? { resultCode: null, resultDesc: 'processing' },
    );
  }
  registerC2b() {
    return Promise.resolve();
  }
}

type Res = { status: number; body: any };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('Buying SMS units (e2e)', () => {
  let t: TestApp;
  let fake: FakeDaraja;
  let admin: Session;
  let owner: Session;
  let orgId: string;
  let token: string;
  let smsRef: string; // "SMS" + the organisation's billing ref

  const post = async (
    s: Session,
    path: string,
    body: object,
    status = 202,
    headers: Record<string, string> = {},
  ) => check(await t.http().post(`/api/v1${path}`).set(auth(s)).set(headers).send(body), status);
  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);
  const balance = async () =>
    (await t.prisma.smsAccount.findUniqueOrThrow({ where: { orgId } })).balance;
  const stkCallback = (checkout: string, receipt: string, amountKes: number) => ({
    Body: {
      stkCallback: {
        MerchantRequestID: 'M',
        CheckoutRequestID: checkout,
        ResultCode: 0,
        ResultDesc: 'ok',
        CallbackMetadata: {
          Item: [
            { Name: 'Amount', Value: amountKes },
            { Name: 'MpesaReceiptNumber', Value: receipt },
            { Name: 'TransactionDate', Value: Number(TODAY.replace(/-/g, '') + '090000') },
            { Name: 'PhoneNumber', Value: Number(OWNER_PHONE.slice(1)) },
          ],
        },
      },
    },
  });
  const c2b = (receipt: string, account: string, amountKes: number) => ({
    TransactionType: 'Pay Bill',
    TransID: receipt,
    TransTime: TODAY.replace(/-/g, '') + '100000',
    TransAmount: `${amountKes}.00`,
    BusinessShortCode: '777777',
    BillRefNumber: account,
    MSISDN: OWNER_PHONE.slice(1),
    FirstName: 'Olive',
  });
  const confirmStk = async (checkout: string, receipt: string, amountKes: number) => {
    fake.answers.set(checkout, { resultCode: '0', resultDesc: 'ok' });
    await t
      .http()
      .post(`/api/v1/hooks/platform/${token}/stk`)
      .send(stkCallback(checkout, receipt, amountKes))
      .expect(200);
  };

  beforeAll(async () => {
    process.env.MPESA_CALLBACK_IPS = '127.0.0.1,::1,::ffff:127.0.0.1';
    fake = new FakeDaraja();
    t = await createTestApp([], (b) => b.overrideProvider(DarajaClient).useValue(fake));
  });
  afterAll(async () => {
    delete process.env.MPESA_CALLBACK_IPS;
    await t?.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    fake.pushes = [];
    fake.answers.clear();
    await createPlatformAdmin(t.prisma);
    admin = await login(t, 'admin@example.invalid');
    const header = await stepUp(t, admin, ADMIN_PHONE);
    const settings = check(
      await t
        .http()
        .put('/api/v1/platform/settings')
        .set(auth(admin))
        .set({ 'X-Step-Up': header })
        .send({
          paybill: '777777',
          darajaEnvironment: 'SANDBOX',
          consumerKey: 'sms-consumer-key',
          consumerSecret: 'sms-consumer-secret',
          passkey: 'sms-passkey',
        }),
      200,
    ).data;
    token = /hooks\/platform\/([^/]+)\//.exec(settings.daraja.callbackUrls.stk)![1]!;
    ({ orgId, owner } = await onboardOrg(t, admin, {
      name: 'Makini Homes',
      ownerEmail: 'olive@example.invalid',
      ownerPhone: '0712000001',
    }));
    const org = await t.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    smsRef = `SMS${org.billingRef}`;
  });

  it('starts an M-Pesa prompt for a bundle at the platform price', async () => {
    const p = (await post(owner, '/sms/buy', { units: 500 })).data;
    expect(p).toMatchObject({ units: 500, amount: '40000', state: 'PENDING' });
    expect(fake.pushes[0]).toMatchObject({
      accountReference: smsRef,
      description: 'KodiHub SMS',
      amountKes: 400,
    });
  });

  it('credits the bundle when M-Pesa confirms', async () => {
    const p = (await post(owner, '/sms/buy', { units: 500 })).data;
    await confirmStk(fake.pushes[0]!.checkoutRequestId, 'SMSSTK001', 400);
    expect((await get(owner, `/sms/buy/${p.id}`)).data).toMatchObject({
      state: 'PAID',
      mpesaReceipt: 'SMSSTK001',
    });
    expect(await balance()).toBe(600);
    expect(
      await t.prisma.smsLedgerEntry.findFirst({ where: { orgId, kind: 'PURCHASE' } }),
    ).toMatchObject({
      units: 500,
      balanceAfter: 600,
    });
  });

  it('credits a bundle once per receipt', async () => {
    await post(owner, '/sms/buy', { units: 500 });
    const checkout = fake.pushes[0]!.checkoutRequestId;
    await confirmStk(checkout, 'SMSSTK002', 400);
    await confirmStk(checkout, 'SMSSTK002', 400); // Safaricom retry
    await t
      .http()
      .post(`/api/v1/hooks/platform/${token}/c2b/confirm`)
      .send(c2b('SMSSTK002', smsRef, 400))
      .expect(200);
    expect(await balance()).toBe(600);
  });

  it('keeps bundle money off invoices', async () => {
    await post(owner, '/sms/buy', { units: 500 });
    await confirmStk(fake.pushes[0]!.checkoutRequestId, 'SMSSTK003', 400);
    expect(await t.prisma.platformPayment.count({ where: { orgId } })).toBe(0);
    await post(owner, '/billing/pay', { amount: 100000 });
    await confirmStk(fake.pushes[1]!.checkoutRequestId, 'BILLSTK001', 1000);
    expect(await t.prisma.platformPayment.count({ where: { orgId } })).toBe(1);
    expect(await balance()).toBe(600);
  });

  it('credits the units bought at the stored price', async () => {
    await post(owner, '/sms/buy', { units: 500 });
    await t.prisma.platformSettings.update({ where: { id: 1 }, data: { smsUnitPrice: 100n } });
    await confirmStk(fake.pushes[0]!.checkoutRequestId, 'SMSSTK004', 400);
    expect(await balance()).toBe(600);
  });

  it('turns a paybill payment with account SMS<ref> into units', async () => {
    await t
      .http()
      .post(`/api/v1/hooks/platform/${token}/c2b/confirm`)
      .send(c2b('SMSC2B001', smsRef.toLowerCase(), 400))
      .expect(200);
    expect(await balance()).toBe(600);
    expect(await t.prisma.platformPayment.count({ where: { orgId } })).toBe(0);
  });

  it('refuses bundles below the minimum', async () => {
    const res = await t.http().post('/api/v1/sms/buy').set(auth(owner)).send({ units: 50 });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toContain('Buy at least 100 units');
  });

  it('needs sms:manage to buy', async () => {
    const manager = await addMember(t, owner, { email: 'mo@example.invalid', role: 'MANAGER' });
    await post(manager, '/sms/buy', { units: 500 }, 403);
  });

  describe('organisation and admin SMS pages', () => {
    const put = async (sess: Session, path: string, body: object, status = 200) =>
      check(await t.http().put(`/api/v1${path}`).set(auth(sess)).send(body), status);
    const patch = async (sess: Session, path: string, body: object, status = 200) =>
      check(await t.http().patch(`/api/v1${path}`).set(auth(sess)).send(body), status);
    const send = (to: string) =>
      t.app
        .get(SmsService)
        .send({ kind: 'org', orgId, type: 'booking' }, to, 'Your stay is confirmed.');
    const ownSetup = (apiKey = 'textsms-secret-key') => ({
      mode: 'OWN',
      provider: 'TEXTSMS',
      providerUser: '1234',
      apiKey,
      senderId: 'MAKINI',
    });

    it('shows the organisation its balance, bought and used units', async () => {
      expect((await get(owner, '/sms')).data).toMatchObject({
        mode: 'PLATFORM',
        balance: 100,
        unitsBought: 0,
        unitsUsed: 0,
        unitPrice: '80',
        failing: null,
        canBuyInApp: true,
      });
      await send('+254722000111');
      expect((await get(owner, '/sms')).data).toMatchObject({ balance: 99, unitsUsed: 1 });
      expect((await get(owner, '/sms/quote')).data).toMatchObject({
        unitPrice: '80',
        minUnits: 100,
        bundles: [
          { units: 500, amount: '40000' },
          { units: 1000, amount: '80000' },
          { units: 5000, amount: '400000' },
        ],
      });
    });

    it('masks numbers in the usage list and filters by status', async () => {
      await send('+254722000111');
      await t.prisma.smsAccount.update({ where: { orgId }, data: { balance: 0 } });
      await send('+254722000222');
      const all = await get(owner, '/sms/usage');
      expect(all.data).toHaveLength(2);
      expect(all.data.map((r: { to: string }) => r.to).sort()).toEqual([
        '+2547****111',
        '+2547****222',
      ]);
      const none = (await get(owner, '/sms/usage?status=NO_UNITS')).data;
      expect(none).toMatchObject([{ status: 'NO_UNITS', to: '+2547****222', units: 0 }]);
    });

    it('lets owners set the low-balance level, and the fallback only on their own SMS', async () => {
      await patch(owner, '/sms', { fallbackToPlatform: true }, 422);
      expect((await patch(owner, '/sms', { lowBalanceLevel: 20 })).data).toMatchObject({
        lowBalanceLevel: 20,
      });
    });

    it('only KodiHub admin can switch an organisation to its own SMS', async () => {
      await put(owner, `/platform/organizations/${orgId}/sms`, ownSetup(), 403);
      const view = (await put(admin, `/platform/organizations/${orgId}/sms`, ownSetup())).data;
      expect(view).toMatchObject({
        mode: 'OWN',
        provider: 'TEXTSMS',
        senderId: 'MAKINI',
        hasApiKey: true,
      });
      const again = (await get(admin, `/platform/organizations/${orgId}/sms`)).data;
      expect(JSON.stringify(again)).not.toContain('textsms-secret-key');
      expect((await get(owner, '/sms')).data).toMatchObject({ mode: 'OWN', senderId: 'MAKINI' });
      expect(
        (await patch(owner, '/sms', { fallbackToPlatform: true })).data.fallbackToPlatform,
      ).toBe(true);
    });

    it('asks for every own-SMS detail before switching', async () => {
      const missingSender = await t
        .http()
        .put(`/api/v1/platform/organizations/${orgId}/sms`)
        .set(auth(admin))
        .send({ mode: 'OWN', provider: 'TEXTSMS', providerUser: '1', apiKey: 'k' });
      expect(missingSender.status).toBe(422);
      expect(JSON.stringify(missingSender.body)).toContain('senderId');
      const missingPassword = await t
        .http()
        .put(`/api/v1/platform/organizations/${orgId}/sms`)
        .set(auth(admin))
        .send({
          mode: 'OWN',
          provider: 'HOSTPINNACLE',
          providerUser: 'u',
          apiKey: 'k',
          senderId: 'X',
        });
      expect(missingPassword.status).toBe(422);
      expect(JSON.stringify(missingPassword.body)).toContain('password');
    });

    it('sends an admin test SMS through the organisation account', async () => {
      await put(admin, `/platform/organizations/${orgId}/sms`, ownSetup('ok-key'));
      outbox.length = 0;
      const ok = (
        await post(admin, `/platform/organizations/${orgId}/sms/test`, { phone: '0722000111' }, 200)
      ).data;
      expect(ok).toEqual({ sent: true, reason: null });
      expect(outbox.at(-1)).toMatchObject({ to: '+254722000111', via: `org:${orgId}` });
      await put(admin, `/platform/organizations/${orgId}/sms`, ownSetup('test-reject'));
      const bad = (
        await post(admin, `/platform/organizations/${orgId}/sms/test`, { phone: '0722000111' }, 200)
      ).data;
      expect(bad).toEqual({ sent: false, reason: 'The SMS provider rejected the API key' });
    });

    it('adjusts units with a reason and never below zero', async () => {
      const url = `/platform/organizations/${orgId}/sms/adjust`;
      await post(admin, url, { units: -200, reason: 'Correction' }, 422);
      await post(admin, url, { units: 50 }, 422);
      await post(owner, url, { units: 50, reason: 'Bank payment' }, 403);
      expect(
        (await post(admin, url, { units: 50, reason: 'Bank payment' }, 200)).data,
      ).toMatchObject({ balance: 150 });
      expect(
        await t.prisma.smsLedgerEntry.findFirst({ where: { orgId, reason: 'Bank payment' } }),
      ).toMatchObject({ kind: 'ADJUSTMENT', units: 50, balanceAfter: 150 });
      const topUps = (await get(owner, '/sms/top-ups')).data;
      expect(topUps.map((r: { reason: string | null }) => r.reason)).toEqual([
        'Bank payment',
        'Opening balance',
      ]);
    });

    it('reports SMS sold and used per organisation for a month', async () => {
      await t
        .http()
        .post(`/api/v1/hooks/platform/${token}/c2b/confirm`)
        .send(c2b('SMSRPT001', smsRef, 400))
        .expect(200);
      await send('+254722000111');
      const rows = (await get(admin, `/platform/reports/sms?month=${TODAY.slice(0, 7)}`)).data;
      expect(rows).toEqual([
        expect.objectContaining({
          orgId,
          name: 'Makini Homes',
          unitsBought: 500,
          amountPaid: '40000',
          unitsUsed: 1,
        }),
      ]);
    });

    it('lets KodiHub admin choose its provider and prices', async () => {
      // The form always sends the provider in use (Africa's Talking by default, even with nothing
      // saved in the database): that never blocks a price change.
      await t
        .http()
        .put('/api/v1/platform/settings')
        .set(auth(admin))
        .send({ smsProvider: 'AFRICASTALKING', smsUnitPrice: 95 })
        .expect(200);
      const header = await stepUp(t, admin, ADMIN_PHONE);
      const body = {
        smsProvider: 'TEXTSMS',
        textsmsPartnerId: '9876',
        textsmsApiKey: 'platform-textsms-secret',
        textsmsSenderId: 'KODIHUB',
        smsUnitPrice: 90,
        smsBundles: [200, 600],
        smsMinUnits: 100,
        smsFreeUnits: 50,
      };
      const view = check(
        await t
          .http()
          .put('/api/v1/platform/settings')
          .set(auth(admin))
          .set({ 'X-Step-Up': header })
          .send(body),
        200,
      ).data;
      expect(view.sms).toMatchObject({
        provider: 'TEXTSMS',
        textsms: { partnerId: '9876', senderId: 'KODIHUB', apiKeySet: true },
        unitPrice: '90',
        bundles: [200, 600],
        minUnits: 100,
        freeUnits: 50,
      });
      expect(JSON.stringify(view)).not.toContain('platform-textsms-secret');
      const incomplete = await t
        .http()
        .put('/api/v1/platform/settings')
        .set(auth(admin))
        .send({ smsProvider: 'HOSTPINNACLE' });
      expect(incomplete.status).toBe(422);
      expect(JSON.stringify(incomplete.body)).toContain('smsProvider');
      const tooSmall = await t
        .http()
        .put('/api/v1/platform/settings')
        .set(auth(admin))
        .send({ smsBundles: [50] });
      expect(tooSmall.status).toBe(422);
    });
  });
});
