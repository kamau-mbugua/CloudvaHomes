import {
  acceptInvite,
  auth,
  createPlatformAdmin,
  createTestApp,
  login,
  onboardOrg,
  resetDb,
  roleId,
  type Session,
  type TestApp,
} from './helpers.js';

const AGENCY_OWNER = { email: 'agency-owner@example.invalid', phone: '+254700000030' };
const LANDLORD_OWNER = { email: 'landlord-owner@example.invalid', phone: '+254700000040' };
const KES = (major: number) => major * 100;

describe('Portfolio (e2e)', () => {
  let t: TestApp;
  let agency: Session;
  let landlordOrg: Session;
  let agencyId: string;
  let admin: Session;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    admin = await login(t, 'admin@example.invalid');
    ({ orgId: agencyId, owner: agency } = await onboardOrg(t, admin, {
      name: 'Agency',
      kind: 'AGENCY',
      ownerEmail: AGENCY_OWNER.email,
      ownerPhone: AGENCY_OWNER.phone,
    }));
    ({ owner: landlordOrg } = await onboardOrg(t, admin, {
      name: 'Landlord',
      kind: 'LANDLORD',
      ownerEmail: LANDLORD_OWNER.email,
      ownerPhone: LANDLORD_OWNER.phone,
    }));
  });

  // ── small helpers (each awaits its own request; see helpers.addMember on why) ──
  // A status mismatch fails with the response body, which says which rule fired.
  const check = (res: { status: number; body: any }, status: number) => {
    if (res.status !== status) {
      throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body;
  };
  const post = async (s: Session, path: string, body: object, status = 200) =>
    check(await t.http().post(`/api/v1${path}`).set(auth(s)).send(body), status);
  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);
  const patch = async (s: Session, path: string, body: object, status = 200) =>
    check(await t.http().patch(`/api/v1${path}`).set(auth(s)).send(body), status);
  const del = async (s: Session, path: string, status = 204) =>
    check(await t.http().delete(`/api/v1${path}`).set(auth(s)), status);

  async function landlord(s: Session, name = 'Wanjiru Holdings') {
    return (await post(s, '/landlords', { name, kind: 'COMPANY', phone: '0700000101' }, 201)).data;
  }

  async function property(s: Session, code: string, landlordId?: string) {
    return (await post(s, '/properties', { name: `Block ${code}`, code, landlordId }, 201)).data;
  }

  async function units(s: Session, propertyId: string, numbers: string[], rent = KES(20000)) {
    await post(s, '/units/bulk', { propertyId, numbers, rentAmount: rent }, 201);
    const list = await get(s, `/units?propertyId=${propertyId}&pageSize=100`);
    return list.data as { id: string; number: string }[];
  }

  async function tenant(s: Session, phone: string, extra: object = {}) {
    return (
      await post(s, '/tenants', { firstName: 'Tess', lastName: 'Tenant', phone, ...extra }, 201)
    ).data;
  }

  describe('agency flow', () => {
    it('landlord → property → bulk units → tenant → move-in → notice → move-out', async () => {
      const ll = await landlord(agency);
      expect(ll.code).toBe('L0001');

      // Agencies must name the landlord.
      const noLandlord = await post(
        agency,
        '/properties',
        { name: 'No landlord', code: 'XX' },
        422,
      );
      expect(noLandlord.error.details[0].field).toBe('landlordId');
      const p = await property(agency, 'kil', ll.id);
      expect(p).toMatchObject({ code: 'KIL', landlord: { id: ll.id, code: 'L0001' } });
      const dup = await post(
        agency,
        '/properties',
        { name: 'Duplicate', code: 'KIL', landlordId: ll.id },
        409,
      );
      expect(dup.error.code).toBe('CODE_TAKEN');

      const numbers = Array.from({ length: 10 }, (_, i) => `A${i + 1}`);
      const us = await units(agency, p.id, numbers);
      expect(us.map((u) => u.number)).toEqual(numbers); // A2 before A10
      const clash = await post(
        agency,
        '/units/bulk',
        { propertyId: p.id, numbers: ['A10', 'A11', 'A1'], rentAmount: 1 },
        409,
      );
      expect(clash.error.code).toBe('NUMBER_TAKEN');
      expect(clash.error.message).toContain('A10, A1');
      expect(await t.prisma.unit.count()).toBe(10); // all or nothing
      const twice = await post(
        agency,
        '/units/bulk',
        { propertyId: p.id, numbers: ['B1', 'B1'], rentAmount: 1 },
        422,
      );
      expect(twice.error.details[0].field).toBe('numbers[1]');

      const ten = await tenant(agency, '0711000001');
      expect(ten).toMatchObject({ code: 'T00001', phone: '+254711000001', status: 'PROSPECT' });
      const phoneClash = await post(
        agency,
        '/tenants',
        { firstName: 'A', lastName: 'B', phone: '+254 711 000 001' },
        409,
      );
      expect(phoneClash.error).toMatchObject({ code: 'PHONE_TAKEN' });
      expect(phoneClash.error.message).toContain('T00001');

      const a1 = us.find((u) => u.number === 'A1')!;
      const tenancy = (
        await post(
          agency,
          '/tenancies',
          { unitId: a1.id, tenantId: ten.id, startDate: '2026-10-31' },
          201,
        )
      ).data;
      expect(tenancy).toMatchObject({
        status: 'ACTIVE',
        rentAmount: KES(20000),
        billingDay: 28,
        startDate: '2026-10-31',
        endDate: null,
        depositHeld: 0,
        unit: { number: 'A1', property: { code: 'KIL' } },
      });
      const again = await post(
        agency,
        '/tenancies',
        {
          unitId: a1.id,
          tenant: { firstName: 'N', lastName: 'M', phone: '0711000002' },
          startDate: '2026-11-01',
        },
        409,
      );
      expect(again.error.code).toBe('UNIT_OCCUPIED');
      expect(await t.prisma.tenant.count()).toBe(1); // the inline tenant rolled back too

      let unit = (await get(agency, `/units/${a1.id}`)).data;
      expect(unit).toMatchObject({ occupancy: 'OCCUPIED', currentTenancy: { id: tenancy.id } });
      let prop = (await get(agency, `/properties/${p.id}`)).data;
      expect(prop).toMatchObject({
        unitCount: 10,
        occupiedCount: 1,
        noticeCount: 0,
        vacantCount: 9,
      });
      expect((await get(agency, `/tenants/${ten.id}`)).data).toMatchObject({
        status: 'CURRENT',
        currentUnits: [{ unitNumber: 'A1', propertyName: 'Block kil' }],
      });

      const early = await post(
        agency,
        `/tenancies/${tenancy.id}/notice`,
        { endDate: '2026-10-01' },
        422,
      );
      expect(early.error.details[0].field).toBe('endDate');
      const notice = (
        await post(agency, `/tenancies/${tenancy.id}/notice`, { endDate: '2026-12-31' })
      ).data;
      expect(notice).toMatchObject({ status: 'NOTICE', endDate: '2026-12-31' });
      expect(notice.noticeGivenAt).toBeTruthy();
      prop = (await get(agency, `/properties/${p.id}`)).data;
      expect(prop).toMatchObject({ occupiedCount: 0, noticeCount: 1, vacantCount: 9 });
      const units1 = await get(agency, `/units?occupancy=NOTICE`);
      expect(units1.data.map((u: { id: string }) => u.id)).toEqual([a1.id]);

      const withdrawn = (await del(agency, `/tenancies/${tenancy.id}/notice`, 200)).data;
      expect(withdrawn).toMatchObject({ status: 'ACTIVE', endDate: null, noticeGivenAt: null });
      await del(agency, `/tenancies/${tenancy.id}/notice`, 409);

      const rent = (
        await patch(agency, `/tenancies/${tenancy.id}`, { rentAmount: KES(21000), billingDay: 5 })
      ).data;
      expect(rent).toMatchObject({ rentAmount: KES(21000), billingDay: 5 });

      const ended = (
        await post(agency, `/tenancies/${tenancy.id}/move-out`, {
          endDate: '2027-01-15',
          reason: ' Relocated ',
        })
      ).data;
      expect(ended).toMatchObject({
        status: 'ENDED',
        endDate: '2027-01-15',
        moveOutReason: 'Relocated',
      });
      const late = await patch(agency, `/tenancies/${tenancy.id}`, { rentAmount: 1 }, 409);
      expect(late.error.code).toBe('TENANCY_ENDED');
      await post(agency, `/tenancies/${tenancy.id}/move-out`, { endDate: '2027-01-15' }, 409);

      unit = (await get(agency, `/units/${a1.id}`)).data;
      expect(unit).toMatchObject({ occupancy: 'VACANT', currentTenancy: null });
      const overlap = await post(
        agency,
        '/tenancies',
        { unitId: a1.id, tenantId: ten.id, startDate: '2027-01-14' },
        422,
      );
      expect(overlap.error.details[0]).toMatchObject({ field: 'startDate' });
      expect((await get(agency, `/tenants/${ten.id}`)).data.status).toBe('PAST');
      expect((await get(agency, `/tenants?status=PAST`)).data).toHaveLength(1);
      expect((await get(agency, `/tenancies?unitId=${a1.id}`)).meta.total).toBe(1);

      const actions = (await t.prisma.auditLog.findMany({ where: { orgId: agencyId } })).map(
        (a) => a.action,
      );
      for (const a of [
        'landlord.create',
        'property.create',
        'unit.bulk_create',
        'tenant.create',
        'tenancy.move_in',
        'tenancy.notice',
        'tenancy.notice_withdraw',
        'tenancy.update',
        'tenancy.move_out',
      ]) {
        expect(actions).toContain(a);
      }
    });

    it('two move-ins into the same unit at once: exactly one wins', async () => {
      const p = await property(agency, 'RACE', (await landlord(agency)).id);
      const [u] = await units(agency, p.id, ['R1']);
      const [t1, t2] = [await tenant(agency, '0711000011'), await tenant(agency, '0711000012')];
      const results = await Promise.all(
        [t1, t2].map((x) =>
          t
            .http()
            .post('/api/v1/tenancies')
            .set(auth(agency))
            .send({ unitId: u!.id, tenantId: x.id, startDate: '2026-11-01' }),
        ),
      );
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
      expect(await t.prisma.tenancy.count({ where: { unitId: u!.id } })).toBe(1);
    });

    it('move-in can register a new tenant and carry an opening deposit', async () => {
      const p = await property(agency, 'NEW', (await landlord(agency)).id);
      const [u] = await units(agency, p.id, ['N1'], KES(15000));
      const res = (
        await post(
          agency,
          '/tenancies',
          {
            unitId: u!.id,
            tenant: {
              firstName: 'Nia',
              lastName: 'New',
              phone: '0711000021',
              idNumber: '00 000 021',
            },
            startDate: '2026-11-07',
            depositHeld: KES(15000),
          },
          201,
        )
      ).data;
      expect(res).toMatchObject({ billingDay: 7, rentAmount: KES(15000), depositHeld: KES(15000) });
      expect(res.tenant).toMatchObject({ code: 'T00001', firstName: 'Nia' });
      const bad = await post(agency, '/tenancies', { unitId: u!.id, startDate: '2026-02-30' }, 422);
      expect(bad.error.details.map((d: { field: string }) => d.field)).toContain('startDate');
      const neither = await post(
        agency,
        '/tenancies',
        { unitId: u!.id, startDate: '2026-11-01' },
        422,
      );
      expect(neither.error.details[0].field).toBe('tenantId');
    });
  });

  describe('rules', () => {
    it('landlords are agency-only, and landlord organisations’ properties have no landlord', async () => {
      const res = await get(landlordOrg, '/landlords', 403);
      expect(res.error.code).toBe('AGENCY_ONLY');
      const ll = await landlord(agency);
      await post(
        landlordOrg,
        '/properties',
        { name: 'Mine', code: 'MINE', landlordId: ll.id },
        422,
      );
      const p = await property(landlordOrg, 'MINE');
      expect(p.landlord).toBeNull();
    });

    it('ID numbers are encrypted at rest, masked in responses and revealed with an audit entry', async () => {
      const ten = await tenant(agency, '0711000031', { idNumber: '12 345-678' });
      expect(ten.idNumberMasked).toBe('•••••678');
      expect(JSON.stringify(ten)).not.toContain('12345678');
      const row = await t.prisma.tenant.findUniqueOrThrow({ where: { id: ten.id } });
      expect(Buffer.from(row.idNumberEnc!).includes(Buffer.from('12345678'))).toBe(false);
      expect(row.idNumberIndex).toBeTruthy();

      const revealed = (await get(agency, `/tenants/${ten.id}/id-number`)).data;
      expect(revealed).toEqual({ idNumber: '12345678' });
      expect(
        await t.prisma.auditLog.count({ where: { action: 'tenant.reveal_id', entityId: ten.id } }),
      ).toBe(1);
      // The create audit entry never holds the number either.
      const created = await t.prisma.auditLog.findFirstOrThrow({
        where: { action: 'tenant.create' },
      });
      expect(JSON.stringify(created.after)).not.toContain('12345678');

      const dup = await post(
        agency,
        '/tenants',
        { firstName: 'D', lastName: 'Up', phone: '0711000032', idNumber: '12345678' },
        409,
      );
      expect(dup.error.code).toBe('ID_NUMBER_TAKEN');
      // Clearing it removes every trace.
      const cleared = (await patch(agency, `/tenants/${ten.id}`, { idNumber: '' })).data;
      expect(cleared.idNumberMasked).toBeNull();
      expect(await get(agency, `/tenants/${ten.id}/id-number`)).toEqual({
        data: { idNumber: null },
      });

      const ll = (
        await post(
          agency,
          '/landlords',
          { name: 'Owner', kind: 'INDIVIDUAL', phone: '0700000102', idNumber: 'a1234567' },
          201,
        )
      ).data;
      expect(ll.idNumberMasked).toBe('•••••567');
      expect((await get(agency, `/landlords/${ll.id}/id-number`)).data.idNumber).toBe('A1234567');
    });

    it('deletes are refused while anything depends on the record', async () => {
      const ll = await landlord(agency);
      const p = await property(agency, 'DEL', ll.id);
      const type = (await post(agency, '/unit-types', { name: 'Bedsitter' }, 201)).data;
      const feature = (await post(agency, '/unit-features', { name: 'Balcony' }, 201)).data;
      expect((await post(agency, '/unit-types', { name: 'Bedsitter' }, 409)).error.code).toBe(
        'NAME_TAKEN',
      );
      const u = (
        await post(
          agency,
          '/units',
          {
            propertyId: p.id,
            number: 'D1',
            rentAmount: KES(9000),
            unitTypeId: type.id,
            featureIds: [feature.id],
          },
          201,
        )
      ).data;
      expect(u).toMatchObject({ unitType: { name: 'Bedsitter' }, features: [{ name: 'Balcony' }] });
      expect((await get(agency, '/unit-types')).data[0].unitCount).toBe(1);
      expect((await get(agency, '/unit-features')).data[0].unitCount).toBe(1);

      expect((await del(agency, `/landlords/${ll.id}`, 409)).error.code).toBe(
        'LANDLORD_HAS_PROPERTIES',
      );
      expect((await del(agency, `/properties/${p.id}`, 409)).error.code).toBe('PROPERTY_HAS_UNITS');
      expect((await del(agency, `/unit-types/${type.id}`, 409)).error.code).toBe('IN_USE');
      expect((await del(agency, `/unit-features/${feature.id}`, 409)).error.code).toBe('IN_USE');

      const ten = await tenant(agency, '0711000041');
      const ty = (
        await post(
          agency,
          '/tenancies',
          { unitId: u.id, tenantId: ten.id, startDate: '2026-11-01' },
          201,
        )
      ).data;
      expect((await patch(agency, `/units/${u.id}`, { status: 'INACTIVE' }, 409)).error.code).toBe(
        'UNIT_OCCUPIED',
      );
      await post(agency, `/tenancies/${ty.id}/move-out`, { endDate: '2026-11-30' });
      expect((await del(agency, `/units/${u.id}`, 409)).error.code).toBe('UNIT_HAS_HISTORY');
      expect((await del(agency, `/tenants/${ten.id}`, 409)).error.code).toBe('TENANT_HAS_HISTORY');

      // Unavailable units can't be let.
      await patch(agency, `/units/${u.id}`, { status: 'INACTIVE' });
      const inactive = await post(
        agency,
        '/tenancies',
        { unitId: u.id, tenantId: ten.id, startDate: '2026-12-01' },
        409,
      );
      expect(inactive.error.code).toBe('UNIT_INACTIVE');

      // Clearing references, then deleting bottom-up, works.
      await patch(agency, `/units/${u.id}`, { unitTypeId: null, featureIds: [] });
      await del(agency, `/unit-types/${type.id}`);
      await del(agency, `/unit-features/${feature.id}`);
      await del(agency, `/tenancies/${ty.id}`);
      await del(agency, `/units/${u.id}`);
      await del(agency, `/tenants/${ten.id}`);
      await del(agency, `/properties/${p.id}`);
      await del(agency, `/landlords/${ll.id}`);
      expect(await t.prisma.unit.count()).toBe(0);
    });
  });

  describe('property-limited staff', () => {
    it('a caretaker limited to one property sees only it, its units, tenancies and tenants', async () => {
      const ll = await landlord(agency);
      const p1 = await property(agency, 'ONE', ll.id);
      const p2 = await property(agency, 'TWO', ll.id);
      const [u1] = await units(agency, p1.id, ['1A']);
      const [u2] = await units(agency, p2.id, ['2A']);
      const t1 = await tenant(agency, '0711000051');
      const t2 = await tenant(agency, '0711000052');
      const prospect = await tenant(agency, '0711000053');
      await post(
        agency,
        '/tenancies',
        { unitId: u1!.id, tenantId: t1.id, startDate: '2026-11-01' },
        201,
      );
      const ty2 = (
        await post(
          agency,
          '/tenancies',
          { unitId: u2!.id, tenantId: t2.id, startDate: '2026-11-01' },
          201,
        )
      ).data;

      // Property ids must belong to the organisation.
      const caretakerRole = await roleId(t, agency, 'CARETAKER');
      const foreign = await property(landlordOrg, 'FOR');
      await post(
        agency,
        '/users/invitations',
        {
          firstName: 'C',
          lastName: 'T',
          email: 'ct@example.invalid',
          roleId: caretakerRole,
          propertyIds: [foreign.id],
        },
        422,
      );
      await post(
        agency,
        '/users/invitations',
        {
          firstName: 'C',
          lastName: 'T',
          email: 'ct@example.invalid',
          roleId: caretakerRole,
          propertyIds: [p1.id],
        },
        201,
      );
      const ct = await acceptInvite(t, 'ct@example.invalid');

      expect((await get(ct, '/properties')).data.map((p: { id: string }) => p.id)).toEqual([p1.id]);
      await get(ct, `/properties/${p2.id}`, 404);
      expect((await get(ct, '/units')).data.map((u: { id: string }) => u.id)).toEqual([u1!.id]);
      await get(ct, `/units/${u2!.id}`, 404);
      await patch(ct, `/units/${u2!.id}`, { floor: 3 }, 404);
      expect((await get(ct, '/tenancies')).meta.total).toBe(1);
      await get(ct, `/tenancies/${ty2.id}`, 404);
      await post(ct, `/tenancies/${ty2.id}/move-out`, { endDate: '2026-12-01' }, 404);
      const seen = (await get(ct, '/tenants')).data
        .map((x: { id: string }) => x.id)
        .sort((a: string, b: string) => a.localeCompare(b));
      expect(seen).toEqual([t1.id, prospect.id].sort((a: string, b: string) => a.localeCompare(b)));
      await get(ct, `/tenants/${t2.id}`, 404);
      // Can't add a property they couldn't then see, or let a unit outside their list.
      const scope = await post(ct, '/properties', { name: 'Zed Court', code: 'ZZ' }, 403);
      expect(scope.error.code).toBe('PERMISSION_DENIED'); // caretakers lack properties:create
      await post(
        ct,
        '/tenancies',
        { unitId: u2!.id, tenantId: prospect.id, startDate: '2026-11-01' },
        404,
      );
      // …but can register someone and move them into their own property.
      const own = await post(
        ct,
        '/tenancies',
        {
          unitId: u1!.id,
          tenant: { firstName: 'Q', lastName: 'R', phone: '0711000054' },
          startDate: '2026-11-01',
        },
        409,
      );
      expect(own.error.code).toBe('UNIT_OCCUPIED');
    });

    it('a limited manager cannot add properties', async () => {
      const p = await property(agency, 'MGR', (await landlord(agency)).id);
      const mgrRole = await roleId(t, agency, 'MANAGER');
      await post(
        agency,
        '/users/invitations',
        {
          firstName: 'M',
          lastName: 'G',
          email: 'mg@example.invalid',
          roleId: mgrRole,
          propertyIds: [p.id],
        },
        201,
      );
      const mg = await acceptInvite(t, 'mg@example.invalid');
      const res = await post(
        mg,
        '/properties',
        { name: 'Zed Court', code: 'ZZ', landlordId: p.landlord.id },
        403,
      );
      expect(res.error.code).toBe('PROPERTY_SCOPE');
      expect((await get(mg, '/landlords')).data).toHaveLength(1);
    });
  });

  describe('cross-organisation isolation', () => {
    it('another organisation’s portfolio ids behave like missing ids', async () => {
      const ll = await landlord(agency);
      const p = await property(agency, 'ISO', ll.id);
      const [u] = await units(agency, p.id, ['I1']);
      const ten = await tenant(agency, '0711000061', { idNumber: '00000061' });
      const ty = (
        await post(
          agency,
          '/tenancies',
          { unitId: u!.id, tenantId: ten.id, startDate: '2026-11-01' },
          201,
        )
      ).data;
      const type = (await post(agency, '/unit-types', { name: 'Studio' }, 201)).data;
      const cat = (await post(agency, '/unit-categories', { name: 'Executive' }, 201)).data;
      const feat = (await post(agency, '/unit-features', { name: 'Parking' }, 201)).data;
      const other = landlordOrg;

      for (const path of [
        `/properties/${p.id}`,
        `/units/${u!.id}`,
        `/tenants/${ten.id}`,
        `/tenants/${ten.id}/id-number`,
        `/tenancies/${ty.id}`,
      ]) {
        await get(other, path, 404);
      }
      await patch(other, `/properties/${p.id}`, { name: 'Renamed' }, 404);
      await patch(other, `/units/${u!.id}`, { floor: 1 }, 404);
      await patch(other, `/tenants/${ten.id}`, { firstName: 'x' }, 404);
      await patch(other, `/tenancies/${ty.id}`, { billingDay: 2 }, 404);
      await post(other, `/tenancies/${ty.id}/notice`, { endDate: '2026-12-01' }, 404);
      await post(other, `/tenancies/${ty.id}/move-out`, { endDate: '2026-12-01' }, 404);
      await del(other, `/tenancies/${ty.id}/notice`, 404);
      for (const path of [
        `/unit-types/${type.id}`,
        `/unit-categories/${cat.id}`,
        `/unit-features/${feat.id}`,
      ]) {
        await patch(other, path, { name: 'Renamed' }, 404);
        await del(other, path, 404);
      }
      await del(other, `/tenancies/${ty.id}`, 404);
      await del(other, `/units/${u!.id}`, 404);
      await del(other, `/tenants/${ten.id}`, 404);
      await del(other, `/properties/${p.id}`, 404);

      // Using another organisation's ids as references.
      const mine = await property(other, 'OWN');
      await post(other, '/units', { propertyId: p.id, number: 'X', rentAmount: 1 }, 404);
      const refs = await post(
        other,
        '/units',
        {
          propertyId: mine.id,
          number: 'X',
          rentAmount: 1,
          unitTypeId: type.id,
          categoryId: cat.id,
          featureIds: [feat.id],
        },
        422,
      );
      expect(refs.error.details.map((d: { field: string }) => d.field)).toEqual([
        'unitTypeId',
        'categoryId',
        'featureIds',
      ]);
      await post(
        other,
        '/tenancies',
        {
          unitId: u!.id,
          tenant: { firstName: 'a', lastName: 'b', phone: '0711000062' },
          startDate: '2026-11-01',
        },
        404,
      );
      // Same phone and ID number are fine in another organisation.
      await tenant(other, '0711000061', { idNumber: '00000061' });

      // Lists only show the caller's organisation.
      expect((await get(other, '/properties')).data.map((x: { id: string }) => x.id)).toEqual([
        mine.id,
      ]);
      expect((await get(other, '/units')).data).toHaveLength(0);
      expect((await get(other, '/tenancies')).data).toHaveLength(0);
      expect((await get(other, '/tenants')).data).toHaveLength(1);
      for (const path of ['/unit-types', '/unit-categories', '/unit-features']) {
        expect((await get(other, path)).data).toHaveLength(0);
      }
      // Landlords: a different agency sees none of ours and can't attach a property to one.
      const { owner: agency2 } = await onboardOrg(t, admin, {
        name: 'Agency 2',
        kind: 'AGENCY',
        ownerEmail: 'agency2@example.invalid',
        ownerPhone: '+254700000050',
      });
      expect((await get(agency2, '/landlords')).data).toHaveLength(0);
      await get(agency2, `/landlords/${ll.id}`, 404);
      await get(agency2, `/landlords/${ll.id}/id-number`, 404);
      await patch(agency2, `/landlords/${ll.id}`, { name: 'Renamed' }, 404);
      await del(agency2, `/landlords/${ll.id}`, 404);
      await post(agency2, '/properties', { name: 'Poached', code: 'PP', landlordId: ll.id }, 422);
    });
  });
});
