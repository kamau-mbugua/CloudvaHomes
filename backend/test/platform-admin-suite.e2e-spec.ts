import { todayInNairobi } from '../src/modules/billing/billing-math.js';
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
  type TestApp,
} from './helpers.js';

type Res = { status: number; body: any };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('Platform Admin Suite — Phase 11 (e2e)', () => {
  let t: TestApp;
  let admin: Session;

  const post = async (s: Session, path: string, body: object = {}, status = 200) =>
    check(await t.http().post(`/api/v1${path}`).set(auth(s)).send(body), status);
  const put = async (s: Session, path: string, body: object, status = 200) =>
    check(await t.http().put(`/api/v1${path}`).set(auth(s)).send(body), status);
  const patch = async (s: Session, path: string, body: object, status = 200) =>
    check(await t.http().patch(`/api/v1${path}`).set(auth(s)).send(body), status);
  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma, 'admin@hodi.test');
    admin = await login(t, 'admin@hodi.test');
  });

  it('manages operators (salespeople & superadmins), assigns unassigned orgs, and enforces salesperson book scoping', async () => {
    // Create a plan
    const plan = (
      await post(
        admin,
        '/platform/plans',
        { name: 'Standard', pricePerUnit: 25000, minimumMonthly: 100000, isDefault: true },
        201,
      )
    ).data;

    // Admin creates an unassigned org
    const unassignedOrg = await onboardOrg(t, admin, {
      name: 'Unassigned Heights',
      ownerEmail: 'olive1@example.invalid',
      ownerPhone: '+254711000001',
    });

    // Create a salesperson operator
    const spCreated = (
      await post(
        admin,
        '/platform/operators',
        {
          firstName: 'Grace',
          lastName: 'Wanjiku',
          email: 'grace@hodi.test',
          phone: '0722111222',
          role: 'SALESPERSON',
          password: PASSWORD,
        },
        201,
      )
    ).data;
    expect(spCreated.role).toBe('SALESPERSON');
    expect(spCreated.organizationsCount).toBe(0);

    // Salesperson logs in and sees platformRole = SALESPERSON
    const spSession = await login(t, 'grace@hodi.test');
    expect((spSession.body.user as any).platformRole).toBe('SALESPERSON');
    expect((spSession.body.user as any).isPlatformAdmin).toBe(false);

    // Salesperson creates an organisation -> automatically assigned to their book
    const spOrgRes = await post(
      spSession,
      '/platform/organizations',
      {
        name: 'Grace Properties',
        kind: 'LANDLORD',
        phone: '0722333444',
        email: 'office@graceprops.test',
        planId: plan.id,
        owner: {
          firstName: 'Peter',
          lastName: 'Kamau',
          email: 'peter@graceprops.test',
          phone: '0722333445',
        },
      },
      201,
    );
    expect(spOrgRes.data.onboardedById).toBe(spCreated.id);

    // Salesperson only sees their own organisation in GET /platform/organizations
    const spOrgs = await get(spSession, '/platform/organizations');
    expect(spOrgs.data).toHaveLength(1);
    expect(spOrgs.data[0].id).toBe(spOrgRes.data.id);

    // Salesperson gets 404 when trying to view the unassigned organisation
    await get(spSession, `/platform/organizations/${unassignedOrg.orgId}`, 404);

    // Salesperson is forbidden from superadmin-only endpoints
    await get(spSession, '/platform/settings', 403);
    await get(spSession, '/platform/operators', 403);
    await get(spSession, '/platform/reports/salespeople', 403);

    // Admin sees 1 unassigned organisation and assigns it to Grace
    const unassignedList = (await get(admin, '/platform/organizations/unassigned')).data;
    expect(unassignedList).toHaveLength(1);
    expect(unassignedList[0].id).toBe(unassignedOrg.orgId);

    const assignRes = await post(
      admin,
      `/platform/operators/${spCreated.id}/assign-organizations`,
      { organizationIds: [unassignedOrg.orgId] },
    );
    expect(assignRes.data.assigned).toBe(1);

    // Now Grace sees both organisations!
    const spOrgsAfter = await get(spSession, '/platform/organizations');
    expect(spOrgsAfter.data).toHaveLength(2);

    // Admin cannot demote/disable themselves
    await patch(admin, `/platform/operators/${admin.body.user.id}`, { status: 'DISABLED' }, 409);
  });

  it('requires a 6-digit 2FA code for platform operators when requireAdminTwoFactor is enabled', async () => {
    // Enable Admin 2FA via EMAIL
    const updatedSettings = (
      await put(admin, '/platform/settings', {
        requireAdminTwoFactor: true,
        adminTwoFactorChannel: 'EMAIL',
      })
    ).data;
    expect(updatedSettings.requireAdminTwoFactor).toBe(true);
    expect(updatedSettings.adminTwoFactorChannel).toBe('EMAIL');

    // Now logging in with password returns requiresTwoFactor challenge instead of a session
    const step1 = await t
      .http()
      .post('/api/v1/auth/login')
      .send({ identifier: 'admin@hodi.test', password: PASSWORD })
      .expect(200);
    expect(step1.body.data.requiresTwoFactor).toBe(true);
    expect(step1.body.data.channel).toBe('EMAIL');
    expect(step1.body.data.challengeToken).toBeDefined();

    // Verify 6-digit code at /auth/login/2fa
    const code = lastCode('admin@hodi.test');
    const step2 = await t
      .http()
      .post('/api/v1/auth/login/2fa')
      .send({ challengeToken: step1.body.data.challengeToken, code })
      .expect(200);
    expect(step2.body.data.accessToken).toBeDefined();
    expect(step2.body.data.user.isPlatformAdmin).toBe(true);
  });

  it('configures Email SMTP settings, sends test & broadcast emails, and records PlatformEmailLog entries', async () => {
    await onboardOrg(t, admin, {
      name: 'Kilimani Estates',
      ownerEmail: 'owner@kilimani.test',
      ownerPhone: '+254711222333',
    });

    // Save SMTP settings
    const smtp = (
      await put(admin, '/platform/email/settings', {
        host: 'smtp.example.com',
        port: 587,
        username: 'mailer@example.com',
        password: 'super-secret-smtp-pass',
        encryption: 'tls',
        fromEmail: 'noreply@hodi.co.ke',
        fromName: 'Hodi Platform',
        allowlist: '',
      })
    ).data;
    expect(smtp.host).toBe('smtp.example.com');
    expect(smtp.passwordSet).toBe(true);
    expect(smtp.source).toBe('database');

    // Send a test email
    const testRes = await post(admin, '/platform/email/test', { to: 'check@kilimani.test' });
    expect(testRes.data.sent).toBe(true);

    // Send a broadcast to active organisation owners
    const broadcastRes = await post(admin, '/platform/email/broadcast', {
      subject: 'Scheduled Maintenance Tonight',
      body: 'Hodi will undergo 10 minutes of maintenance at midnight EAT.',
    });
    expect(broadcastRes.data.total).toBe(1);
    expect(broadcastRes.data.sent).toBe(1);

    // Verify email logs recorded the invitation, test, and broadcast emails
    const logs = await get(admin, '/platform/email/logs');
    expect(logs.data.length).toBeGreaterThanOrEqual(3);
    const kinds = logs.data.map((l: any) => l.kind);
    expect(kinds).toContain('invitation');
    expect(kinds).toContain('test');
    expect(kinds).toContain('broadcast');
  });

  it('serves all 11 superadmin reports', async () => {
    await post(
      admin,
      '/platform/plans',
      { name: 'Growth', pricePerUnit: 30000, minimumMonthly: 150000, isDefault: true },
      201,
    );
    const { orgId } = await onboardOrg(t, admin, {
      name: 'Westlands Agency',
      ownerEmail: 'west@agency.test',
      ownerPhone: '+254711999888',
      kind: 'AGENCY',
    });

    // Custom price override on the org
    await patch(admin, `/platform/organizations/${orgId}`, {
      priceOverride: 25000,
      minimumOverride: 120000,
    });

    // Record a manual platform payment
    await post(
      admin,
      '/platform/payments',
      {
        orgId,
        amount: 150000,
        method: 'MPESA',
        reference: 'QWE12345TY',
        receivedAt: todayInNairobi(),
      },
      201,
    );

    const collections = (await get(admin, '/platform/reports/collections')).data;
    expect(collections.totals.count).toBe(1);
    expect(collections.totals.amount).toBe(150000);

    const aged = (await get(admin, '/platform/reports/aged-receivables')).data;
    expect(aged.totals).toBeDefined();

    const activity = (await get(admin, '/platform/reports/activity')).data;
    expect(activity.rows.length).toBe(1);
    expect(activity.rows[0].name).toBe('Westlands Agency');

    const subChanges = (await get(admin, '/platform/reports/subscription-changes')).data;
    expect(subChanges.rows.length).toBeGreaterThanOrEqual(2);

    const onboarding = (await get(admin, '/platform/reports/onboarding')).data;
    expect(onboarding.totals.created).toBe(1);
    expect(onboarding.totals.ownerAccepted).toBe(1);
    expect(onboarding.totals.paidHodi).toBe(1);

    const invoices = (await get(admin, '/platform/reports/invoices')).data;
    expect(invoices.totals).toBeDefined();

    const plans = (await get(admin, '/platform/reports/plans')).data;
    expect(plans.rows.length).toBeGreaterThanOrEqual(1);

    const reconciliation = (await get(admin, '/platform/reports/reconciliation')).data;
    expect(reconciliation.totals.unallocatedCount).toBe(1);

    const priceVariance = (await get(admin, '/platform/reports/price-variance')).data;
    expect(priceVariance.totals.customizedCount).toBe(1);

    const salespeople = (await get(admin, '/platform/reports/salespeople')).data;
    expect(salespeople.totals.organizationsTotal).toBe(1);

    const audit = await get(admin, '/platform/reports/audit');
    expect(audit.data.length).toBeGreaterThan(0);
  });
});
