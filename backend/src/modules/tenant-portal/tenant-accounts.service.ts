import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  currentContext,
  emptyContext,
  runWithContext,
} from '../../common/context/request-context.js';
import { formatDateOnly } from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import { money } from '../../common/pdf/pdf.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { PaymentChannel } from '../../generated/prisma/client.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { orgContext } from '../auth/decorators.js';
import { normalizeEmail, normalizePhone } from '../auth/identifiers.js';
import { todayInNairobi } from '../billing/billing-math.js';
import { DarajaConfigService } from '../mpesa/daraja-config.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AccountsService } from '../payments/accounts.service.js';
import { renderStatementPdf } from '../payments/pdfs.js';
import { TenantsService } from '../portfolio/tenants/tenants.service.js';
import { tenantScope } from '../portfolio/property-scope.js';
import { MessagesService } from './messages.service.js';
import {
  type PayHint,
  type Plan,
  planReminders,
  readReminders,
  reminderText,
} from './reminders.js';

type ReminderPlan = Plan | { kind: 'REMINDER_MANUAL'; amount: bigint };

/**
 * Staff side of the tenant portal and reminders: who has access, how a tenant pays, and the
 * SMS reminders (manual and the daily job).
 */
@Injectable()
export class TenantAccountsService {
  private readonly log = new Logger(TenantAccountsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenants: TenantsService,
    private readonly messages: MessagesService,
    private readonly daraja: DarajaConfigService,
    private readonly notifications: NotificationsService,
    private readonly accounts: AccountsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ── How a tenant pays ──

  /** Active paybill/till/bank channels covering any of the properties, paybills first. */
  async channelsFor(propertyIds: string[]): Promise<PaymentChannel[]> {
    const rows = await this.db.paymentChannel.findMany({
      where: {
        status: 'ACTIVE',
        kind: { in: ['MPESA_PAYBILL', 'MPESA_TILL', 'BANK_ACCOUNT'] },
        OR: [
          { propertyIds: { isEmpty: true } },
          ...(propertyIds.length ? [{ propertyIds: { hasSome: propertyIds } }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    const rank = { MPESA_PAYBILL: 0, MPESA_TILL: 1, BANK_ACCOUNT: 2 } as Record<string, number>;
    return rows.sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9));
  }

  howToPay(channels: PaymentChannel[], code: string) {
    return channels
      .filter((c) => (c.kind === 'BANK_ACCOUNT' ? !!c.accountNumber : !!c.shortcode))
      .map((c) => ({
        kind: c.kind,
        name: c.name,
        shortcode: c.shortcode,
        bankName: c.bankName,
        accountNumber: c.accountNumber,
        accountName: c.accountName,
        accountRef: c.kind === 'MPESA_TILL' ? null : code,
      }));
  }

  /** The M-Pesa channel tenants can be prompted on (configured, with a passkey), or null. */
  stkChannel(channels: PaymentChannel[]): PaymentChannel | null {
    for (const c of channels) {
      if (c.kind !== 'MPESA_PAYBILL' && c.kind !== 'MPESA_TILL') continue;
      try {
        if (this.daraja.credentials(c)?.passkey && c.darajaEnv && c.callbackToken) return c;
      } catch {
        // unreadable credentials: not usable
      }
    }
    return null;
  }

  private payHint(channels: PaymentChannel[]): PayHint | null {
    const c = channels.find(
      (x) => (x.kind === 'MPESA_PAYBILL' || x.kind === 'MPESA_TILL') && x.shortcode,
    );
    return c ? { kind: c.kind as PayHint['kind'], shortcode: c.shortcode! } : null;
  }

  async propertiesOf(tenantId: string): Promise<string[]> {
    const rows = await this.db.tenancy.findMany({
      where: { tenantId, status: { in: ['ACTIVE', 'NOTICE'] } },
      select: { unit: { select: { propertyId: true } } },
    });
    return [...new Set(rows.map((r) => r.unit.propertyId))];
  }

  // ── Portal access ──

  async grant(tenantId: string) {
    const t = await this.tenants.find(tenantId);
    await this.grantOne(t);
    return this.portal(tenantId);
  }

  async grantAll(propertyId?: string) {
    const rows = await this.db.tenant.findMany({
      where: {
        AND: [
          tenantScope(),
          { userId: null },
          {
            tenancies: {
              some: {
                status: { in: ['ACTIVE', 'NOTICE'] },
                ...(propertyId ? { unit: { propertyId } } : {}),
              },
            },
          },
        ],
      },
    });
    let invited = 0;
    for (const t of rows) {
      try {
        await this.grantOne(t);
        invited++;
      } catch (e) {
        this.log.warn({ err: e, tenantId: t.id }, 'Could not give a tenant portal access');
      }
    }
    return { invited };
  }

  private async grantOne(t: {
    id: string;
    orgId: string;
    code: string;
    phone: string;
    email: string | null;
    firstName: string;
    lastName: string;
  }) {
    const phone = normalizePhone(t.phone);
    if (!phone) throw AppError.conflict('This tenant has no phone number', 'NO_CONTACT');
    const email = t.email ? normalizeEmail(t.email) : null;
    // Users are global: look them up unscoped. A tenant may already be staff or a landlord.
    let user = await this.prisma.user.findFirst({ where: { phone } });
    if (!user) {
      const emailFree = email ? !(await this.prisma.user.count({ where: { email } })) : false;
      user = await this.prisma.user.create({
        data: {
          phone,
          email: emailFree ? email : null,
          firstName: t.firstName,
          lastName: t.lastName,
        },
      });
    } else if (!user.email && email) {
      const emailFree = !(await this.prisma.user.count({ where: { email } }));
      if (emailFree) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { email },
        });
      }
    }
    await this.db.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: t.id },
        data: { userId: user.id, portalInvitedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'tenant.portal_grant',
          entity: 'tenant',
          entityId: t.id,
          after: { userId: user.id },
        },
        tx,
      );
    });
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: t.orgId },
      select: { name: true },
    });
    const link = `${this.env.APP_URL.replace(/\/$/, '')}/tenant`;
    await this.messages.sms({
      orgId: t.orgId,
      tenantId: t.id,
      kind: 'PORTAL_ACCESS',
      to: phone,
      text: `Hi ${t.firstName}, see your rent account with ${org.name.slice(0, 40)} and pay by M-Pesa: ${link} - sign in with a code sent to this phone.`,
    });
    if (email) {
      try {
        await this.notifications.sendTenantWelcome(
          { email, phone },
          {
            firstName: t.firstName,
            lastName: t.lastName,
            organizationName: org.name,
            tenantCode: t.code,
          },
        );
      } catch (e) {
        this.log.warn({ err: e, tenantId: t.id }, 'Portal access email failed');
      }
    }
  }

  async revoke(tenantId: string) {
    await this.tenants.find(tenantId);
    await this.db.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: { userId: null } });
      await this.audit.record(
        { action: 'tenant.portal_revoke', entity: 'tenant', entityId: tenantId },
        tx,
      );
    });
    return this.portal(tenantId);
  }

  async portal(tenantId: string) {
    const t = await this.db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { userId: true, portalInvitedAt: true },
    });
    return { hasAccess: !!t.userId, invitedAt: t.portalInvitedAt };
  }

  // ── Reminders ──

  private async openInvoices(tenantIds?: string[]) {
    const rows = await this.db.invoice.findMany({
      where: {
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
        ...(tenantIds ? { tenantId: { in: tenantIds } } : {}),
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        number: true,
        period: true,
        tenantId: true,
        propertyId: true,
        dueDate: true,
        total: true,
        amountPaid: true,
        creditedAmount: true,
        tenancy: {
          select: {
            unit: {
              select: {
                number: true,
                property: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    return rows.map((i) => ({
      id: i.id,
      number: i.number,
      period: i.period,
      propertyName: i.tenancy?.unit.property.name ?? null,
      unitNumber: i.tenancy?.unit.number ?? null,
      tenantId: i.tenantId,
      propertyId: i.propertyId,
      dueDate: formatDateOnly(i.dueDate),
      balance: i.total - i.amountPaid - i.creditedAmount,
    }));
  }

  private formatPaymentInstructions(channels: PaymentChannel[], tenantCode: string): string {
    const ways = this.howToPay(channels, tenantCode);
    if (!ways.length) {
      return `Sign in to the KodiHub Tenant Portal to view payment options (Account ref: ${tenantCode}).`;
    }
    return ways
      .map((w) => {
        if (w.kind === 'MPESA_PAYBILL') {
          return `- M-Pesa Paybill ${w.shortcode} (${w.name}), Account: ${w.accountRef}`;
        }
        if (w.kind === 'MPESA_TILL') {
          return `- M-Pesa Buy Goods Till ${w.shortcode} (${w.name})`;
        }
        return `- Bank transfer: ${w.bankName ?? w.name}, Account ${w.accountNumber}${w.accountName ? ` (${w.accountName})` : ''}, Ref: ${w.accountRef}`;
      })
      .join('\n');
  }

  private async sendReminderEmailIfPossible(
    tenant: {
      id: string;
      firstName: string;
      lastName: string;
      code: string;
      phone: string;
      email: string | null;
    },
    orgName: string,
    plan: ReminderPlan,
    tenantOpenInvoices: Awaited<ReturnType<TenantAccountsService['openInvoices']>>,
    channels: PaymentChannel[],
  ) {
    if (!tenant.email) return;
    try {
      const reminderStatus =
        plan.kind === 'REMINDER_DUE'
          ? `due on ${plan.due}`
          : plan.kind === 'REMINDER_OVERDUE'
            ? `overdue since ${plan.since}`
            : 'payment due';
      const openInvoicesSummary = tenantOpenInvoices
        .filter((i) => i.balance > 0n)
        .map((i) => {
          const where =
            i.propertyName && i.unitNumber
              ? ` · ${i.propertyName}, Unit ${i.unitNumber}`
              : i.propertyName
                ? ` · ${i.propertyName}`
                : '';
          return `- ${i.number} (${i.period}${where} · due ${i.dueDate}): KES ${money(i.balance)}`;
        })
        .join('\n');
      const statementData = await this.accounts.forStatementPdf(tenant.id, {});
      const pdfBuffer = await renderStatementPdf(statementData);
      await this.notifications.sendTenantRentReminder(
        { email: tenant.email, phone: tenant.phone },
        {
          firstName: tenant.firstName,
          lastName: tenant.lastName,
          organizationName: orgName,
          tenantCode: tenant.code,
          reminderStatus,
          amountDueKes: money(plan.amount),
          openInvoicesSummary:
            openInvoicesSummary || `- Total open balance: KES ${money(plan.amount)}`,
          paymentInstructions: this.formatPaymentInstructions(channels, tenant.code),
          pdfBuffer,
          pdfFilename: `Statement-${tenant.code}.pdf`,
        },
      );
    } catch (e) {
      this.log.warn({ err: e, tenantId: tenant.id }, 'Rent reminder email failed');
    }
  }

  /** "Send reminder now": the tenant's whole open balance. */
  async remindNow(tenantId: string) {
    const t = await this.tenants.find(tenantId);
    const open = await this.openInvoices([t.id]);
    const amount = open.reduce((s, i) => s + (i.balance > 0n ? i.balance : 0n), 0n);
    if (amount <= 0n) throw AppError.conflict('This tenant owes nothing right now', 'NOTHING_DUE');
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: orgContext().orgId },
      select: { name: true },
    });
    const channels = await this.channelsFor([...new Set(open.map((i) => i.propertyId))]);
    const plan: ReminderPlan = { kind: 'REMINDER_MANUAL', amount };
    const msg = await this.messages.sms({
      orgId: orgContext().orgId,
      tenantId: t.id,
      kind: 'REMINDER_MANUAL',
      to: t.phone,
      text: reminderText(
        { firstName: t.firstName, code: t.code, orgName: org.name, pay: this.payHint(channels) },
        plan,
      ),
    });
    await this.sendReminderEmailIfPossible(t, org.name, plan, open, channels);
    return msg!;
  }

  /** Today's automatic reminders for the active organisation (if it has them switched on). */
  async runReminders(today = todayInNairobi()) {
    const ctxOrg = currentContext()?.orgId;
    if (!ctxOrg) throw new Error('No active organisation');
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: ctxOrg },
      select: { name: true, settings: true },
    });
    const settings = readReminders(org.settings);
    if (!settings.enabled) return { sent: 0, skipped: 'reminders are off' };
    const open = await this.openInvoices();
    const plans = planReminders(open, settings, today);
    if (!plans.size) return { sent: 0 };
    const tenants = await this.db.tenant.findMany({
      where: { id: { in: [...plans.keys()] }, remindersOff: false },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        code: true,
        phone: true,
        email: true,
      },
    });
    let sent = 0;
    for (const t of tenants) {
      const plan = plans.get(t.id)!;
      // One automatic SMS per tenant per day, whichever kind.
      const already = await this.db.message.count({
        where: {
          tenantId: t.id,
          day: new Date(`${today}T00:00:00.000Z`),
          kind: { in: ['REMINDER_DUE', 'REMINDER_OVERDUE'] },
        },
      });
      if (already) continue;
      const tenantOpen = open.filter((i) => i.tenantId === t.id);
      const props = [...new Set(tenantOpen.map((i) => i.propertyId))];
      const channels = await this.channelsFor(props);
      const text = reminderText(
        {
          firstName: t.firstName,
          code: t.code,
          orgName: org.name,
          pay: this.payHint(channels),
        },
        plan,
      );
      const msg = await this.messages.sms({
        orgId: ctxOrg,
        tenantId: t.id,
        kind: plan.kind,
        to: t.phone,
        text,
      });
      await this.sendReminderEmailIfPossible(t, org.name, plan, tenantOpen, channels);
      if (msg?.status === 'SENT') sent++;
    }
    return { sent };
  }

  /** Scheduled, every organisation with reminders on. */
  async runRemindersAll() {
    const orgs = await this.prisma.organization.findMany({
      where: { status: { not: 'CLOSED' } },
      select: { id: true, settings: true },
    });
    let sent = 0;
    for (const o of orgs.filter((x) => readReminders(x.settings).enabled)) {
      try {
        sent += (await runWithContext(emptyContext({ orgId: o.id }), () => this.runReminders()))
          .sent;
      } catch (e) {
        this.log.error({ err: e, orgId: o.id }, 'Reminders failed for an organisation');
      }
    }
    return { sent };
  }
}
