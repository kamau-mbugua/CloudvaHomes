import { outbox } from '../src/modules/notifications/senders.js';
import {
  addMember,
  auth,
  createPlatformAdmin,
  createTestApp,
  login,
  onboardOrg,
  PASSWORD,
  refreshCookieFrom,
  resetDb,
  type Session,
  stepUp,
  type TestApp,
  lastCode,
} from './helpers.js';

const OWNER = { email: 'devices@example.invalid', phone: '+254700000061' };
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

describe('My devices and new-device alerts (phase 26, e2e)', () => {
  let t: TestApp;
  let owner: Session;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    const admin = await login(t, 'admin@example.invalid');
    ({ owner } = await onboardOrg(t, admin, {
      name: 'Devices Org',
      ownerEmail: OWNER.email,
      ownerPhone: OWNER.phone,
    }));
  });

  const alerts = () =>
    outbox.filter((m) => m.to === OWNER.email && /was just signed in to on/.test(m.text));

  it('lists signed-in devices, signs one out, and alerts on a new device only', async () => {
    const before = alerts().length;
    // A sign-in from a device this account hasn't used: alert by email and in the app.
    const res = await t
      .http()
      .post('/api/v1/auth/login')
      .set('User-Agent', WINDOWS)
      .send({ identifier: OWNER.email, password: PASSWORD })
      .expect(200);
    const windows: Session = {
      token: res.body.data.accessToken,
      refreshCookie: refreshCookieFrom(res),
      body: res.body.data,
    };
    expect(alerts().length).toBe(before + 1);
    expect(alerts().at(-1)!.text).toContain('Chrome on Windows');
    expect(await t.prisma.userNotification.count({ where: { kind: 'NEW_DEVICE_SIGN_IN' } })).toBe(
      1,
    );

    // The same device again: no new alert.
    await t
      .http()
      .post('/api/v1/auth/login')
      .set('User-Agent', WINDOWS)
      .send({ identifier: OWNER.email, password: PASSWORD })
      .expect(200);
    expect(alerts().length).toBe(before + 1);

    const list = (await t.http().get('/api/v1/me/sessions').set(auth(windows)).expect(200)).body
      .data as { id: string; device: string; current: boolean }[];
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.filter((s) => s.current)).toHaveLength(1);
    expect(list.find((s) => s.current)!.device).toBe('Chrome on Windows');

    // Sign the first (owner's original) session out from the Windows one.
    const other = list.find((s) => !s.current && s.device !== 'Chrome on Windows')!;
    await t.http().delete(`/api/v1/me/sessions/${other.id}`).set(auth(windows)).expect(204);
    await t
      .http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', owner.refreshCookie!)
      .send({})
      .expect(401);
    // Someone else's session id is not found.
    await t
      .http()
      .delete('/api/v1/me/sessions/0b9c7d6e-1111-4222-8333-444455556666')
      .set(auth(windows))
      .expect(404);
  });

  it('phase 26: an organisation can ask staff who handle money for a second code', async () => {
    const caretaker = await addMember(t, owner, {
      email: 'devices-caretaker@example.invalid',
      phone: '+254700000062',
      role: 'CARETAKER',
    });
    // Turning it on needs a fresh code.
    const set = (headers: Record<string, string> = {}) =>
      t
        .http()
        .patch('/api/v1/organization')
        .set(auth(owner))
        .set(headers)
        .send({ staffTwoFactor: 'MONEY_ROLES' });
    expect((await set()).body.error.code).toBe('STEP_UP_REQUIRED');
    const up = await stepUp(t, owner, OWNER.phone);
    expect((await set({ 'X-Step-Up': up })).body.data.staffTwoFactor).toBe('MONEY_ROLES');

    // The owner (who can change payment channels) gets a challenge, by SMS…
    const step1 = await t
      .http()
      .post('/api/v1/auth/login')
      .send({ identifier: OWNER.email, password: PASSWORD })
      .expect(200);
    expect(step1.body.data).toMatchObject({ requiresTwoFactor: true, channel: 'SMS' });
    const step2 = await t
      .http()
      .post('/api/v1/auth/login/2fa')
      .send({ challengeToken: step1.body.data.challengeToken, code: lastCode(OWNER.phone) })
      .expect(200);
    expect(step2.body.data.accessToken).toBeDefined();

    // …the caretaker (no money permissions) signs straight in.
    const plain = await t
      .http()
      .post('/api/v1/auth/login')
      .send({ identifier: 'devices-caretaker@example.invalid', password: PASSWORD })
      .expect(200);
    expect(plain.body.data.accessToken).toBeDefined();
    expect(caretaker.userId).toBeDefined();
  });
});
