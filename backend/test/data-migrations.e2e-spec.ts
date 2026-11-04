import { readFileSync } from 'node:fs';
import {
  auth,
  createPlatformAdmin,
  createTestApp,
  login,
  onboardOrg,
  resetDb,
  type TestApp,
} from './helpers.js';

const MIGRATION = new URL(
  '../prisma/migrations/20261104170000_backfill_maintenance_permissions/migration.sql',
  import.meta.url,
);
const REBRAND = new URL(
  '../prisma/migrations/20261104180000_rebrand_deposit_note/migration.sql',
  import.meta.url,
);
const MAINTENANCE = ['maintenance:create', 'maintenance:update', 'maintenance:view'];

/** Organisations created before phase 12 have built-in roles without the maintenance permissions. */
describe('Maintenance permission backfill (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());

  it('gives the built-in roles the maintenance permissions their defaults have, once', async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    const admin = await login(t, 'admin@example.invalid');
    await onboardOrg(t, admin, {
      name: 'Old Org',
      ownerEmail: 'old-owner@example.invalid',
      ownerPhone: '+254700000071',
    });
    // Make the roles look like they did before phase 12; leave one custom role alone.
    const roles = await t.prisma.role.findMany();
    for (const r of roles) {
      await t.prisma.role.update({
        where: { id: r.id },
        data: { permissions: r.permissions.filter((p) => !p.startsWith('maintenance:')) },
      });
    }
    const orgId = roles[0]!.orgId;
    await t.prisma.role.create({
      data: { orgId, name: 'Custom', permissions: ['tenants:view'] },
    });

    const sql = readFileSync(MIGRATION, 'utf8');
    await t.prisma.$executeRawUnsafe(sql);
    await t.prisma.$executeRawUnsafe(sql); // running twice adds nothing twice

    const after = Object.fromEntries(
      (await t.prisma.role.findMany()).map((r) => [
        r.systemKey ?? r.name,
        r.permissions.filter((p) => p.startsWith('maintenance:')).sort(),
      ]),
    );
    expect(after).toEqual({
      OWNER: [],
      MANAGER: MAINTENANCE,
      CARETAKER: MAINTENANCE,
      ACCOUNTANT: ['maintenance:view'],
      Custom: [],
    });
  });
});

describe('KodiHub rename of stored deposit notes (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());

  it('renames the automatic opening-deposit note and leaves others alone', async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    const admin = await login(t, 'admin@example.invalid');
    const { owner } = await onboardOrg(t, admin, {
      name: 'Old Org',
      ownerEmail: 'old-owner2@example.invalid',
      ownerPhone: '+254700000072',
    });
    const post = async (path: string, body: object) => {
      const res = await t.http().post(`/api/v1${path}`).set(auth(owner)).send(body);
      if (res.status !== 201) throw new Error(`${path}: ${res.status} ${JSON.stringify(res.body)}`);
      return res.body.data;
    };
    const p = await post('/properties', { name: 'Acacia', code: 'ACA' });
    const moveIn = async (number: string, phone: string) => {
      const u = await post('/units', { propertyId: p.id, number, rentAmount: 1_000_000 });
      return post('/tenancies', {
        unitId: u.id,
        tenant: { firstName: 'Ann', lastName: number, phone },
        startDate: new Date().toISOString().slice(0, 10),
        depositHeld: 2_000_000,
        issueMoveInInvoice: false,
      });
    };
    const old = await moveIn('A1', '0711000801');
    const edited = await moveIn('A2', '0711000802');
    await t.prisma.depositTransaction.updateMany({
      where: { tenancyId: old.id },
      data: { note: 'Deposit held before Hodi' },
    });
    await t.prisma.depositTransaction.updateMany({
      where: { tenancyId: edited.id },
      data: { note: 'Agreed with Hodi team' },
    });

    await t.prisma.$executeRawUnsafe(readFileSync(REBRAND, 'utf8'));

    const notes = Object.fromEntries(
      (await t.prisma.depositTransaction.findMany()).map((d) => [d.tenancyId, d.note]),
    );
    expect(notes).toEqual({
      [old.id]: 'Deposit held before KodiHub',
      [edited.id]: 'Agreed with Hodi team',
    });
  });
});
