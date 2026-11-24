import { outbox } from '../src/modules/notifications/senders.js';
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

type Res = { status: number; body: any };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('Vendors and assigning maintenance jobs (phase 18, e2e)', () => {
  let t: TestApp;
  let owner: Session;
  const get = async (path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(owner)), status);
  const post = async (path: string, body: object, status = 201) =>
    check(await t.http().post(`/api/v1${path}`).set(auth(owner)).send(body), status);
  const patch = async (path: string, body: object, status = 200) =>
    check(await t.http().patch(`/api/v1${path}`).set(auth(owner)).send(body), status);

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    const admin = await login(t, 'admin@example.invalid');
    ({ owner } = await onboardOrg(t, admin, {
      name: 'Fixit Org',
      ownerEmail: 'fixit@example.invalid',
      ownerPhone: '+254700000091',
    }));
  });

  it('keeps vendors, sends a job to one by SMS, and flags late jobs', async () => {
    const plumber = (
      await post('/vendors', { name: 'Juma Plumbing', phone: '0733 100 200', trades: ['PLUMBING'] })
    ).data;
    expect(plumber).toMatchObject({ phone: '+254733100200', trades: ['PLUMBING'], active: true });
    const dup = await post('/vendors', { name: 'Other', phone: '+254733100200' }, 422);
    expect(dup.error.details[0].field).toBe('phone');
    expect((await get('/vendors?trade=ELECTRICAL')).data).toHaveLength(0);

    const p = (await post('/properties', { name: 'Fix Court', code: 'FIX' })).data;
    const u = (await post('/units', { propertyId: p.id, number: 'F1', rentAmount: 1_000_000 }))
      .data;
    const job = (
      await post('/maintenance-requests', {
        unitId: u.id,
        title: 'Kitchen sink leaking',
        description: 'Water under the sink',
        category: 'PLUMBING',
        priority: 'URGENT',
      })
    ).data;

    const assigned = (
      await post(`/maintenance-requests/${job.id}/assign`, { vendorId: plumber.id }, 200)
    ).data;
    expect(assigned).toMatchObject({
      status: 'IN_PROGRESS',
      vendor: { id: plumber.id, name: 'Juma Plumbing' },
    });
    // New organisations start with free SMS units, so the vendor is texted.
    expect(assigned.vendorNotified).toBe(true);
    const sms = outbox.filter((m) => m.to === '+254733100200');
    expect(sms.at(-1)!.text).toContain('Kitchen sink leaking');
    expect(sms.at(-1)!.text).toContain('F1, Fix Court');
    expect(sms.at(-1)!.text).not.toContain('Tenant');
    expect((await get(`/maintenance-requests?vendorId=${plumber.id}`)).data).toHaveLength(1);

    // An archived vendor can't take jobs.
    await patch(`/vendors/${plumber.id}`, { active: false });
    const refused = await post(
      `/maintenance-requests/${job.id}/assign`,
      { vendorId: plumber.id },
      422,
    );
    expect(refused.error.details[0].field).toBe('vendorId');

    // Two days old and urgent: late, on the list filter and the dashboard.
    await t.prisma.maintenanceRequest.update({
      where: { id: job.id },
      data: { createdAt: new Date(Date.now() - 48 * 3_600_000) },
    });
    const late = await get('/maintenance-requests?late=true');
    expect(late.data.map((r: { id: string; overdue: boolean }) => [r.id, r.overdue])).toEqual([
      [job.id, true],
    ]);
    const dash = (await get('/reports/dashboard')).data;
    expect(dash.actions).toContainEqual({ kind: 'WORK_ORDERS_OVERDUE', count: 1 });
  });
});
