import { Inject, Injectable } from '@nestjs/common';
import { FieldCipher } from '../../common/crypto/field-cipher.js';
import { AppError } from '../../common/errors/app-error.js';
import { toSkipTake } from '../../common/http/pagination.js';
import { paginated } from '../../common/http/response.js';
import type { Prisma, SmsLogStatus, SmsProvider } from '../../generated/prisma/client.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { todayInNairobi } from '../billing/billing-math.js';
import {
  SMS_LOG_BODY_CONTEXT,
  SMS_LOG_SECRET_CONTEXT,
  SmsService,
} from '../notifications/sms/sms.service.js';
import { requiredPhone } from '../portfolio/fields.js';
import { maskPhone } from './sms-settings.service.js';
import type { SmsLogsQueryDto, SmsStatsQueryDto } from './sms.dto.js';

/** Longest period the list and dashboard accept, in days. */
const MAX_DAYS = 366;
const DAY_MS = 86_400_000;

/** A Nairobi calendar day (UTC+3 all year) → the instant it starts. */
const nairobiStart = (day: string) => new Date(`${day}T00:00:00+03:00`);
const nextDay = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/**
 * Checks a from/to pair of Nairobi days: from on or before to, and at most a year apart.
 * Returns the instants to filter `createdAt` with.
 */
export function nairobiRange(from: string, to: string): { gte: Date; lt: Date } {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (days < 1) throw AppError.fieldInvalid('to', 'The end date must be on or after the start');
  if (days > MAX_DAYS) throw AppError.fieldInvalid('to', 'Choose a period of a year or less');
  return { gte: nairobiStart(from), lt: nairobiStart(nextDay(to)) };
}

/** Every Nairobi day from `from` to `to`, inclusive. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = nextDay(d)) out.push(d);
  return out;
}

/** Digits to search stored numbers ("+254722…") by: "0722 000 111" → "254722000111". */
export function phoneDigits(q: string): string {
  const digits = q.replace(/\D/g, '');
  return digits.startsWith('0') ? `254${digits.slice(1)}` : digits;
}

/**
 * KodiHub admin view of every SMS sent on KodiHub (its own and organisations'): the list, one
 * message with its text, the audited reveal of a hidden code, a test of KodiHub's provider, and
 * the SMS dashboard.
 */
