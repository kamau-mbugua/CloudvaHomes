import { Inject, Injectable } from '@nestjs/common';
import { formatDateOnly, parseDateOnly } from '../../../common/dates/date-only.js';
import { DB, type Db } from '../../../prisma/prisma.module.js';
import { orgContext } from '../../auth/decorators.js';
import { propertyScope } from '../../portfolio/property-scope.js';
import { nairobiToday } from '../bookings/booking-view.js';
import { assertHostOrg } from '../host-org.js';
import { addIsoDays } from '../rules/report-math.js';
import { buildDashboard, type DashBooking, type HostDashboard } from './dashboard-math.js';
import type { HostDashboardQueryDto } from './host-dashboard.dto.js';

/** How far back a checked-out stay still counts toward "still owed by guests". */
const OWED_LOOKBACK_DAYS = 90;

@Injectable()
export class HostDashboardService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async get(q: HostDashboardQueryDto, today: string = nairobiToday()): Promise<HostDashboard> {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);
    const canSeeMoney = ctx.permissions.has('stay-payments:view');
    const canSeeCleaning = ctx.permissions.has('cleaning:view');

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
    const unitIds = listings.map((l) => l.unitId);
    const propertyIds = [...new Set(listings.map((l) => l.propertyId))];

    const monthStart = `${today.slice(0, 7)}-01`;
    const lastMonthStart = `${addIsoDays(monthStart, -1).slice(0, 7)}-01`;
    const owedFrom = addIsoDays(today, -OWED_LOOKBACK_DAYS);
    const pastCutoff = parseDateOnly(owedFrom < monthStart ? owedFrom : monthStart);

    const [rows, cleaning, payments] = unitIds.length
      ? await Promise.all([
          this.db.booking.findMany({
            where: {
              unitId: { in: unitIds },
              OR: [
                // Live bookings, whatever their dates: overdue check-outs and no-shows are in the past.
                { status: { in: ['HELD', 'REQUESTED', 'CONFIRMED', 'CHECKED_IN'] } },
                // Finished stays: this month's nights, and recent ones that still owe.
                { status: 'COMPLETED', checkOut: { gt: pastCutoff } },
              ],
            },
            include: { guest: { select: { name: true } } },
          }),
          canSeeCleaning
            ? this.db.cleaningTask.findMany({
                where: { status: 'OPEN', unitId: { in: unitIds } },
                select: { unitId: true },
              })
            : [],
          canSeeMoney
            ? this.db.stayPayment.findMany({
                where: {
                  voidedAt: null,
                  receivedAt: { gte: parseDateOnly(lastMonthStart) },
                  booking: { propertyId: { in: propertyIds } },
                },
                select: { kind: true, amount: true, receivedAt: true },
              })
            : [],
        ])
      : [[], [], []];

    const bookings: DashBooking[] = rows.map((b) => ({
      id: b.id,
      code: b.code,
      kind: b.kind,
      unitId: b.unitId,
      status: b.status,
      checkIn: formatDateOnly(b.checkIn),
      checkOut: formatDateOnly(b.checkOut),
      guests: b.guests,
      guestName: b.guest?.name ?? null,
      total: b.total,
      amountPaid: b.amountPaid,
      amountRefunded: b.amountRefunded,
      amountWrittenOff: b.amountWrittenOff,
      balanceDueOn: b.balanceDueOn ? formatDateOnly(b.balanceDueOn) : null,
      requestExpiresAt: b.requestExpiresAt,
    }));

    return buildDashboard({
      today,
      units: listings.map((l) => ({
        unitId: l.unitId,
        number: l.unit.number,
        title: l.title,
        listingId: l.id,
        property: l.property,
      })),
      bookings,
      openCleaningUnitIds: new Set(cleaning.map((c) => c.unitId)),
      // Bucketed by the UTC calendar day, the same way the Reports page buckets them.
      payments: payments.map((p) => ({
        day: formatDateOnly(p.receivedAt),
        kind: p.kind,
        amount: p.amount,
      })),
      canSeeMoney,
      canSeeCleaning,
    });
  }
}
