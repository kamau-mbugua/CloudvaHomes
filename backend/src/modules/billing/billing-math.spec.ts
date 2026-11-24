import { parseDateOnly } from '../../common/dates/date-only.js';
import {
  fromMilli,
  invoiceStatus,
  isDueForRun,
  noticeTerms,
  meteredAmount,
  moveInAmount,
  todayInNairobi,
  toMilli,
} from './billing-math.js';

describe('quantities', () => {
  it('parses and formats exact thousandths', () => {
    expect(toMilli('12.5')).toBe(12500n);
    expect(toMilli('0.001')).toBe(1n);
    expect(toMilli('120')).toBe(120000n);
    expect(fromMilli(12500n)).toBe('12.500');
    for (const bad of ['-1', '1.2345', '1e3', '', 'abc', '1.']) {
      expect(() => toMilli(bad)).toThrow(RangeError);
    }
  });

  it('metered amount = consumption × rate, half-up to the cent, no floats', () => {
    expect(meteredAmount(toMilli('12.5'), 15000n)).toBe(187500n); // 12.5 m³ × KES 150
    expect(meteredAmount(toMilli('0.333'), 100n)).toBe(33n); // 33.3 → 33
    expect(meteredAmount(toMilli('0.335'), 100n)).toBe(34n); // 33.5 → 34
    expect(meteredAmount(0n, 15000n)).toBe(0n);
  });
});

describe('invoice status', () => {
  it('follows paid + credited against the total', () => {
    expect(invoiceStatus(1000n, 0n, 0n)).toBe('ISSUED');
    expect(invoiceStatus(1000n, 200n, 0n)).toBe('PARTIALLY_PAID');
    expect(invoiceStatus(1000n, 0n, 300n)).toBe('PARTIALLY_PAID');
    expect(invoiceStatus(1000n, 700n, 300n)).toBe('PAID');
    expect(invoiceStatus(0n, 0n, 0n)).toBe('PAID');
  });
});

describe('move-in amounts', () => {
  it('uses N × rent or the fixed amount', () => {
    expect(moveInAmount({ amount: null, rentMonths: 2 }, 2500000n)).toBe(5000000n);
    expect(moveInAmount({ amount: 150000n, rentMonths: null }, 2500000n)).toBe(150000n);
  });
});

describe('run eligibility', () => {
  const t = (o: Partial<Parameters<typeof isDueForRun>[0]> = {}) => ({
    status: 'ACTIVE' as const,
    billingDay: 5,
    startDate: parseDateOnly('2026-01-05'),
    endDate: null,
    ...o,
  });

  it('bills once the billing day has come (catching up missed days)', () => {
    expect(isDueForRun(t(), '2026-10-04')).toBe(false);
    expect(isDueForRun(t(), '2026-10-05')).toBe(true);
    expect(isDueForRun(t(), '2026-10-20')).toBe(true);
  });

  it('skips tenancies not started by the billing date, ending before it, or ended', () => {
    expect(isDueForRun(t({ startDate: parseDateOnly('2026-10-06') }), '2026-10-20')).toBe(false);
    expect(
      isDueForRun(t({ status: 'NOTICE', endDate: parseDateOnly('2026-10-04') }), '2026-10-20'),
    ).toBe(false);
    expect(
      isDueForRun(t({ status: 'NOTICE', endDate: parseDateOnly('2026-10-05') }), '2026-10-20'),
    ).toBe(true);
    expect(isDueForRun(t({ status: 'ENDED' }), '2026-10-20')).toBe(false);
  });

  it('keeps billing rent in lieu of short notice, even after move-out', () => {
    const short = {
      endDate: parseDateOnly('2026-10-02'),
      noticeEndsOn: parseDateOnly('2026-11-10'),
    };
    expect(isDueForRun(t({ status: 'NOTICE', ...short }), '2026-10-20')).toBe(true);
    expect(isDueForRun(t({ status: 'ENDED', ...short }), '2026-11-05')).toBe(true);
    expect(isDueForRun(t({ status: 'ENDED', ...short }), '2026-12-05')).toBe(false);
    // Waived (no notice end): an ended tenancy stops at once.
    expect(
      isDueForRun(t({ status: 'ENDED', endDate: parseDateOnly('2026-10-02') }), '2026-10-20'),
    ).toBe(false);
  });

  it('works out the notice period and the rent in lieu', () => {
    const base = {
      givenOn: parseDateOnly('2026-11-24'),
      noticeDays: 30,
      billingDay: 1,
      rent: 2_500_000n,
    };
    // 30 days from 24 Nov is 24 Dec: moving out then or later is full notice.
    expect(noticeTerms({ ...base, moveOut: parseDateOnly('2026-12-31') })).toMatchObject({
      shortNotice: false,
      noticeEndsOn: null,
      rentInLieu: 0n,
    });
    // Out on 30 Nov: the 1 Dec rent is still due (in lieu), the notice ends 24 Dec.
    const short = noticeTerms({ ...base, moveOut: parseDateOnly('2026-11-30') });
    expect(short).toMatchObject({ shortNotice: true, rentInLieu: 2_500_000n });
    expect(short.noticeEndsOn?.toISOString().slice(0, 10)).toBe('2026-12-24');
    // Billed on the 25th: 25 Dec is after the notice ends, so nothing in lieu is due.
    expect(
      noticeTerms({ ...base, billingDay: 25, moveOut: parseDateOnly('2026-11-30') }).rentInLieu,
    ).toBe(0n);
  });

  it('knows today in Nairobi (UTC+3)', () => {
    expect(todayInNairobi(new Date('2026-10-27T21:30:00Z'))).toBe('2026-10-28');
    expect(todayInNairobi(new Date('2026-10-27T20:59:59Z'))).toBe('2026-10-27');
  });
});
