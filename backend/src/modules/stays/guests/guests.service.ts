import { Inject, Injectable } from '@nestjs/common';
import { formatDateOnly } from '../../../common/dates/date-only.js';
import { AppError } from '../../../common/errors/app-error.js';
import { pageMeta, toSkipTake } from '../../../common/http/pagination.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { DB, type Db } from '../../../prisma/prisma.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { orgContext } from '../../auth/decorators.js';
import { optionalText } from '../../portfolio/fields.js';
import { IdNumbers } from '../../portfolio/id-numbers.js';
import { allowedPropertyIds, propertyScope } from '../../portfolio/property-scope.js';
import { assertHostOrg } from '../host-org.js';
import type { ListGuestsQueryDto, UpdateGuestDto } from './guests.dto.js';

const STAY_STATUSES = ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'] as const;

/**
 * Staff limited to some properties see guests with a stay at one of them (plus guests with no
 * stays yet), and only those stays — like tenants in the portfolio.
 */
function guestScope(): Prisma.GuestWhereInput {
  if (!allowedPropertyIds()) return {};
  return {
    OR: [
      { bookings: { some: { kind: 'STAY', property: propertyScope() } } },
      { bookings: { none: { kind: 'STAY' } } },
    ],
  };
}

/** Money on guests needs stay-payments:view, like bookings. */
function canSeeMoney(): boolean {
  return orgContext().permissions.has('stay-payments:view');
}

@Injectable()
export class GuestsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly idNumbers: IdNumbers,
    private readonly audit: AuditService,
  ) {}

  async list(q: ListGuestsQueryDto) {
    await assertHostOrg(this.db);
    const term = q.q?.trim();
    const where: Prisma.GuestWhereInput = {
      AND: [
        guestScope(),
        term
          ? {
              OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { phone: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
    const money = canSeeMoney();

    const [rows, total] = await Promise.all([
      this.db.guest.findMany({
        where,
        include: {
          bookings: {
            where: {
              kind: 'STAY',
              status: { in: [...STAY_STATUSES] },
              property: propertyScope(),
            },
            select: {
              id: true,
              checkIn: true,
              checkOut: true,
              amountPaid: true,
              amountRefunded: true,
            },
            orderBy: { checkIn: 'desc' },
          },
        },
        orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
        ...toSkipTake(q),
      }),
      this.db.guest.count({ where }),
    ]);

    return {
      data: rows.map((g) => {
        let totalPaid = 0n;
        for (const b of g.bookings) {
          totalPaid += b.amountPaid - b.amountRefunded;
        }
        const lastStay = g.bookings[0] ? formatDateOnly(g.bookings[0].checkIn) : null;
        return {
          id: g.id,
          name: g.name,
          phone: g.phone,
          email: g.email,
          notes: g.notes,
          doNotAccept: g.doNotAccept,
          idNumberHint: this.idNumbers.masked(g.idNumberHint),
          stays: g.bookings.length,
          ...(money ? { totalPaid: totalPaid.toString() } : {}),
          lastStay,
        };
      }),
      meta: pageMeta(total, q),
    };
  }

  async get(id: string) {
    await assertHostOrg(this.db);
    const money = canSeeMoney();
    const g = await this.db.guest.findFirst({
      where: { id, ...guestScope() },
      include: {
        bookings: {
          where: { kind: 'STAY', property: propertyScope() },
          include: {
            listing: { select: { id: true, title: true } },
            unit: { select: { id: true, number: true } },
            property: { select: { id: true, code: true, name: true } },
          },
          orderBy: { checkIn: 'desc' },
        },
      },
    });
    if (!g) throw AppError.notFound('Guest');

    let totalPaid = 0n;
    for (const b of g.bookings) {
      if ((STAY_STATUSES as readonly string[]).includes(b.status)) {
        totalPaid += b.amountPaid - b.amountRefunded;
      }
    }

    return {
      id: g.id,
      name: g.name,
      phone: g.phone,
      email: g.email,
      notes: g.notes,
      doNotAccept: g.doNotAccept,
      idNumberHint: this.idNumbers.masked(g.idNumberHint),
      ...(money ? { totalPaid: totalPaid.toString() } : {}),
      staysCount: g.bookings.filter((b) => (STAY_STATUSES as readonly string[]).includes(b.status))
        .length,
      stays: g.bookings.map((b) => ({
        id: b.id,
        code: b.code,
        status: b.status,
        checkIn: formatDateOnly(b.checkIn),
        checkOut: formatDateOnly(b.checkOut),
        guests: b.guests,
        ...(money
          ? {
              total: b.total.toString(),
              amountPaid: b.amountPaid.toString(),
              amountRefunded: b.amountRefunded.toString(),
            }
          : {}),
        listing: b.listing,
        unit: b.unit,
        property: b.property,
      })),
    };
  }

  async update(id: string, dto: UpdateGuestDto) {
    const ctx = orgContext();
    await assertHostOrg(this.db, ctx.orgId);
    const before = await this.db.guest.findFirst({ where: { id, ...guestScope() } });
    if (!before) throw AppError.notFound('Guest');

    const sealed =
      dto.idNumber !== undefined
        ? this.idNumbers.seal(this.idNumbers.normalize(dto.idNumber), ctx.orgId, 'guest')
        : null;

    const updated = await this.db.$transaction(async (tx) => {
      const row = await tx.guest.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.email !== undefined
            ? { email: dto.email ? dto.email.trim().toLowerCase() : null }
            : {}),
          ...(dto.notes !== undefined
            ? { notes: optionalText(dto.notes ?? undefined) ?? null }
            : {}),
          ...(dto.doNotAccept !== undefined ? { doNotAccept: dto.doNotAccept } : {}),
          ...(sealed
            ? {
                idNumberEnc: sealed.idNumberEnc,
                idNumberHint: sealed.idNumberHint,
              }
            : {}),
        },
      });
      await this.audit.record(
        {
          action: 'guest.update',
          entity: 'guest',
          entityId: id,
          before: {
            name: before.name,
            email: before.email,
            notes: before.notes,
            doNotAccept: before.doNotAccept,
            idNumberHint: before.idNumberHint,
          },
          after: {
            name: row.name,
            email: row.email,
            notes: row.notes,
            doNotAccept: row.doNotAccept,
            idNumberHint: row.idNumberHint,
          },
        },
        tx,
      );
      return row;
    });

    return this.get(updated.id);
  }
}
