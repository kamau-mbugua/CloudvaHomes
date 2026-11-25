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
    expect(assigned.hasVendorLink).toBe(true);
    const sms = outbox.filter((m) => m.to === '+254733100200');
    expect(sms.at(-1)!.text).toContain('Kitchen sink leaking');
    expect(sms.at(-1)!.text).toContain('F1, Fix Court');
    expect(sms.at(-1)!.text).toContain('/r/');
    expect(sms.at(-1)!.text).not.toContain('Tenant');
    expect((await get(`/maintenance-requests?vendorId=${plumber.id}`)).data).toHaveLength(1);

    // Staff can read the vendor link URL; public vendor page opens without auth and hides tenant PII.
    const linkRes = (await get(`/maintenance-requests/${job.id}/vendor-link`)).data;
    expect(linkRes.url).toMatch(/\/r\/[A-Za-z0-9_-]{16,}$/);
    const token = linkRes.url.split('/r/')[1]!;
    expect(sms.at(-1)!.text).toContain(token);

    const publicJob = check(await t.http().get(`/api/v1/public/vendor-jobs/${token}`), 200).data;
    expect(publicJob).toMatchObject({
      number: job.number,
      title: 'Kitchen sink leaking',
      status: 'IN_PROGRESS',
      property: { name: 'Fix Court' },
      unit: { number: 'F1' },
      organization: { name: 'Fixit Org', phone: '+254711000000' },
      vendor: { name: 'Juma Plumbing' },
    });
    expect(publicJob.tenant).toBeUndefined();

    // Vendor uploads a photo and marks the job done.
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
    const uploaded = check(
      await t
        .http()
        .post(`/api/v1/public/vendor-jobs/${token}/photos`)
        .attach('file', jpeg, 'fixed.jpg'),
      201,
    ).data;
    // The photo is on the job as soon as it's uploaded, before any report is sent.
    expect(
      check(await t.http().get(`/api/v1/public/vendor-jobs/${token}`), 200).data
        .vendorPhotoUploadIds,
    ).toEqual([uploaded.id]);
    const completed = check(
      await t
        .http()
        .post(`/api/v1/public/vendor-jobs/${token}/complete`)
        .send({ note: 'Replaced trap and seal', photoUploadIds: [uploaded.id] }),
      200,
    ).data;
    expect(completed.vendorNote).toBe('Replaced trap and seal');
    expect(completed.vendorPhotoUploadIds).toEqual([uploaded.id]);
    expect(completed.vendorCompletedAt).toBeTruthy();

    // Both the vendor and staff can view the completion photo.
    check(await t.http().get(`/api/v1/public/vendor-jobs/${token}/photos/${uploaded.id}`), 200);
    check(
      await t
        .http()
        .get(`/api/v1/maintenance-requests/${job.id}/photos/${uploaded.id}`)
        .set(auth(owner)),
      200,
    );

    // Staff view includes the vendor's completion report; status stays IN_PROGRESS until staff resolve.
    const staffView = (await get(`/maintenance-requests/${job.id}`)).data;
    expect(staffView.status).toBe('IN_PROGRESS');
    expect(staffView.vendorNote).toBe('Replaced trap and seal');
    expect(staffView.vendorPhotoUploadIds).toEqual([uploaded.id]);
    expect(staffView.vendorCompletedAt).toBeTruthy();

    // Rotating the link invalidates the old token.
    const rotated = (await post(`/maintenance-requests/${job.id}/vendor-link/rotate`, {}, 200))
      .data;
    const newToken = rotated.url.split('/r/')[1]!;
    expect(newToken).not.toBe(token);
    check(await t.http().get(`/api/v1/public/vendor-jobs/${token}`), 404);
    check(await t.http().get(`/api/v1/public/vendor-jobs/${newToken}`), 200);

    // The link itself isn't stored: only a hash and an encrypted copy.
    const stored = await t.prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.vendorTokenHash).not.toContain(newToken);
    expect(Buffer.from(stored.vendorTokenEnc!).toString('latin1')).not.toContain(newToken);
    expect((await get(`/maintenance-requests/${job.id}/vendor-link`)).data.url).toBe(rotated.url);

    // Moving the job to another vendor retires the first vendor's link.
    const second = (
      await post('/vendors', { name: 'Otieno Fixers', phone: '0733 100 299', trades: ['PLUMBING'] })
    ).data;
    await post(`/maintenance-requests/${job.id}/assign`, { vendorId: second.id }, 200);
    check(await t.http().get(`/api/v1/public/vendor-jobs/${newToken}`), 404);
    const secondUrl = (await get(`/maintenance-requests/${job.id}/vendor-link`)).data.url;
    expect(secondUrl).not.toBe(rotated.url);
    const secondToken = secondUrl.split('/r/')[1]!;
    expect(
      check(await t.http().get(`/api/v1/public/vendor-jobs/${secondToken}`), 200).data.vendor,
    ).toEqual({ name: 'Otieno Fixers' });
    // Re-assigning the same vendor keeps their link.
    await post(`/maintenance-requests/${job.id}/assign`, { vendorId: second.id }, 200);
    expect((await get(`/maintenance-requests/${job.id}/vendor-link`)).data.url).toBe(secondUrl);
    // Taking the vendor off ends the link, and there's no link without a vendor.
    await post(`/maintenance-requests/${job.id}/assign`, { vendorId: null }, 200);
    check(await t.http().get(`/api/v1/public/vendor-jobs/${secondToken}`), 404);
    await get(`/maintenance-requests/${job.id}/vendor-link`, 409);
    await post(`/maintenance-requests/${job.id}/assign`, { vendorId: second.id }, 200);
    const newToken2 = (await get(`/maintenance-requests/${job.id}/vendor-link`)).data.url.split(
      '/r/',
    )[1]!;

    // Once staff resolve the job, the vendor can no longer submit updates.
    await patch(`/maintenance-requests/${job.id}`, { status: 'RESOLVED' });
    check(
      await t
        .http()
        .post(`/api/v1/public/vendor-jobs/${newToken2}/complete`)
        .send({ note: 'Extra note' }),
      409,
    );
    // The vendor can still look at it for a week after it closes, then the link ends.
    check(await t.http().get(`/api/v1/public/vendor-jobs/${newToken2}`), 200);
    await t.prisma.maintenanceRequest.update({
      where: { id: job.id },
      data: { resolvedAt: new Date(Date.now() - 8 * 24 * 3_600_000) },
    });
    check(await t.http().get(`/api/v1/public/vendor-jobs/${newToken2}`), 404);
    await patch(`/maintenance-requests/${job.id}`, { status: 'IN_PROGRESS' });
    // The vendor's report is in the audit log.
    expect(await t.prisma.auditLog.count({ where: { action: 'maintenance.vendor_report' } })).toBe(
      1,
    );

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
