import { todayInNairobi } from '../src/modules/billing/billing-math.js';
import { outbox, type EmailAttachment } from '../src/modules/notifications/senders.js';
import { ShortLinksService } from '../src/modules/notifications/short-links.service.js';
import { BookingsService } from '../src/modules/stays/bookings/bookings.service.js';
import {
  auth,
  followShortLink,
  createPlatformAdmin,
  createTestApp,
  login,
  onboardOrg,
  resetDb,
  type Session,
  type TestApp,
} from './helpers.js';

const KES = (major: number) => String(major * 100);
const GUEST = { name: 'Achieng Otieno', phone: '+254722000333', email: 'achieng@example.invalid' };
const LOCATION = {
  address: 'Makini Court, Argwings Kodhek Rd, Nairobi',
  lat: -1.2920659,
  lng: 36.787194,
  placeId: 'ChIJ-test-place',
};
const MAPS_KEY = 'AIzaSyTestKey_abcdefghijklmnopqrstuv';

type Res = { status: number; body: any };
const check = (res: Res, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};
const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

type Mail = {
  channel: 'email';
  to: string;
  subject: string;
  text: string;
  fromName?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

describe('Stays — guest emails, receipts and listing locations (e2e)', () => {
  let t: TestApp;
  let admin: Session;
  let host: Session;
  let orgId: string;

  const req = (method: 'get' | 'post' | 'patch' | 'put', s: Session | null, path: string) => {
    const r = t.http()[method](`/api/v1${path}`);
    return s ? r.set(auth(s)) : r;
  };
  const get = async (s: Session | null, path: string, status = 200) =>
    check(await req('get', s, path), status);
  const post = async (s: Session, path: string, body: object, status = 201) =>
    check(await req('post', s, path).send(body), status);
  const patch = async (s: Session, path: string, body: object, status = 200) =>
    check(await req('patch', s, path).send(body), status);
  const put = async (s: Session, path: string, body: object, status = 200) =>
    check(await req('put', s, path).send(body), status);

  const mails = (to = GUEST.email) =>
    outbox.filter((m): m is Mail & typeof m => m.channel === 'email' && m.to === to) as Mail[];
  const texts = (to = GUEST.phone) =>
    outbox.filter((m) => m.channel === 'sms' && m.to === to).map((m) => m.text);

  beforeAll(async () => {
    process.env.SITE_DOMAIN = 'kodihub.co.ke'; // short links: https://go.kodihub.co.ke/<code>
    t = await createTestApp();
  });
  afterAll(async () => {
    delete process.env.SITE_DOMAIN;
    await t?.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    outbox.length = 0;
    await createPlatformAdmin(t.prisma);
    admin = await login(t, 'admin@example.invalid');
    ({ orgId, owner: host } = await onboardOrg(t, admin, {
      name: 'Makini Stays Ltd',
      kind: 'HOST',
      ownerEmail: 'olive@example.invalid',
      ownerPhone: '+254700000181',
    }));
    await patch(host, '/host/site', {
      slug: 'makini',
      businessName: 'Makini Homes',
      published: true,
      contactPhone: '+254700000190',
      rules: { bookingMode: 'INSTANT', payWhen: 'FULL', cancellation: 'FLEXIBLE' },
    });
  });

  async function listing(location: object | null = LOCATION) {
    const prop = (await post(host, '/properties', { name: 'Makini Court', code: 'MC' })).data;
    return (
      await post(host, '/host/listings', {
        propertyId: prop.id,
        unitNumber: 'M1',
        title: 'Cozy 1BR with balcony',
        maxGuests: 2,
        nightlyPrice: KES(5500),
        cleaningFee: '0',
        checkInInstructions: 'Collect keys from the guard.',
        published: true,
        ...(location ? { location } : {}),
      })
    ).data;
  }

  async function booking(listingId: string, checkIn: string) {
    return (
      await post(host, '/host/bookings', {
        listingId,
        checkIn,
        checkOut: addDays(checkIn, 1),
        guests: 2,
        guest: GUEST,
        confirm: true,
      })
    ).data;
  }

  describe('listing location and the Maps key', () => {
    it('saves a location picked on the map and gives its Google Maps link', async () => {
      const l = await listing();
      expect(l.location).toEqual({
        ...LOCATION,
        mapUrl:
          'https://www.google.com/maps/search/?api=1&query=-1.292066,36.787194&query_place_id=ChIJ-test-place',
      });
      const cleared = (await patch(host, `/host/listings/${l.id}`, { location: null })).data;
      expect(cleared.location).toBeNull();
      await patch(host, `/host/listings/${l.id}`, { location: { ...LOCATION, lat: 91 } }, 422);
      await patch(host, `/host/listings/${l.id}`, { location: { address: 'x', lat: 1 } }, 422);
    });

    it('lets KodiHub admin set the Maps key; hosts and the public listing page get it', async () => {
      expect((await get(host, '/host/listings/maps')).data).toEqual({ key: null });
      await put(admin, '/platform/settings', { googleMapsKey: 'not a key' }, 422);
      await put(admin, '/platform/settings', { googleMapsKey: MAPS_KEY });
      expect((await get(admin, '/platform/settings')).data.googleMapsKey).toBe(MAPS_KEY);
      expect((await get(host, '/host/listings/maps')).data).toEqual({ key: MAPS_KEY });

      const l = await listing();
      const pub = (await get(null, `/public/sites/makini/listings/${l.id}`)).data;
      expect(pub.location).toMatchObject({ address: LOCATION.address, lat: LOCATION.lat });
      expect(pub.mapsKey).toBe(MAPS_KEY);
    });
  });

  describe('guest messages', () => {
    it('confirms by SMS and email, then sends check-in details with the map link', async () => {
      const l = await listing();
      await booking(l.id, addDays(todayInNairobi(), 1));

      const confirmed = mails().find((m) => m.subject.startsWith('Booking confirmed'));
      expect(confirmed).toMatchObject({
        subject: expect.stringContaining('Cozy 1BR with balcony'),
        fromName: 'Makini Homes via KodiHub',
      });
      expect(confirmed!.text).toContain('Hi Achieng,');
      expect(confirmed!.text).toContain(`Address: ${LOCATION.address}`);
      expect(confirmed!.text).toContain('Still to pay: KES 5,500');
      expect(confirmed!.text).toContain('Call Makini Homes on +254700000190');
      expect(confirmed!.text).not.toMatch(/\n{3,}/);

      const checkIn = mails().find((m) => m.subject.startsWith('Check-in details'));
      expect(checkIn!.text).toContain('Instructions: Collect keys from the guard.');
      expect(checkIn!.text).toContain('Map: https://www.google.com/maps/search/?api=1&query=');
      const welcome = texts().find((x) => x.includes('welcome on'))!;
      expect(welcome).toMatch(
        new RegExp(
          `^Makini Homes: welcome on ${Number(addDays(todayInNairobi(), 1).slice(8))} ${
            ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
              Number(addDays(todayInNairobi(), 1).slice(5, 7)) - 1
            ]
          }! Check-in from 14:00\\. Collect keys from the guard\\. Map: https://go\\.kodihub\\.co\\.ke/[0-9A-Za-z]{8}$`,
        ),
      );
      // The short link opens the pin on Google Maps.
      expect(await followShortLink(t, welcome)).toBe(
        'https://maps.google.com/?q=-1.292066,36.787194',
      );
    });

    it('keeps short links private, reusable and expiring', async () => {
      const l = await listing();
      await booking(l.id, addDays(todayInNairobi(), 1));
      const welcome = texts().find((x) => x.includes('welcome on'))!;
      const code = /go\.kodihub\.co\.ke\/([0-9A-Za-z]+)/.exec(welcome)![1]!;

      // Nothing readable is stored: no code, no target.
      const rows = await t.prisma.shortLink.findMany();
      const plain = rows.map((r) => [r.codeHash, r.targetHash, r.kind, r.orgId].join(' '));
      expect(plain.join(' ')).not.toContain(code);
      expect(Buffer.concat(rows.map((r) => Buffer.from(r.targetEnc))).toString()).not.toContain(
        'maps.google.com',
      );

      // Map links (a public pin) are 8 characters; booking links (a private page) are 12.
      expect(code).toHaveLength(8);
      const hostBooking = await t.prisma.booking.findFirstOrThrow();
      const sms = await t.app
        .get(ShortLinksService)
        .shorten(`https://makini.kodihub.co.ke/b/${'x'.repeat(43)}`, {
          kind: 'booking',
          orgId: hostBooking.orgId,
        });
      expect(sms).toMatch(/^https:\/\/go\.kodihub\.co\.ke\/[0-9A-Za-z]{12}$/);

      // The same link always gets the same code.
      const before = await t.prisma.shortLink.count();
      await t.prisma.booking.updateMany({ data: { infoSentAt: null } });
      await t.app
        .get(BookingsService)
        .sendCheckInInfoIfSoon((await t.prisma.booking.findFirstOrThrow()).id);
      expect(await t.prisma.shortLink.count()).toBe(before);

      // Clicks are counted; unknown and expired codes show the expired page.
      expect(await followShortLink(t, welcome)).toContain('maps.google.com');
      const map = await t.prisma.shortLink.findFirstOrThrow({ where: { kind: 'map' } });
      expect(map.clicks).toBe(1);
      expect((await t.http().get('/api/v1/s/ZZZZZZZZ')).status).toBe(404);
      await t.prisma.shortLink.update({ where: { id: map.id }, data: { expiresAt: new Date(0) } });
      const gone = await t.http().get(`/api/v1/s/${code}`);
      expect(gone.status).toBe(404);
      expect(gone.text).toContain('This link has expired');

      // go.kodihub.co.ke/<code> reaches the same redirect through the site router.
      await t.prisma.shortLink.update({
        where: { id: map.id },
        data: { expiresAt: new Date(Date.now() + 86_400_000) },
      });
      const viaHost = await t
        .http()
        .get(`/api/v1/public/site-html?host=go.kodihub.co.ke&path=/${code}`);
      expect(viaHost.status).toBe(302);
      expect(viaHost.headers.location).toContain('maps.google.com');
    });

    it('emails each payment with its receipt, and every receipt once fully paid', async () => {
      const l = await listing();
      const b = await booking(l.id, addDays(todayInNairobi(), 20));
      outbox.length = 0;

      await post(host, `/host/bookings/${b.id}/payments`, {
        method: 'CASH',
        amount: KES(2750),
        reference: 'CASH-1',
      });
      const first = mails().at(-1)!;
      expect(first.subject).toMatch(/^Receipt SRC-\d{4}-000001: KES 2,750 received for booking B/);
      expect(first.text).toContain('Still to pay: KES 2,750.');
      expect(first.text).not.toContain('confirmed');
      expect(first.attachments?.map((a) => a.filename)).toEqual([
        expect.stringMatching(/^SRC-\d{4}-000001\.pdf$/),
      ]);
      expect(first.attachments![0]!.content.subarray(0, 4).toString()).toBe('%PDF');

      await post(host, `/host/bookings/${b.id}/payments`, {
        method: 'CASH',
        amount: KES(2750),
        reference: 'CASH-2',
      });
      const last = mails().at(-1)!;
      expect(last.text).toContain('Your booking is fully paid.');
      expect(last.attachments?.map((a) => a.filename)).toHaveLength(2);
      expect(last.text).toMatch(
        /Your receipts SRC-\d{4}-000001 and SRC-\d{4}-000002 are attached\./,
      );
      expect(texts().at(-1)).toContain('Fully paid, thank you.');
    });

    it('tells the guest when a payment confirmed a held booking', async () => {
      const l = await listing();
      const b = await booking(l.id, addDays(todayInNairobi(), 20));
      await t.prisma.booking.update({ where: { id: b.id }, data: { status: 'HELD' } });
      outbox.length = 0;

      await post(host, `/host/bookings/${b.id}/payments`, {
        method: 'CASH',
        amount: KES(5500),
        reference: 'CASH-3',
      });
      expect(texts().at(-1)).toMatch(/Your stay is confirmed\. Fully paid, thank you\.$/);
    });

    it('sends no email to guests without an address, and still texts them', async () => {
      const l = await listing(null);
      await post(host, '/host/bookings', {
        listingId: l.id,
        checkIn: addDays(todayInNairobi(), 1),
        checkOut: addDays(todayInNairobi(), 2),
        guests: 1,
        guest: { name: 'No Email', phone: '+254722000444' },
        confirm: true,
      });
      expect(outbox.some((m) => m.channel === 'email' && m.subject.startsWith('Booking'))).toBe(
        false,
      );
      const info = texts('+254722000444').find((x) => x.includes('welcome on'));
      expect(info).toBeDefined();
      expect(info).not.toContain('Map:');
      void orgId;
    });
  });

  describe('receipts: list, preview, download and send again', () => {
    it('lists stay receipts, serves the PDF, and re-sends it by SMS link and email', async () => {
      const l = await listing();
      const b = await booking(l.id, addDays(todayInNairobi(), 20));
      await post(host, `/host/bookings/${b.id}/payments`, {
        method: 'CASH',
        amount: KES(2750),
        reference: 'CASH-1',
      });
      const pay = await t.prisma.stayPayment.findFirstOrThrow({ where: { bookingId: b.id } });

      // Money → Receipts finds it by booking code, receipt number or guest name.
      for (const q of [b.code, pay.number, 'achieng']) {
        const list = await get(host, `/host/stay-payments?q=${encodeURIComponent(q)}`);
        expect(list.data.map((r: { id: string }) => r.id)).toEqual([pay.id]);
      }
      const row = (await get(host, '/host/stay-payments')).data[0];
      expect(row).toMatchObject({
        number: pay.number,
        kind: 'PAYMENT',
        amount: KES(2750),
        booking: { code: b.code, listingTitle: 'Cozy 1BR with balcony' },
        guest: { name: GUEST.name, hasEmail: true, hasPhone: true },
      });

      // Preview / download: the PDF itself.
      const pdf = await req('get', host, `/host/bookings/${b.id}/payments/${pay.id}/receipt`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect(pdf.headers['content-disposition']).toContain(`${pay.number}.pdf`);
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

      // Send again: one SMS with the receipt's short link, one email with only this receipt.
      outbox.length = 0;
      const sent = await post(
        host,
        `/host/bookings/${b.id}/payments/${pay.id}/receipt/send`,
        {},
        200,
      );
      expect(sent.data).toEqual({ sms: true, email: true });
      const [sms] = texts();
      expect(sms).toMatch(
        new RegExp(
          `^Makini Homes: receipt ${pay.number} for KES 2,750 \\(booking ${b.code}\\)\\. View: https://go\\.kodihub\\.co\\.ke/[0-9A-Za-z]{12}$`,
        ),
      );
      expect(sms!.length).toBeLessThanOrEqual(160);
      expect(
        mails()
          .at(-1)!
          .attachments?.map((a) => a.filename),
      ).toEqual([`${pay.number}.pdf`]);

      // The link opens the receipt without signing in; a changed link does not.
      const target = new URL(await followShortLink(t, sms!));
      expect(target.pathname).toBe(`/api/v1/public/receipts/stay/${pay.id}`);
      const open = await t.http().get(`${target.pathname}${target.search}`);
      expect(open.status).toBe(200);
      expect(open.headers['content-type']).toBe('application/pdf');
      const forged = new URLSearchParams(target.search);
      forged.set('s', `${forged.get('s')!.slice(0, -1)}A`);
      await t.http().get(`${target.pathname}?${forged.toString()}`).expect(404);
      const expired = new URLSearchParams(target.search);
      expired.set('e', '1700000000');
      await t.http().get(`${target.pathname}?${expired.toString()}`).expect(404);

      // A refund has no receipt to send.
      await post(host, `/host/bookings/${b.id}/refunds`, { method: 'CASH', amount: KES(500) });
      const refund = await t.prisma.stayPayment.findFirstOrThrow({
        where: { bookingId: b.id, kind: 'REFUND' },
      });
      const no = await post(
        host,
        `/host/bookings/${b.id}/payments/${refund.id}/receipt/send`,
        {},
        409,
      );
      expect(no.error.code).toBe('NO_RECEIPT');
      const refunds = await get(host, '/host/stay-payments?kind=REFUND');
      expect(refunds.data.map((r: { id: string }) => r.id)).toEqual([refund.id]);
    });
  });
});
