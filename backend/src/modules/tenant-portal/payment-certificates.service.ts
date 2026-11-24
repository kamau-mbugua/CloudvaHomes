import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { currentContext, withoutOrgScope } from '../../common/context/request-context.js';
import { formatDateOnly, parseDateOnly } from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { violatesUnique } from '../../prisma/errors.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { lastMonths } from './tenant-insights.js';
import { todayInNairobi } from '../billing/billing-math.js';
import { certificateCode, certificateFigures } from './payment-certificate.js';

export interface CertificateSummary {
  tenantName: string;
  tenantCode: string;
  orgName: string;
  homes: string[];
  from: string;
  to: string;
  invoices: number;
  billed: string;
  paid: string;
  onTime: number;
  late: number;
  unpaid: number;
}

export interface IssuedCertificate {
  code: string;
  issuedAt: Date;
  verifyUrl: string;
  summary: CertificateSummary;
  org: { name: string; phone: string; email: string; kraPin: string | null };
}

/**
 * Payment history certificates (phase 23, no partner): a tenant downloads one for, say, a new
 * landlord or a loan application. The figures are frozen when issued; anyone holding the code
 * can check it at /verify/<code>, which shows only what the certificate itself says.
 */
@Injectable()
export class PaymentCertificatesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Runs as the tenant (inside the portal's `as`): their invoices in their organisation. */
  async issue(tenantId: string, months: number): Promise<IssuedCertificate> {
    const orgId = currentContext()!.orgId!;
    const today = todayInNairobi();
    const fromDate = parseDateOnly(`${lastMonths(today, months)[0]}-01`);
    const toDate = parseDateOnly(today);
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { name: true, phone: true, email: true, kraPin: true },
    });

    // The same certificate all day: re-opening (or a document thumbnail) doesn't make another.
    const existing = await this.db.paymentCertificate.findFirst({
      where: { tenantId, fromDate, toDate },
      orderBy: { issuedAt: 'desc' },
    });
    if (existing) return this.view(existing, org);

    const tenant = await this.db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        firstName: true,
        lastName: true,
        code: true,
        tenancies: {
          where: {
            startDate: { lte: toDate },
            OR: [{ endDate: null }, { endDate: { gte: fromDate } }],
          },
          select: { unit: { select: { number: true, property: { select: { name: true } } } } },
        },
      },
    });
    const invoices = await this.db.invoice.findMany({
      where: { tenantId, status: { not: 'VOID' }, dueDate: { gte: fromDate, lte: toDate } },
      select: {
        dueDate: true,
        total: true,
        creditedAmount: true,
        allocations: { select: { amount: true, payment: { select: { receivedAt: true } } } },
      },
    });
    const f = certificateFigures(
      invoices.map((i) => ({
        dueDate: i.dueDate,
        net: i.total - i.creditedAmount,
        allocations: i.allocations.map((a) => ({
          amount: a.amount,
          receivedAt: a.payment.receivedAt,
        })),
      })),
    );
    const summary: CertificateSummary = {
      tenantName: `${tenant.firstName} ${tenant.lastName}`.trim(),
      tenantCode: tenant.code,
      orgName: org.name,
      homes: tenant.tenancies.map((t) => `${t.unit.number}, ${t.unit.property.name}`),
      from: formatDateOnly(fromDate),
      to: formatDateOnly(toDate),
      invoices: f.invoices,
      billed: f.billed.toString(),
      paid: f.paid.toString(),
      onTime: f.onTime,
      late: f.late,
      unpaid: f.unpaid,
    };
    for (let attempt = 0; ; attempt++) {
      try {
        const row = await this.db.paymentCertificate.create({
          data: {
            orgId,
            tenantId,
            code: certificateCode((n) => randomInt(0, n)),
            fromDate,
            toDate,
            summary: summary as unknown as Prisma.InputJsonValue,
          },
        });
        return this.view(row, org);
      } catch (e) {
        if (attempt < 3 && violatesUnique(e, 'code')) continue;
        throw e;
      }
    }
  }

  /** Public check by code: only what the certificate says. Rate-limited per address. */
  async verify(code: string, ip: string) {
    await this.rateLimit.hit({ key: `cert:verify:ip:${ip}`, limit: 30, windowSeconds: 3600 });
    const row = await withoutOrgScope(() =>
      this.prisma.paymentCertificate.findUnique({ where: { code: code.trim().toUpperCase() } }),
    );
    if (!row) throw AppError.notFound('Certificate');
    return {
      code: row.code,
      issuedAt: row.issuedAt,
      ...(row.summary as unknown as CertificateSummary),
    };
  }

  private view(
    row: { code: string; issuedAt: Date; summary: Prisma.JsonValue },
    org: IssuedCertificate['org'],
  ): IssuedCertificate {
    const base = this.env.APP_URL.replace(/\/$/, '');
    return {
      code: row.code,
      issuedAt: row.issuedAt,
      verifyUrl: `${base}/verify/${row.code}`,
      summary: row.summary as unknown as CertificateSummary,
      org,
    };
  }
}