@Injectable()
export class SmsLogsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly cipher: FieldCipher,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
  ) {}

  async list(q: SmsLogsQueryDto) {
    const digits = q.q ? phoneDigits(q.q) : '';
    const where: Prisma.SmsLogWhereInput = {
      ...(q.orgId ? { orgId: q.orgId } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.provider ? { provider: q.provider } : {}),
      ...(digits ? { to: { contains: digits } } : {}),
      ...(q.from || q.to
        ? { createdAt: nairobiRange(q.from ?? '2000-01-01', q.to ?? todayInNairobi()) }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.smsLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(q),
      }),
      this.db.smsLog.count({ where }),
    ]);
    const names = await this.orgNames(rows.map((r) => r.orgId));
    return paginated(
      rows.map((r) => ({
        id: r.id,
        at: r.createdAt,
        organization: r.orgId ? { id: r.orgId, name: names.get(r.orgId) ?? '' } : null,
        kind: r.kind,
        type: r.type,
        to: maskPhone(r.to),
        units: r.units,
        route: r.route,
        provider: r.provider,
        status: r.status,
        reason: r.reason,
        canOpen: r.bodyEnc !== null,
        hasSecret: r.secretEnc !== null,
      })),
      total,
      q,
    );
  }

  /** One SMS as sent, with any code, link or password still hidden. Old ones have `text: null`. */
  async one(id: string) {
    const r = await this.db.smsLog.findUnique({ where: { id } });
    if (!r) throw AppError.notFound('SMS');
    const names = await this.orgNames([r.orgId]);
    return {
      id: r.id,
      at: r.createdAt,
      organization: r.orgId ? { id: r.orgId, name: names.get(r.orgId) ?? '' } : null,
      kind: r.kind,
      type: r.type,
      to: r.to,
      units: r.units,
      route: r.route,
      provider: r.provider,
      providerMessageId: r.providerMessageId,
      status: r.status,
      reason: r.reason,
      text: r.bodyEnc ? this.cipher.decrypt(r.bodyEnc, SMS_LOG_BODY_CONTEXT) : null,
      secret: r.secretEnc ? { label: r.secretLabel ?? 'Secret', hidden: true } : null,
    };
  }

  /** The hidden code, link or password of one SMS. Audited with the reason, never the secret. */
  async reveal(id: string, reason: string) {
    const r = await this.db.smsLog.findUnique({ where: { id } });
    if (!r) throw AppError.notFound('SMS');
    if (!r.secretEnc) throw AppError.conflict('This SMS has nothing hidden to reveal', 'NO_SECRET');
    const secret = this.cipher.decrypt(r.secretEnc, SMS_LOG_SECRET_CONTEXT);
    await this.audit.record({
      action: 'platform.sms_secret_reveal',
      entity: 'sms_log',
      entityId: r.id,
      orgId: r.orgId,
      after: {
        reason,
        to: maskPhone(r.to),
        type: r.type,
        secretLabel: r.secretLabel,
        sentAt: r.createdAt.toISOString(),
      },
    });
    return { label: r.secretLabel ?? 'Secret', secret };
  }

  /** One real SMS through the provider chosen in platform settings. */
  async test(phone: string) {
    return this.sms.sendPlatformTest(requiredPhone('phone', phone));
  }

  /** The SMS dashboard for a period of Nairobi days (default: this month so far). */
  async stats(q: SmsStatsQueryDto) {
    const today = todayInNairobi();
    const from = q.from ?? `${today.slice(0, 7)}-01`;
    const to = q.to ?? today;
    const range = nairobiRange(from, to);
    const where: Prisma.SmsLogWhereInput = { createdAt: range };

    const [byStatus, byKind, units, daily, providers, types, routes, orgRows, reasons] =
      await Promise.all([
        this.db.smsLog.groupBy({ by: ['status'], where, _count: { _all: true } }),
        this.db.smsLog.groupBy({ by: ['kind'], where, _count: { _all: true } }),
        this.db.smsLog.aggregate({ where: { ...where, status: 'SENT' }, _sum: { units: true } }),
        this.db.$queryRaw<{ day: string; status: SmsLogStatus; n: number }[]>`
          SELECT to_char(("createdAt" + interval '3 hours')::date, 'YYYY-MM-DD') AS day,
                 "status", count(*)::int AS n
            FROM "sms_logs"
           WHERE "createdAt" >= (${range.gte.toISOString()}::timestamptz AT TIME ZONE 'UTC')
             AND "createdAt" < (${range.lt.toISOString()}::timestamptz AT TIME ZONE 'UTC')
           GROUP BY 1, 2`,
        this.db.smsLog.groupBy({
          by: ['provider', 'status'],
          where: { ...where, provider: { not: null } },
          _count: { _all: true },
        }),
        this.db.smsLog.groupBy({ by: ['type', 'kind', 'status'], where, _count: { _all: true } }),
        this.db.smsLog.groupBy({
          by: ['route', 'status'],
          where: { ...where, route: { not: null } },
          _count: { _all: true },
        }),
        this.db.smsLog.groupBy({
          by: ['orgId', 'status'],
          where: { ...where, kind: 'ORG', orgId: { not: null } },
          _count: { _all: true },
          _sum: { units: true },
        }),
        this.db.smsLog.groupBy({
          by: ['reason'],
          where: { ...where, status: 'FAILED', reason: { not: null } },
          _count: { _all: true },
          orderBy: { _count: { reason: 'desc' } },
          take: 5,
        }),
      ]);

    const [sold, paid, held, low, failing] = await Promise.all([
      this.db.smsLedgerEntry.aggregate({
        where: { createdAt: range, kind: 'PURCHASE' },
        _sum: { units: true },
      }),
      this.db.smsPurchase.aggregate({
        where: { state: 'PAID', paidAt: range },
        _sum: { amount: true },
      }),
      this.db.smsAccount.aggregate({ where: { mode: 'PLATFORM' }, _sum: { balance: true } }),
      this.db.$queryRaw<{ orgId: string; balance: number; lowBalanceLevel: number }[]>`
        SELECT a."orgId", a."balance", a."lowBalanceLevel"
          FROM "sms_accounts" a JOIN "organizations" o ON o."id" = a."orgId"
         WHERE a."mode" = 'PLATFORM' AND a."balance" < a."lowBalanceLevel" AND o."status" <> 'CLOSED'
         ORDER BY a."balance" ASC LIMIT 10`,
      this.db.smsAccount.findMany({
        where: { mode: 'OWN', failingSince: { not: null } },
        orderBy: { failingSince: 'asc' },
        take: 10,
      }),
    ]);

    const count = (status: SmsLogStatus) =>
      byStatus.find((s) => s.status === status)?._count._all ?? 0;
    const sent = count('SENT');
    const failed = count('FAILED');
    const noUnits = count('NO_UNITS');
    const messages = sent + failed + noUnits;

    const dailyMap = new Map(
      daysBetween(from, to).map((day) => [day, { day, sent: 0, failed: 0, noUnits: 0 }]),
    );
    for (const d of daily) {
      const row = dailyMap.get(d.day);
      if (!row) continue;
      if (d.status === 'SENT') row.sent += d.n;
      else if (d.status === 'FAILED') row.failed += d.n;
      else row.noUnits += d.n;
    }

    const providerMap = new Map<
      SmsProvider,
      { provider: SmsProvider; sent: number; failed: number }
    >();
    for (const p of providers) {
      if (!p.provider) continue;
      const row = providerMap.get(p.provider) ?? { provider: p.provider, sent: 0, failed: 0 };
      if (p.status === 'SENT') row.sent += p._count._all;
      else if (p.status === 'FAILED') row.failed += p._count._all;
      providerMap.set(p.provider, row);
    }

    const typeMap = new Map<
      string,
      { type: string; kind: string; sent: number; failed: number; noUnits: number }
    >();
    for (const ty of types) {
      const key = `${ty.kind}:${ty.type}`;
      const row = typeMap.get(key) ?? {
        type: ty.type,
        kind: ty.kind,
        sent: 0,
        failed: 0,
        noUnits: 0,
      };
      bump(row, ty.status, ty._count._all);
      typeMap.set(key, row);
    }

    const routeMap = new Map<string, { route: string; sent: number; failed: number }>();
    for (const r of routes) {
      if (!r.route) continue;
      const row = routeMap.get(r.route) ?? { route: r.route, sent: 0, failed: 0 };
      if (r.status === 'SENT') row.sent += r._count._all;
      else if (r.status === 'FAILED') row.failed += r._count._all;
      routeMap.set(r.route, row);
    }

    const orgMap = new Map<
      string,
      { orgId: string; name: string; sent: number; failed: number; noUnits: number; units: number }
    >();
    for (const o of orgRows) {
      if (!o.orgId) continue;
      const row = orgMap.get(o.orgId) ?? {
        orgId: o.orgId,
        name: '',
        sent: 0,
        failed: 0,
        noUnits: 0,
        units: 0,
      };
      bump(row, o.status, o._count._all);
      row.units += o._sum.units ?? 0;
      orgMap.set(o.orgId, row);
    }
    const topOrgs = [...orgMap.values()]
      .sort((a, b) => b.sent + b.failed + b.noUnits - (a.sent + a.failed + a.noUnits))
      .slice(0, 10);

    const names = await this.orgNames([
      ...topOrgs.map((o) => o.orgId),
      ...low.map((l) => l.orgId),
      ...failing.map((f) => f.orgId),
    ]);
    const kindCount = (kind: 'PLATFORM' | 'ORG') =>
      byKind.find((k) => k.kind === kind)?._count._all ?? 0;
    const byCount = <T extends { sent: number; failed: number }>(a: T, b: T) =>
      b.sent + b.failed - (a.sent + a.failed);

    return {
      from,
      to,
      totals: {
        messages,
        sent,
        failed,
        noUnits,
        successRate: messages ? Math.round((sent / messages) * 1000) / 1000 : null,
        unitsUsed: units._sum.units ?? 0,
        kodihubMessages: kindCount('PLATFORM'),
        orgMessages: kindCount('ORG'),
      },
      money: {
        unitsSold: sold._sum.units ?? 0,
        amountPaid: (paid._sum.amount ?? 0n).toString(),
        unitsHeld: held._sum.balance ?? 0,
      },
      daily: [...dailyMap.values()],
      byProvider: [...providerMap.values()].sort(byCount),
      byType: [...typeMap.values()].sort(byCount),
      byRoute: [...routeMap.values()].sort(byCount),
      topOrgs: topOrgs.map((o) => ({ ...o, name: names.get(o.orgId) ?? '' })),
      lowBalance: low.map((l) => ({ ...l, name: names.get(l.orgId) ?? '' })),
      failing: failing.map((f) => ({
        orgId: f.orgId,
        name: names.get(f.orgId) ?? '',
        provider: f.provider,
        since: f.failingSince,
        reason: f.lastFailReason,
      })),
      topReasons: reasons.map((r) => ({ reason: r.reason ?? '', count: r._count._all })),
    };
  }

  private async orgNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (!unique.length) return new Map();
    const orgs = await this.db.organization.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(orgs.map((o) => [o.id, o.name]));
  }
}

function bump(
  row: { sent: number; failed: number; noUnits: number },
  status: SmsLogStatus,
  n: number,
) {
  if (status === 'SENT') row.sent += n;
  else if (status === 'FAILED') row.failed += n;
  else row.noUnits += n;
}
