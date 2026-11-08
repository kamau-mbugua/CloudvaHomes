import { Inject, Injectable } from '@nestjs/common';
import { currentContext } from '../../common/context/request-context.js';
import { FieldCipher } from '../../common/crypto/field-cipher.js';
import { parseDateOnly } from '../../common/dates/date-only.js';
import type { ErrorDetail } from '../../common/errors/app-error.js';
import { AppError } from '../../common/errors/app-error.js';
import { toSkipTake } from '../../common/http/pagination.js';
import { paginated } from '../../common/http/response.js';
import type { Prisma, SmsAccount } from '../../generated/prisma/client.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { addDays } from '../billing/billing-math.js';
import { creditUnits } from '../notifications/sms/sms-accounts.service.js';
import { orgKeyContext, orgPasswordContext, SmsService } from '../notifications/sms/sms.service.js';
import { requiredPhone } from '../portfolio/fields.js';
import { PlatformBillingService } from './platform-billing.service.js';
import { PlatformPayService } from './platform-pay.service.js';
import type { AdminSmsSetupDto, SmsUsageQueryDto, UpdateSmsDto } from './sms.dto.js';
import { SmsPurchasesService } from './sms-purchases.service.js';

/** "+254722000111" → "+2547****111": enough to recognise, not enough to collect. */
export function maskPhone(to: string): string {
  return to.length > 8 ? `${to.slice(0, 5)}****${to.slice(-3)}` : '****';
}

