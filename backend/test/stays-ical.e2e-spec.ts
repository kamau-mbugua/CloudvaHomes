import { createHash } from 'node:crypto';
import { formatDateOnly, parseDateOnly } from '../src/common/dates/date-only.js';
import { addDays, todayInNairobi } from '../src/modules/billing/billing-math.js';
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

const day = (n: number) => formatDateOnly(addDays(parseDateOnly(todayInNairobi()), n));
const compact = (d: string) => d.replaceAll('-', '');

type Res = { status: number; body: any; text?: string; headers: Record<string, string> };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('Stays — calendar export (phase 20, e2e)', () => {
  let t: TestApp;
  let host: Session;
  const get = async (s: Session, path: string, status = 200) =>
    check(await t.http().get(`/api/v1${path}`).set(auth(s)), status);
  const post = async (s: Session, path: string, body: object, status = 201) =>
    check(await t.http().post(`/api/v1${path}`).set(auth(s)).send(body), status);

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    await createPlatformAdmin(t.prisma);
    const admin = await login(t, 'admin@example.invalid');
    ({ owner: host } = await onboardOrg(t, admin, {
      name: 'Ical Stays',
      kind: 'HOST',
      ownerEmail: 'ical@example.invalid',
      ownerPhone: '+254700000231',
    }));
  });

  it('serves stays and blocks as iCal behind a secret link the host can rotate', async () => {
    const prop = (await post(host, '/properties', { code: 'ICL', name: 'Ical Court' })).data;
    const listing = (
      await post(host, '/host/listings', {
        propertyId: prop.id,
        unitNumber: 'C1',
        title: 'Cottage C1',
        nightlyPrice: '500000',
        cleaningFee: '0',
      })
    ).data;
    await post(host, '/host/bookings', {
      listingId: listing.id,
      checkIn: day(10),
      checkOut: day(13),
      guests: 2,
      guest: { name: 'Amina Hassan', phone: '+254722111333' },
    });
    await post(host, '/host/blocks', {
      unitId: listing.unit.id,
      from: day(20),
      to: day(22),
      reason: 'Painting',
    });

    const { url } = (await get(host, `/host/listings/${listing.id}/ical`)).data;
    expect(url).toMatch(new RegExp(`/api/v1/public/ical/${listing.id}/[A-Za-z0-9_-]+\\.ics$`));
    // The same link until it's rotated.
    expect((await get(host, `/host/listings/${listing.id}/ical`)).data.url).toBe(url);

    const path = url.slice(url.indexOf('/api/v1/'));
    const feed = await t.http().get(path).buffer(true);
    expect(feed.status).toBe(200);
    expect(feed.headers['content-type']).toMatch(/^text\/calendar/);
    const text = feed.text;
    expect(text).toContain(`DTSTART;VALUE=DATE:${compact(day(10))}`);
    expect(text).toContain(`DTEND;VALUE=DATE:${compact(day(13))}`);
    expect(text).toContain('SUMMARY:Reserved');
    expect(text).toContain('SUMMARY:Not available');
    // Dates only: never the guest.
    expect(text).not.toContain('Amina');
    expect(text).not.toContain('722111333');

    // A wrong token is not found; rotating retires the old link.
    expect((await t.http().get(path.replace(/\/[^/]+\.ics$/, '/wrong.ics'))).status).toBe(404);
    const rotated = (await post(host, `/host/listings/${listing.id}/ical/rotate`, {}, 200)).data
      .url;
    expect(rotated).not.toBe(url);
    expect((await t.http().get(path)).status).toBe(404);
    expect((await t.http().get(rotated.slice(rotated.indexOf('/api/v1/')))).status).toBe(200);
  });

  it('phase 21: saves the monthly discount and extra-guest fee, and quotes with them', async () => {
    const prop = (await post(host, '/properties', { code: 'PRC', name: 'Price Court' })).data;
    const listing = (
      await post(host, '/host/listings', {
        propertyId: prop.id,
        unitNumber: 'P1',
        title: 'Price P1',
        nightlyPrice: '500000',
        cleaningFee: '0',
        maxGuests: 6,
        weeklyDiscountBps: 1000,
        monthlyDiscountBps: 3000,
        guestsIncluded: 2,
        extraGuestFee: '50000',
      })
    ).data;
    expect(listing).toMatchObject({
      monthlyDiscountBps: 3000,
      guestsIncluded: 2,
      extraGuestFee: '50000',
    });
    const q = (
      await post(
        host,
        '/host/bookings/quote',
        { listingId: listing.id, checkIn: day(30), checkOut: day(58), guests: 3 },
        201,
      )
    ).data.quote;
    const kinds = q.lines.map((l: { kind: string; label: string }) => `${l.kind}:${l.label}`);
    expect(kinds).toContain('DISCOUNT:28+ nights discount');
    expect(kinds).toContain('EXTRA_GUESTS:1 extra guest × 28 nights');
    // 28 × 5,000 = 140,000 − 30% = 98,000; + 1 × 500 × 28 = 14,000 → 112,000.
    expect(q.total).toBe('11200000');
  });

  it('phase 22: exports the guest register, IDs masked unless asked for in full (audited)', async () => {
    const prop = (await post(host, '/properties', { code: 'REG', name: 'Register Court' })).data;
    const listing = (
      await post(host, '/host/listings', {
        propertyId: prop.id,
        unitNumber: 'R1',
        title: 'Register R1',
        nightlyPrice: '500000',
        cleaningFee: '0',
      })
    ).data;
    const booking = (
      await post(host, '/host/bookings', {
        listingId: listing.id,
        checkIn: day(5),
        checkOut: day(7),
        guests: 2,
        guest: { name: 'Juma Ali', phone: '+254722444555', email: 'juma@example.invalid' },
      })
    ).data;
    await t
      .http()
      .patch(`/api/v1/host/guests/${booking.guest.id}`)
      .set(auth(host))
      .send({ idNumber: '23456789' })
      .expect(200);

    const path = `/api/v1/host/reports/guest-register?from=${day(0)}&to=${day(30)}`;
    const masked = await t.http().get(path).set(auth(host)).buffer(true);
    expect(masked.status).toBe(200);
    expect(masked.headers['content-type']).toMatch(/^text\/csv/);
    expect(masked.text).toContain('Check-in,Check-out,Nights,Booking');
    expect(masked.text).toContain('Juma Ali');
    expect(masked.text).not.toContain('23456789');
    expect(masked.text).toContain('789');

    const full = await t.http().get(`${path}&idNumbers=full`).set(auth(host)).buffer(true);
    expect(full.text).toContain('23456789');
    const audits = await t.prisma.auditLog.findMany({ where: { action: 'guest_register.export' } });
    expect(
      audits
        .map((a) => (a.after as { fullIdNumbers: boolean }).fullIdNumbers)
        .sort((x, y) => Number(x) - Number(y)),
    ).toEqual([false, true]);
  });

  it('phase 22: shows the house manual once confirmed, and the door code only on the day, paid', async () => {
    const prop = (await post(host, '/properties', { code: 'DOR', name: 'Door Court' })).data;
    const listing = (
      await post(host, '/host/listings', {
        propertyId: prop.id,
        unitNumber: 'D1',
        title: 'Door D1',
        nightlyPrice: '500000',
        cleaningFee: '0',
        houseManual: 'Wi-Fi: DoorNet / pass1234',
        accessCode: '4829#',
      })
    ).data;
    expect(listing.hasAccessCode).toBe(true);
    expect(JSON.stringify(listing)).not.toContain('4829');
    expect((await get(host, `/host/listings/${listing.id}/access-code`)).data.accessCode).toBe(
      '4829#',
    );

    const view = async (checkIn: number, pay: boolean) => {
      const b = (
        await post(host, '/host/bookings', {
          listingId: listing.id,
          checkIn: day(checkIn),
          checkOut: day(checkIn + 2),
          guests: 1,
          guest: { name: 'Door Guest', phone: `+2547225550${checkIn + 10}` },
        })
      ).data;
      if (pay) {
        await post(host, `/host/bookings/${b.id}/payments`, {
          amount: b.total,
          method: 'CASH',
          receivedAt: day(0),
        });
      }
      const token = `tok-${b.id}`;
      await t.prisma.booking.update({
        where: { id: b.id },
        data: { accessTokenHash: createHash('sha256').update(token).digest('hex') },
      });
      return check(await t.http().get(`/api/v1/public/bookings/${token}`), 200).data;
    };

    // Checking in today and paid: the manual and the code.
    const today = await view(0, true);
    expect(today).toMatchObject({ houseManual: 'Wi-Fi: DoorNet / pass1234', accessCode: '4829#' });
    // Paid, but check-in is later: the manual, and a note instead of the code.
    const later = await view(5, true);
    expect(later.accessCode).toBeNull();
    expect(later.accessCodeNote).toMatch(/from check-in day/);
    // Not paid yet: no code, and the note says why.
    const owing = await view(3, false);
    expect(owing.accessCode).toBeNull();
    expect(owing.accessCodeNote).toMatch(/Pay the balance/);
  });
});
