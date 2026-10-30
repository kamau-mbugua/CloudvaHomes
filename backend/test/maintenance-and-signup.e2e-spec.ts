import { periodOf, todayInNairobi } from '../src/modules/billing/billing-math.js';
import {
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

const TODAY = todayInNairobi();
const PERIOD = periodOf(TODAY);
const RUN_DATE = `${PERIOD}-01`;
const KES = (major: number) => major * 100;

type Res = { status: number; body: any };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('App Config, Public Signup, Maintenance & Notifications (e2e)', () => {
  let t: TestApp;
  let admin: Session;
  let owner: Session;

  const post = async (
    s: Session,
    path: string,
    body: object = {},
    status = 200,
    headers: Record<string, string> = {},
  ) => check(await t.http().post(`/api/v1${path}`).set(auth(s)).set(headers).send(body), status);
  const patch = async (s: Session, path: string, body: object, status = 200) =>
    check(await t.http().patch(`/api/v1${path}`).set(auth(s)).send(body), status);
  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t?.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    admin = await login(t, 'admin@example.invalid');
    ({ owner } = await onboardOrg(t, admin, {
      name: 'Maintenance Org',
      ownerEmail: 'owner-maint@example.invalid',
      ownerPhone: '+254700000180',
    }));
  });

  it('evaluates app-config and enforces public signup policy on POST /auth/register', async () => {
    const initialCfg = check(
      await t.http().get('/api/v1/auth/app-config?versionCode=1'),
      200,
    ).data;
    expect(initialCfg.allowPublicSignup).toBe(false);
    expect(initialCfg.forceUpdateRequired).toBe(false);

    // Registration rejected when allowPublicSignup is false
    const denied = await t.http().post('/api/v1/auth/register').send({
      organizationName: 'Self Sign Properties',
      organizationKind: 'LANDLORD',
      firstName: 'Mercy',
      lastName: 'Njeri',
      email: 'mercy@selfsign.invalid',
      phone: '0711223344',
      password: PASSWORD,
    });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('SIGNUP_DISABLED');

    // Platform admin enables allowPublicSignup and sets minAppVersionCode = 5
    const step = await stepUp(t, admin, '+254700000099');
    await t
      .http()
      .put('/api/v1/platform/settings')
      .set(auth(admin))
      .set('X-Step-Up', step)
      .send({
        allowPublicSignup: true,
        minAppVersionCode: 5,
        minAppVersionName: '1.2.0',
        appUpdateMessage: 'Please update to v1.2.0',
      })
      .expect(200);

    const updatedCfg = check(
      await t.http().get('/api/v1/auth/app-config?versionCode=3'),
      200,
    ).data;
    expect(updatedCfg.allowPublicSignup).toBe(true);
    expect(updatedCfg.forceUpdateRequired).toBe(true);
    expect(updatedCfg.minAppVersionName).toBe('1.2.0');

    // Registration succeeds when allowPublicSignup is true
    const reg = check(
      await t.http().post('/api/v1/auth/register').send({
        organizationName: 'Self Sign Properties',
        organizationKind: 'LANDLORD',
        firstName: 'Mercy',
        lastName: 'Njeri',
        email: 'mercy@selfsign.invalid',
        phone: '0711223344',
        password: PASSWORD,
      }),
      201,
    ).data;
    expect(reg.accessToken).toBeDefined();
    expect(reg.activeOrganization.name).toBe('Self Sign Properties');
    expect(reg.permissions).toContain('properties:create');
  });

  it('handles full tenant -> staff maintenance request lifecycle, expense conversion, and notifications', async () => {
    const prop = (
      await post(owner, '/properties', { name: 'Kilimani Heights', code: 'KIL' }, 201)
    ).data;
    await post(
      owner,
      '/units/bulk',
      { propertyId: prop.id, numbers: ['A1'], rentAmount: KES(25000) },
      201,
    );
    const units = (await get(owner, `/units?propertyId=${prop.id}`)).data;
    const unit = units[0];

    const tenancy = (
      await post(
        owner,
        '/tenancies',
        {
          unitId: unit.id,
          tenant: {
            firstName: 'Amina',
            lastName: 'Hassan',
            phone: '+254722111222',
            email: 'amina@example.invalid',
          },
          startDate: RUN_DATE,
          billingDay: 1,
        },
        201,
      )
    ).data;

    await post(owner, `/tenants/${tenancy.tenant.id}/portal-access`, {}, 200);

    // Sign in as tenant via OTP
    await t
      .http()
      .post('/api/v1/auth/otp/request')
      .send({ phone: '0722111222' })
      .expect(202);
    const otpVerify = check(
      await t
        .http()
        .post('/api/v1/auth/otp/verify')
        .send({ phone: '0722111222', code: lastCode('+254722111222') }),
      200,
    ).data;
    const tenantSession: Session = {
      token: otpVerify.accessToken,
      refreshCookie: null,
      body: otpVerify,
    };

    // Tenant creates a maintenance request
    const createdReq = (
      await post(
        tenantSession,
        `/tenant/accounts/${tenancy.tenant.id}/requests`,
        {
          unitId: unit.id,
          category: 'PLUMBING',
          priority: 'HIGH',
          title: 'Kitchen sink pipe leaking',
          description: 'Water dripping under the kitchen cabinet since morning.',
        },
        201,
      )
    ).data;
    expect(createdReq.number).toMatch(/^MNT-\d{4}-000001$/);
    expect(createdReq.status).toBe('OPEN');
    expect(createdReq.category).toBe('PLUMBING');

    // Tenant lists their requests
    const tenantReqs = await get(tenantSession, `/tenant/accounts/${tenancy.tenant.id}/requests`);
    expect(tenantReqs.data).toHaveLength(1);

    // Owner/Staff receives an in-app notification for the new maintenance request
    const ownerNotifs = await get(owner, '/notifications');
    expect(ownerNotifs.meta.unreadCount).toBeGreaterThanOrEqual(1);
    expect(ownerNotifs.data[0].kind).toBe('MAINTENANCE_CREATED');

    // Staff lists maintenance requests and sees server-computed eligibility flags
    const staffList = await get(owner, '/maintenance-requests');
    expect(staffList.data).toHaveLength(1);
    expect(staffList.meta.counts.open).toBe(1);
    expect(staffList.data[0].canResolve).toBe(true);
    expect(staffList.data[0].canConvertToExpense).toBe(true);

    // Staff converts maintenance request into a REPAIRS expense
    const withExpense = (
      await post(owner, `/maintenance-requests/${createdReq.id}/expense`, {
        amount: KES(3500),
        payee: 'QuickFix Plumbers',
      })
    ).data;
    expect(withExpense.status).toBe('IN_PROGRESS');
    expect(withExpense.expense).toBeDefined();
    expect(withExpense.expense.amount).toBe(KES(3500));
    expect(withExpense.canConvertToExpense).toBe(false);

    // Staff resolves the maintenance request
    const resolved = (
      await patch(owner, `/maintenance-requests/${createdReq.id}`, {
        status: 'RESOLVED',
        resolutionNote: 'Replaced P-trap and tightened fitting.',
      })
    ).data;
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.canResolve).toBe(false);

    // Tenant receives an in-app notification about the resolution and marks it read
    const tenantNotifs = await get(tenantSession, '/notifications');
    expect(tenantNotifs.meta.unreadCount).toBe(1);
    expect(tenantNotifs.data[0].kind).toBe('MAINTENANCE_UPDATE');

    await post(tenantSession, `/notifications/${tenantNotifs.data[0].id}/read`, {});
    const afterRead = await get(tenantSession, '/notifications');
    expect(afterRead.meta.unreadCount).toBe(0);

    // Register & unregister push device token
    await post(tenantSession, '/notifications/devices', {
      token: 'fcm-test-device-token-12345',
      platform: 'android',
    });
  });
});