/** Organisation SMS page and the KodiHub admin's SMS controls (spec §3, §6). */
@Injectable()
export class SmsSettingsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly cipher: FieldCipher,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
    private readonly purchases: SmsPurchasesService,
    private readonly billing: PlatformBillingService,
    private readonly pay: PlatformPayService,
  ) {}

  // ── What the organisation sees ──

  async view(orgId: string) {
    const account = await this.sms.account(orgId);
    const [totals, quote, settings] = await Promise.all([
      this.db.smsLedgerEntry.groupBy({ by: ['kind'], where: { orgId }, _sum: { units: true } }),
      this.purchases.quote(orgId),
      this.billing.settings(),
    ]);
    const sum = (kind: string) => totals.find((t) => t.kind === kind)?._sum.units ?? 0;
    return {
      mode: account.mode,
      provider: account.mode === 'OWN' ? account.provider : null,
      senderId: account.mode === 'OWN' ? account.senderId : null,
      balance: account.balance,
      unitsBought: sum('PURCHASE'),
      unitsUsed: -sum('CHARGE') - sum('REFUND'),
      lowBalanceLevel: account.lowBalanceLevel,
      fallbackToPlatform: account.fallbackToPlatform,
      unitPrice: quote.unitPrice.toString(),
      failing:
        account.failingSince && account.mode === 'OWN'
          ? { since: account.failingSince.toISOString(), reason: account.lastFailReason ?? '' }
          : null,
      canBuyInApp: this.pay.canPayInApp(settings),
    };
  }

  async update(orgId: string, dto: UpdateSmsDto) {
    const account = await this.sms.account(orgId);
    if (dto.fallbackToPlatform && account.mode !== 'OWN') {
      throw AppError.fieldInvalid(
        'fallbackToPlatform',
        'Only for organisations that send SMS from their own account',
      );
    }
    await this.db.smsAccount.update({
      where: { orgId },
      data: {
        ...(dto.lowBalanceLevel !== undefined ? { lowBalanceLevel: dto.lowBalanceLevel } : {}),
        ...(dto.fallbackToPlatform !== undefined
          ? { fallbackToPlatform: dto.fallbackToPlatform }
          : {}),
      },
    });
    return this.view(orgId);
  }

  async usage(orgId: string, q: SmsUsageQueryDto) {
    const where: Prisma.SmsLogWhereInput = {
      orgId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: parseDateOnly(q.from) } : {}),
              ...(q.to ? { lt: addDays(parseDateOnly(q.to), 1) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.smsLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(q) }),
      this.db.smsLog.count({ where }),
    ]);
    return paginated(
      rows.map((r) => ({
        id: r.id,
        at: r.createdAt,
        type: r.type,
        to: maskPhone(r.to),
        units: r.units,
        status: r.status,
        route: r.route,
        reason: r.reason,
      })),
      total,
      q,
    );
  }

  async topUps(orgId: string, q: { page: number; pageSize: number }) {
    const where: Prisma.SmsLedgerEntryWhereInput = {
      orgId,
      kind: { in: ['PURCHASE', 'ADJUSTMENT'] },
    };
    const [rows, total] = await Promise.all([
      this.db.smsLedgerEntry.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(q) }),
      this.db.smsLedgerEntry.count({ where }),
    ]);
    const ids = rows.map((r) => r.purchaseId).filter((id): id is string => !!id);
    const purchases = ids.length
      ? await this.db.smsPurchase.findMany({ where: { id: { in: ids } } })
      : [];
    return paginated(
      rows.map((r) => {
        const p = purchases.find((x) => x.id === r.purchaseId);
        return {
          id: r.id,
          at: r.createdAt,
          kind: r.kind,
          units: r.units,
          balanceAfter: r.balanceAfter,
          reason: r.reason,
          amount: p ? p.amount.toString() : null,
          mpesaReceipt: p?.mpesaReceipt ?? null,
          source: p?.source ?? null,
        };
      }),
      total,
      q,
    );
  }

  // ── KodiHub admin ──

  async adminView(orgId: string) {
    await this.requireOrg(orgId);
    const account = await this.sms.account(orgId);
    return { ...(await this.view(orgId)), ...this.secretsView(account) };
  }

  async adminSetup(orgId: string, dto: AdminSmsSetupDto) {
    await this.requireOrg(orgId);
    const before = await this.sms.account(orgId);
    const data: Prisma.SmsAccountUpdateInput = {
      mode: dto.mode,
      ...(dto.unitPrice !== undefined
        ? { unitPrice: dto.unitPrice === null ? null : BigInt(dto.unitPrice) }
        : {}),
    };
    if (dto.mode === 'PLATFORM') {
      data.fallbackToPlatform = false;
      data.failingSince = null;
      data.lastFailReason = null;
    } else {
      const provider = dto.provider ?? before.provider;
      const providerChanged = provider !== before.provider;
      const providerUser = dto.providerUser?.trim() || (providerChanged ? '' : before.providerUser);
      const senderId = dto.senderId?.trim() || (providerChanged ? '' : before.senderId);
      const hasKey = Boolean(dto.apiKey?.trim()) || (!providerChanged && !!before.providerKeyEnc);
      const hasPassword =
        Boolean(dto.password?.trim()) || (!providerChanged && !!before.providerSecretEnc);
      const missing: ErrorDetail[] = [];
      if (!provider) missing.push({ field: 'provider', message: 'Choose the SMS provider' });
      if (!providerUser)
        missing.push({ field: 'providerUser', message: 'Enter the account user ID' });
      if (!senderId) missing.push({ field: 'senderId', message: 'Enter the approved sender ID' });
      if (!hasKey) missing.push({ field: 'apiKey', message: 'Enter the API key' });
      if (provider === 'HOSTPINNACLE' && !hasPassword) {
        missing.push({ field: 'password', message: 'Enter the HostPinnacle password' });
      }
      if (missing.length) throw AppError.validation(missing);
      Object.assign(data, {
        provider,
        providerUser,
        senderId,
        sandbox: dto.sandbox ?? (providerChanged ? false : before.sandbox),
        failingSince: null,
        lastFailReason: null,
      });
      if (dto.apiKey?.trim()) {
        data.providerKeyEnc = Buffer.from(
          this.cipher.encrypt(dto.apiKey.trim(), orgKeyContext(orgId)),
        );
      }
      if (dto.password?.trim()) {
        data.providerSecretEnc = Buffer.from(
          this.cipher.encrypt(dto.password.trim(), orgPasswordContext(orgId)),
        );
      } else if (providerChanged) {
        data.providerSecretEnc = null;
      }
    }
    const after = await this.db.smsAccount.update({ where: { orgId }, data });
    await this.audit.record({
      action: 'sms.account.update',
      entity: 'sms_account',
      entityId: orgId,
      orgId,
      before: this.auditView(before),
      after: this.auditView(after),
    });
    return this.adminView(orgId);
  }

  async adminTest(orgId: string, phone: string) {
    await this.requireOrg(orgId);
    return this.sms.sendTest(orgId, requiredPhone('phone', phone));
  }

  async adjust(orgId: string, units: number, reason: string) {
    await this.requireOrg(orgId);
    await this.sms.account(orgId);
    const balance = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ balance: number }[]>`
        SELECT "balance" FROM "sms_accounts" WHERE "orgId" = ${orgId}::uuid FOR UPDATE`;
      const current = rows[0]?.balance ?? 0;
      if (current + units < 0) {
        throw AppError.fieldInvalid(
          'units',
          `This would take the balance below zero (${current} units left).`,
        );
      }
      return creditUnits(tx, orgId, units, {
        kind: 'ADJUSTMENT',
        reason: reason.trim(),
        createdById: currentContext()?.userId ?? null,
      });
    });
    await this.audit.record({
      action: 'sms.adjust',
      entity: 'sms_account',
      entityId: orgId,
      orgId,
      after: { units, reason: reason.trim(), balance },
    });
    return { balance };
  }

  /** Units sold, paid for and used per organisation in a month (KodiHub admin report). */
  async report(month: string) {
    const from = parseDateOnly(`${month}-01`);
    const to = parseDateOnly(
      month.endsWith('-12')
        ? `${Number(month.slice(0, 4)) + 1}-01-01`
        : `${month.slice(0, 5)}${String(Number(month.slice(5)) + 1).padStart(2, '0')}-01`,
    );
    const range = { gte: from, lt: to };
    const [ledger, paid, free] = await Promise.all([
      this.db.smsLedgerEntry.groupBy({
        by: ['orgId', 'kind'],
        where: { createdAt: range, kind: { in: ['PURCHASE', 'CHARGE', 'REFUND'] } },
        _sum: { units: true },
      }),
      this.db.smsPurchase.groupBy({
        by: ['orgId'],
        where: { state: 'PAID', paidAt: range },
        _sum: { amount: true },
      }),
      this.db.smsLog.groupBy({
        by: ['orgId'],
        where: { createdAt: range, route: 'PLATFORM_FREE', status: 'SENT' },
        _count: { _all: true },
      }),
    ]);
    const orgIds = [
      ...new Set([
        ...ledger.map((l) => l.orgId),
        ...paid.map((p) => p.orgId),
        ...free.map((f) => f.orgId),
      ]),
    ].filter((id): id is string => !!id);
    const orgs = await this.db.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true },
    });
    const sum = (orgId: string, kind: string) =>
      ledger.find((l) => l.orgId === orgId && l.kind === kind)?._sum.units ?? 0;
    return orgs
      .map((o) => ({
        orgId: o.id,
        name: o.name,
        unitsBought: sum(o.id, 'PURCHASE'),
        amountPaid: (paid.find((p) => p.orgId === o.id)?._sum.amount ?? 0n).toString(),
        unitsUsed: -sum(o.id, 'CHARGE') - sum(o.id, 'REFUND'),
        unitsFree: free.find((f) => f.orgId === o.id)?._count._all ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private async requireOrg(orgId: string) {
    const org = await this.db.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    });
    if (!org) throw AppError.notFound('Organisation');
  }

  private secretsView(a: SmsAccount) {
    return {
      providerUser: a.providerUser,
      sandbox: a.sandbox,
      hasApiKey: Boolean(a.providerKeyEnc),
      hasPassword: Boolean(a.providerSecretEnc),
      unitPriceOverride: a.unitPrice?.toString() ?? null,
    };
  }

  private auditView(a: SmsAccount) {
    return {
      mode: a.mode,
      provider: a.provider,
      providerUser: a.providerUser,
      senderId: a.senderId,
      sandbox: a.sandbox,
      unitPrice: a.unitPrice?.toString() ?? null,
      hasApiKey: Boolean(a.providerKeyEnc),
      hasPassword: Boolean(a.providerSecretEnc),
    };
  }
}
