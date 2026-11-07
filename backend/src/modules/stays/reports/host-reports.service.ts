import { Inject, Injectable } from '@nestjs/common';
import { formatDateOnly, parseDateOnly } from '../../../common/dates/date-only.js';
import { AppError } from '../../../common/errors/app-error.js';
import { toCsv } from '../../../common/http/csv.js';
import { DB, type Db } from '../../../prisma/prisma.module.js';
import { propertyScope } from '../../portfolio/property-scope.js';
import {
  addIsoDays,
  adr,
  isoDaysBetween,
  nightAllocationsForStay,
  occupancy,
} from '../rules/report-math.js';
import type { HostReportSummaryQueryDto } from './host-reports.dto.js';

function monthsBetween(fromIso: string, toIso: string): string[] {
  const startYm = fromIso.slice(0, 7);
  const endYm = toIso.slice(0, 7);
  const [sy, sm] = startYm.split('-').map(Number);
  const [ey, em] = endYm.split('-').map(Number);
  if (!sy || !sm || !ey || !em) return [startYm];
  const out: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

@Injectable()
export class HostReportsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async summary(q: HostReportSummaryQueryDto) {
    if (q.to < q.from) {
      throw AppError.fieldInvalid('to', 'End date must be on or after start date');
    }

    const fromDate = parseDateOnly(q.from);
    const toDate = parseDateOnly(q.to);
    const toEndOfDay = new Date(toDate.getTime() + 86_400_000 - 1);

    const listings = await this.db.listing.findMany({
      where: {
        property: propertyScope(),
        ...(q.propertyId ? { propertyId: q.propertyId } : {}),
      },
      include: {
        unit: { select: { id: true, number: true } },
        property: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ property: { name: 'asc' } }, { unit: { number: 'asc' } }],
    });

    const propertyIds = [...new Set(listings.map((l) => l.propertyId))];

    const [payments, expenses, bookings] = await Promise.all([
      propertyIds.length
        ? this.db.stayPayment.findMany({
            where: {
              voidedAt: null,
              receivedAt: { gte: fromDate, lte: toEndOfDay },
              booking: { propertyId: { in: propertyIds } },
            },
            include: {
              booking: { select: { unitId: true, propertyId: true } },
            },
          })
        : [],
      propertyIds.length
        ? this.db.expense.findMany({
            where: {
              voidedAt: null,
              incurredOn: { gte: fromDate, lte: toDate },
              propertyId: { in: propertyIds },
            },
          })
        : [],
      propertyIds.length
        ? this.db.booking.findMany({
            where: {
              propertyId: { in: propertyIds },
              checkIn: { lte: toDate },
              checkOut: { gt: fromDate },
              status: { in: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'] },
            },
          })
        : [],
    ]);

    const periods = monthsBetween(q.from, q.to);
    const monthlyMap = new Map<
      string,
      { received: bigint; refunded: bigint; expenses: bigint; bookedValue: bigint }
    >(periods.map((p) => [p, { received: 0n, refunded: 0n, expenses: 0n, bookedValue: 0n }]));

    const receivedByUnit = new Map<string, bigint>();
    const refundedByUnit = new Map<string, bigint>();

    for (const p of payments) {
      const uid = p.booking.unitId;
      const ym = formatDateOnly(p.receivedAt).slice(0, 7);
      const bucket = monthlyMap.get(ym);
      if (p.kind === 'PAYMENT') {
        receivedByUnit.set(uid, (receivedByUnit.get(uid) ?? 0n) + p.amount);
        if (bucket) bucket.received += p.amount;
      } else {
        refundedByUnit.set(uid, (refundedByUnit.get(uid) ?? 0n) + p.amount);
        if (bucket) bucket.refunded += p.amount;
      }
    }

    const unitExpensesByUnit = new Map<string, bigint>();
    const sharedExpensesByProp = new Map<string, bigint>();

    for (const e of expenses) {
      const ym = formatDateOnly(e.incurredOn).slice(0, 7);
      const bucket = monthlyMap.get(ym);
      if (bucket) bucket.expenses += e.amount;

      if (e.unitId) {
        unitExpensesByUnit.set(e.unitId, (unitExpensesByUnit.get(e.unitId) ?? 0n) + e.amount);
      } else {
        sharedExpensesByProp.set(
          e.propertyId,
          (sharedExpensesByProp.get(e.propertyId) ?? 0n) + e.amount,
        );
      }
    }

    // Split property-level shared expenses evenly across that property's listings (remainder to the first)
    const sharedShareByUnit = new Map<string, bigint>();
    const listingsByProp = new Map<string, typeof listings>();
    for (const l of listings) {
      const arr = listingsByProp.get(l.propertyId) ?? [];
      arr.push(l);
      listingsByProp.set(l.propertyId, arr);
    }

    for (const [propId, totalShared] of sharedExpensesByProp.entries()) {
      const propListings = listingsByProp.get(propId) ?? [];
      if (propListings.length === 0) continue;
      const n = BigInt(propListings.length);
      const base = totalShared / n;
      const rem = totalShared - base * n;
      propListings.forEach((l, idx) => {
        sharedShareByUnit.set(l.unitId, idx === 0 ? base + rem : base);
      });
    }

    const bookedValueByUnit = new Map<string, bigint>();
    const roomRevenueByUnit = new Map<string, bigint>();
    const bookedNightsByUnit = new Map<string, number>();
    const blockedNightsByUnit = new Map<string, number>();

    for (const b of bookings) {
      const checkInIso = formatDateOnly(b.checkIn);
      const checkOutIso = formatDateOnly(b.checkOut);
      if (b.kind === 'BLOCK') {
        const totalDays = isoDaysBetween(checkInIso, checkOutIso);
        let blocked = 0;
        for (let i = 0; i < totalDays; i++) {
          const d = addIsoDays(checkInIso, i);
          if (d >= q.from && d <= q.to) blocked += 1;
        }
        blockedNightsByUnit.set(b.unitId, (blockedNightsByUnit.get(b.unitId) ?? 0) + blocked);
        continue;
      }

      const allocations = nightAllocationsForStay({
        checkIn: checkInIso,
        checkOut: checkOutIso,
        status: b.status,
        total: b.total,
        lines: b.lines,
      });

      for (const n of allocations) {
        if (n.date < q.from || n.date > q.to) continue;
        bookedValueByUnit.set(b.unitId, (bookedValueByUnit.get(b.unitId) ?? 0n) + n.amount);
        roomRevenueByUnit.set(b.unitId, (roomRevenueByUnit.get(b.unitId) ?? 0n) + n.roomAmount);
        bookedNightsByUnit.set(b.unitId, (bookedNightsByUnit.get(b.unitId) ?? 0) + 1);
        const ym = n.date.slice(0, 7);
        const bucket = monthlyMap.get(ym);
        if (bucket) bucket.bookedValue += n.amount;
      }
    }

    let totReceived = 0n;
    let totRefunded = 0n;
    let totBookedValue = 0n;
    let totRoomRevenue = 0n;
    let totUnitExpenses = 0n;
    let totSharedExpenses = 0n;
    let totExpenses = 0n;
    let totProfit = 0n;
    let totNights = 0;
    let totBlockedNights = 0;

    const rows = listings.map((l) => {
      const received = receivedByUnit.get(l.unitId) ?? 0n;
      const refunded = refundedByUnit.get(l.unitId) ?? 0n;
      const bookedValue = bookedValueByUnit.get(l.unitId) ?? 0n;
      const roomRevenue = roomRevenueByUnit.get(l.unitId) ?? 0n;
      const unitExp = unitExpensesByUnit.get(l.unitId) ?? 0n;
      const sharedExp = sharedShareByUnit.get(l.unitId) ?? 0n;
      const totalExp = unitExp + sharedExp;
      const profit = received - refunded - totalExp;
      const nights = bookedNightsByUnit.get(l.unitId) ?? 0;
      const blocked = blockedNightsByUnit.get(l.unitId) ?? 0;
      const occ = occupancy(nights, 1, q.from, q.to, blocked);
      const unitAdr = adr(roomRevenue, nights);

      totReceived += received;
      totRefunded += refunded;
      totBookedValue += bookedValue;
      totRoomRevenue += roomRevenue;
      totUnitExpenses += unitExp;
      totSharedExpenses += sharedExp;
      totExpenses += totalExp;
      totProfit += profit;
      totNights += nights;
      totBlockedNights += blocked;

      return {
        unitId: l.unitId,
        listingId: l.id,
        unitNumber: l.unit.number,
        title: l.title,
        property: l.property,
        received: received.toString(),
        refunded: refunded.toString(),
        bookedValue: bookedValue.toString(),
        unitExpenses: unitExp.toString(),
        sharedExpenses: sharedExp.toString(),
        expenses: totalExp.toString(),
        profit: profit.toString(),
        nights,
        occupancy: occ,
        adr: unitAdr.toString(),
      };
    });

    const sharedByProperty = [...listingsByProp.entries()].map(([propId, propListings]) => ({
      property: propListings[0]!.property,
      sharedExpenses: (sharedExpensesByProp.get(propId) ?? 0n).toString(),
    }));

    const monthly = periods.map((period) => {
      const m = monthlyMap.get(period)!;
      const profit = m.received - m.refunded - m.expenses;
      return {
        period,
        received: m.received.toString(),
        refunded: m.refunded.toString(),
        expenses: m.expenses.toString(),
        profit: profit.toString(),
        bookedValue: m.bookedValue.toString(),
      };
    });

    return {
      rows,
      totals: {
        received: totReceived.toString(),
        refunded: totRefunded.toString(),
        bookedValue: totBookedValue.toString(),
        unitExpenses: totUnitExpenses.toString(),
        sharedExpenses: totSharedExpenses.toString(),
        expenses: totExpenses.toString(),
        profit: totProfit.toString(),
        nights: totNights,
        occupancy: occupancy(totNights, listings.length, q.from, q.to, totBlockedNights),
        adr: adr(totRoomRevenue, totNights).toString(),
      },
      sharedByProperty,
      monthly,
    };
  }

  async csv(q: HostReportSummaryQueryDto): Promise<string> {
    const data = await this.summary(q);
    return toCsv(
      [
        'Unit',
        'Property',
        'Nights',
        'Occupancy (%)',
        'ADR (KES)',
        'Booked Value (KES)',
        'Received (KES)',
        'Refunded (KES)',
        'Unit Expenses (KES)',
        'Shared Expenses (KES)',
        'Total Expenses (KES)',
        'Profit (KES)',
      ],
      data.rows.map((r) => [
        r.title,
        `${r.property.name} (${r.property.code})`,
        r.nights,
        Math.round(r.occupancy * 100),
        BigInt(r.adr),
        BigInt(r.bookedValue),
        BigInt(r.received),
        BigInt(r.refunded),
        BigInt(r.unitExpenses),
        BigInt(r.sharedExpenses),
        BigInt(r.expenses),
        BigInt(r.profit),
      ]),
    );
  }
}
