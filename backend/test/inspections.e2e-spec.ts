import { todayInNairobi } from '../src/modules/billing/billing-math.js';
import {
  auth,
  createPlatformAdmin,
  createTestApp,
  lastCode,
  login,
  onboardOrg,
  resetDb,
  type Session,
  type TestApp,
} from './helpers.js';

const TODAY = todayInNairobi();
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

type Res = { status: number; body: any; headers: Record<string, string> };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('Move-in and move-out inspections (e2e)', () => {
  let t: TestApp;
  let owner: Session;
  let other: Session;
  const req =
    (method: 'get' | 'post' | 'put') =>
    async (s: Session, path: string, body: object = {}, status = method === 'post' ? 201 : 200) =>
      check(await t.http()[method](`/api/v1${path}`).set(auth(s)).send(body), status);
  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);
  const post = req('post');
  const put = req('put');
  const upload = async (s: Session) =>
    check(
      await t
        .http()
        .post('/api/v1/uploads')
        .set(auth(s))
        .field('purpose', 'INSPECTION_PHOTO')
        .attach('file', PNG, 'kitchen.png'),
      201,
    ).data;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    const admin = await login(t, 'admin@example.invalid');
    ({ owner } = await onboardOrg(t, admin, {
      name: 'Inspect Org',
      ownerEmail: 'insp@example.invalid',
      ownerPhone: '+254700000041',
    }));
    ({ owner: other } = await onboardOrg(t, admin, {
      name: 'Other Org',
      ownerEmail: 'insp-other@example.invalid',
      ownerPhone: '+254700000042',
    }));
  });

  async function setUp() {
    const p = (await post(owner, '/properties', { name: 'Check Court', code: 'CHK' })).data;
    const u = (
      await post(owner, '/units', { propertyId: p.id, number: 'C1', rentAmount: 1_000_000 })
    ).data;
    const ty = (
      await post(owner, '/tenancies', {
        unitId: u.id,
        tenant: { firstName: 'Ivy', lastName: 'Tenant', phone: '0711000801' },
        startDate: TODAY,
        issueMoveInInvoice: false,
      })
    ).data;
    await post(owner, `/tenants/${ty.tenant.id}/portal-access`, {}, 200);
    await t.http().post('/api/v1/auth/otp/request').send({ phone: '0711000801' }).expect(202);
    const res = await t
      .http()
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '0711000801', code: lastCode('+254711000801') })
      .expect(200);
    const ivy: Session = {
      token: res.body.data.accessToken,
      refreshCookie: null,
      body: res.body.data,
    };
    return { ty, ivy, tenantId: ty.tenant.id as string };
  }

  it('records a move-in inspection the tenant can see and acknowledge', async () => {
    const x = await setUp();
    const photo = await upload(owner);
    const saved = (
      await put(owner, `/tenancies/${x.ty.id}/inspections/MOVE_IN`, {
        inspectedOn: TODAY,
        inspectorName: 'Caretaker Joe',
        items: [
          { area: 'Kitchen', condition: 'GOOD', note: 'New sink', photoUploadIds: [photo.id] },
          { area: 'Floors', condition: 'FAIR', photoUploadIds: [] },
        ],
      })
    ).data;
    expect(saved).toMatchObject({ kind: 'MOVE_IN', tenantAcknowledgedAt: null });
    expect(saved.items).toHaveLength(2);

    const pdfRes = await t
      .http()
      .get(`/api/v1/tenancies/${x.ty.id}/inspections/MOVE_IN/pdf`)
      .set(auth(owner));
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toBe('application/pdf');

    const img = await t
      .http()
      .get(`/api/v1/tenancies/${x.ty.id}/inspections/MOVE_IN/photos/${photo.id}`)
      .set(auth(owner));
    expect(img.status).toBe(200);

    // The tenant sees it and acknowledges it; then staff can't silently change it.
    const mine = (
      await get(x.ivy, `/tenant/accounts/${x.tenantId}/tenancies/${x.ty.id}/inspections`)
    ).data;
    expect(mine.map((i: { kind: string }) => i.kind)).toEqual(['MOVE_IN']);
    await post(
      x.ivy,
      `/tenant/accounts/${x.tenantId}/tenancies/${x.ty.id}/inspections/MOVE_IN/acknowledge`,
      {},
      200,
    );
    const edit = {
      inspectedOn: TODAY,
      items: [{ area: 'Kitchen', condition: 'POOR', photoUploadIds: [] }],
    };
    expect(
      (await put(owner, `/tenancies/${x.ty.id}/inspections/MOVE_IN`, edit, 409)).error.code,
    ).toBe('INSPECTION_ACKNOWLEDGED');
    const reopened = (
      await put(owner, `/tenancies/${x.ty.id}/inspections/MOVE_IN`, { ...edit, reopen: true })
    ).data;
    expect(reopened.tenantAcknowledgedAt).toBeNull();
    // The kitchen photo was dropped in that edit: it's released for the clean-up job.
    const dropped = await t.prisma.upload.findUniqueOrThrow({ where: { id: photo.id } });
    expect(dropped.attachedAt).toBeNull();
    expect(dropped.createdAt.getTime()).toBe(0);

    // Another organisation sees nothing.
    await get(other, `/tenancies/${x.ty.id}/inspections`, 404);
  });

  it('validates the checklist and the photos', async () => {
    const x = await setUp();
    const tooMany = Array.from({ length: 31 }, (_, i) => ({
      area: `Area ${i}`,
      condition: 'GOOD',
      photoUploadIds: [],
    }));
    expect(
      (
        await put(
          owner,
          `/tenancies/${x.ty.id}/inspections/MOVE_IN`,
          { inspectedOn: TODAY, items: tooMany },
          422,
        )
      ).error.message,
    ).toBe('At most 30 areas.');
    await put(
      owner,
      `/tenancies/${x.ty.id}/inspections/MOVE_IN`,
      { inspectedOn: TODAY, items: [{ area: 'Kitchen', condition: 'SHINY', photoUploadIds: [] }] },
      422,
    );
    // A photo id that isn't an inspection photo of this organisation is refused.
    await put(
      owner,
      `/tenancies/${x.ty.id}/inspections/MOVE_IN`,
      {
        inspectedOn: TODAY,
        items: [
          {
            area: 'Kitchen',
            condition: 'GOOD',
            photoUploadIds: ['01a1a645-99a3-7779-8670-df7a96682b7e'],
          },
        ],
      },
      422,
    );
  });
});
