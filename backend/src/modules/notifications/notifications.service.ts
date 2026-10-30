import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { currentContext } from '../../common/context/request-context.js';
import { FieldCipher } from '../../common/crypto/field-cipher.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type EmailTemplateKey,
  interpolateTemplate,
  renderBrandedEmailHtml,
  resolveEmailTemplate,
} from './email-templates.js';
import {
  AfricasTalkingSmsSender,
  createEmailSender,
  createSmsSender,
  type EmailMessage,
  type EmailSender,
  type SmsSender,
} from './senders.js';

export const SMTP_PASS_CONTEXT = 'platform.smtp.password';
export const AT_API_KEY_CONTEXT = 'platform.sms.africastalking';

export interface Recipient {
  email?: string | null;
  phone?: string | null;
}

export interface OwnerWelcomeBilling {
  billingRef: string | null;
  planName: string | null;
  pricePerUnitKes: string;
  minimumMonthlyKes: string;
  trialEndsAt: string | null;
  firstPaidDate: string;
  firstInvoiceDate: string;
  dueDays: number;
  paybill: string | null;
}

export interface PlatformInvoiceEmailPayload {
  ownerFirstName?: string | null;
  organizationName: string;
  billingRef: string | null;
  invoiceNumber: string;
  period: string;
  occupiedUnits: number;
  rateKes: string;
  minimumKes: string;
  totalKes: string;
  amountPaidKes: string;
  balanceKes: string;
  dueDate: string;
  paybill: string | null;
  pdfBuffer?: Buffer;
}

export interface TenantUnitAssignedEmailPayload {
  firstName: string;
  lastName: string;
  organizationName: string;
  tenantCode: string;
  propertyName: string;
  propertyCode: string;
  unitNumber: string;
  rentKes: string;
  startDate: string;
  billingDay: number;
  depositHeldKes: string;
  occupiedUnitsSummary: string;
  paymentInstructions: string;
}

export interface TenantInvoiceEmailPayload {
  firstName: string;
  lastName: string;
  organizationName: string;
  tenantCode: string;
  invoiceNumber: string;
  invoiceKind: string;
  period: string;
  propertyName: string;
  unitNumber: string;
  issueDate: string;
  dueDate: string;
  linesSummary: string;
  totalKes: string;
  amountPaidKes: string;
  balanceKes: string;
  paymentInstructions: string;
  pdfBuffer?: Buffer;
}

export interface TenantPaymentReceiptEmailPayload {
  firstName: string;
  lastName: string;
  organizationName: string;
  tenantCode: string;
  receiptNumber: string;
  amountKes: string;
  receivedAt: string;
  paymentMethod: string;
  channelName: string;
  reference: string;
  paidBy: string;
  allocationsSummary: string;
  unallocatedCreditKes: string;
  accountStanding: string;
  pdfBuffer?: Buffer;
}

export interface TenantRentReminderEmailPayload {
  firstName: string;
  lastName: string;
  organizationName: string;
  tenantCode: string;
  reminderStatus: string;
  amountDueKes: string;
  openInvoicesSummary: string;
  paymentInstructions: string;
  pdfBuffer?: Buffer;
  pdfFilename?: string;
}

export function formatKesMinor(minor: bigint | number): string {
  const n = typeof minor === 'bigint' ? minor : BigInt(Math.trunc(minor));
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${cents}`;
}

export function parseFromAddress(raw: string | null | undefined): {
  email: string | null;
  name: string | null;
} {
  const trimmed = raw?.trim();
  if (!trimmed) return { email: null, name: null };
  const match = /^(?:"?([^"<]*)"?\s*)?<([^<>@\s]+@[^<>@\s]+)>$/.exec(trimmed);
  if (match) {
    return {
      name: match[1]?.trim() || null,
      email: match[2]!.trim(),
    };
  }
  return { name: null, email: trimmed };
}

export function isAllowedByAllowlist(
  email: string,
  allowlistRaw: string | null | undefined,
): boolean {
  const trimmed = allowlistRaw?.trim();
  if (!trimmed) return true;
  const entries = trimmed
    .split(/[\n,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (entries.length === 0) return true;
  const target = email.trim().toLowerCase();
  return entries.some((entry) => {
    if (entry.startsWith('@')) return target.endsWith(entry);
    if (!entry.includes('@')) return target.endsWith(`@${entry}`);
    return target === entry;
  });
}

/**
 * Account messages (codes, invitations). Phase 1 sends synchronously; moving to Cloud Tasks
 * later only changes this class. Wording stays short: SMS over 160 characters costs double.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly sms: SmsSender;
  private readonly email: EmailSender;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly cipher?: FieldCipher,
  ) {
    this.sms = createSmsSender(env);
    this.email = createEmailSender(env);
  }

  async sendCode(
    to: Recipient,
    purpose: 'login' | 'reset' | 'step-up' | 'admin-2fa',
    code: string,
    minutes: number,
  ): Promise<void> {
    const what = {
      login: 'sign-in code',
      reset: 'password reset code',
      'step-up': 'confirmation code',
      'admin-2fa': 'admin sign-in code',
    }[purpose];
    const kind = {
      login: 'login_otp',
      reset: 'password_reset',
      'step-up': 'step_up',
      'admin-2fa': 'admin_2fa',
    }[purpose];
    const smsText = `Your KodiHub ${what} is ${code}. It expires in ${minutes} minutes. Don't share it with anyone.`;
    const tasks: Promise<void>[] = [];
    if (to.phone) {
      tasks.push(this.dispatchSms(to.phone, smsText));
    }
    if (to.email) {
      const emailAddr = to.email;
      tasks.push(
        this.renderSystemEmailTemplate('verification_code', {
          codeType: what,
          code,
          minutes,
        }).then((rendered) =>
          this.dispatchEmail(
            { to: emailAddr, subject: rendered.subject, text: rendered.text },
            kind,
          ),
        ),
      );
    }
    const results = await Promise.allSettled(tasks);
    if (tasks.length && results.every((r) => r.status === 'rejected')) {
      throw (results[0] as PromiseRejectedResult).reason;
    }
  }

  async sendInvitation(
    to: Recipient,
    p: {
      firstName: string;
      organizationName: string;
      inviterName: string | null;
      token: string;
      ownerBilling?: OwnerWelcomeBilling;
    },
  ): Promise<void> {
    const link = `${this.env.APP_URL.replace(/\/$/, '')}/invite/${p.token}`;
    const by = p.inviterName ? `${p.inviterName} invited you` : 'You have been invited';
    const tasks: Promise<void>[] = [];
    if (to.email) {
      const signInId = [to.email, to.phone].filter(Boolean).join(' or ');
      const ob = p.ownerBilling;
      if (ob) {
        const trialSummary = ob.trialEndsAt
          ? `Free trial ends: ${ob.trialEndsAt}\n` +
            `Paid billing starts: ${ob.firstPaidDate} (first invoice issued on ${ob.firstInvoiceDate}, due within ${ob.dueDays} days)`
          : `First invoice issued on: ${ob.firstInvoiceDate} (due within ${ob.dueDays} days)`;
        const billingRefLine = ob.billingRef
          ? `Billing account reference: ${ob.billingRef}` +
            (ob.paybill ? ` (M-Pesa Paybill ${ob.paybill})` : '')
          : '';
        const rendered = await this.renderSystemEmailTemplate('owner_welcome', {
          firstName: p.firstName,
          organizationName: p.organizationName,
          inviterLine: by,
          inviteLink: link,
          signInIdentifier: signInId,
          planName: ob.planName ?? 'Custom',
          pricePerUnitKes: ob.pricePerUnitKes,
          minimumMonthlyKes: ob.minimumMonthlyKes,
          trialEndsAt: ob.trialEndsAt ?? 'No free trial',
          firstPaidDate: ob.firstPaidDate,
          firstInvoiceDate: ob.firstInvoiceDate,
          dueDays: ob.dueDays,
          trialSummary,
          billingRef: ob.billingRef ?? '',
          paybill: ob.paybill ?? '',
          billingRefLine,
        });
        tasks.push(
          this.dispatchEmail(
            {
              to: to.email,
              subject: rendered.subject,
              text: rendered.text,
            },
            'invitation',
          ),
        );
      } else {
        const rendered = await this.renderSystemEmailTemplate('staff_invitation', {
          firstName: p.firstName,
          organizationName: p.organizationName,
          inviterLine: by,
          inviteLink: link,
        });
        tasks.push(
          this.dispatchEmail(
            {
              to: to.email,
              subject: rendered.subject,
              text: rendered.text,
            },
            'invitation',
          ),
        );
      }
    }
    if (to.phone) {
      tasks.push(
        this.dispatchSms(to.phone, `${by} to ${p.organizationName} on KodiHub. Accept: ${link}`),
      );
    }
    // One channel failing shouldn't hide the other's success; report but don't throw if any worked.
    const results = await Promise.allSettled(tasks);
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) {
      this.logger.error(
        { errors: failed.map((f) => String((f as PromiseRejectedResult).reason)) },
        'Invitation delivery failed',
      );
      if (failed.length === results.length) throw new Error('Invitation could not be delivered');
    }
  }

  /** Monthly KodiHub platform invoice notification to the organisation owner. */
  async sendPlatformInvoiceIssued(to: Recipient, p: PlatformInvoiceEmailPayload): Promise<void> {
    if (!to.email) return;
    const appUrl = this.env.APP_URL.replace(/\/$/, '');
    const greeting = p.ownerFirstName ? `Hi ${p.ownerFirstName},` : `Hello ${p.organizationName},`;
    const payInstructions =
      p.paybill && p.billingRef
        ? `Pay via M-Pesa Paybill ${p.paybill}, Account ${p.billingRef}, or in KodiHub under Settings -> Plan & billing (${appUrl}/settings/billing).`
        : `Pay in KodiHub under Settings -> Plan & billing (${appUrl}/settings/billing).`;
    const rendered = await this.renderSystemEmailTemplate('platform_invoice', {
      greeting,
      organizationName: p.organizationName,
      invoiceNumber: p.invoiceNumber,
      period: p.period,
      occupiedUnits: p.occupiedUnits,
      rateKes: p.rateKes,
      minimumKes: p.minimumKes,
      totalKes: p.totalKes,
      amountPaidKes: p.amountPaidKes,
      balanceKes: p.balanceKes,
      dueDate: p.dueDate,
      billingRef: p.billingRef ?? '',
      paybill: p.paybill ?? '',
      paymentInstructions: payInstructions,
    });
    await this.dispatchEmail(
      {
        to: to.email,
        subject: rendered.subject,
        text: rendered.text,
        ...(p.pdfBuffer
          ? {
              attachments: [
                {
                  filename: `${p.invoiceNumber}.pdf`,
                  content: p.pdfBuffer,
                  contentType: 'application/pdf',
                },
              ],
            }
          : {}),
      },
      'platform_invoice',
    );
  }

  /**
   * Payment receipt SMS, e.g. "Received KES 25,000.00 ref RCT-2026-000012. Balance KES 1,200.00.
   * Thank you - Kilimani Agency". Kept to one 160-character SMS where the organisation name allows.
   */
  async sendPaymentReceipt(
    phone: string,
    p: { amount: string; number: string; balance: string; organizationName: string },
  ): Promise<void> {
    await this.dispatchSms(phone, paymentReceiptText(p));
  }

  /** A landlord was given owner-portal access. */
  async sendOwnerPortalAccess(to: Recipient, p: { organizationName: string }): Promise<void> {
    const link = `${this.env.APP_URL.replace(/\/$/, '')}/owner`;
    const rendered = await this.renderSystemEmailTemplate('owner_portal_access', {
      organizationName: p.organizationName,
      portalLink: link,
    });
    await this.deliver(to, rendered.subject, rendered.text, 'portal_access');
  }

  /** Payout details changed — always tell the landlord (a common fraud route). */
  async sendPayoutChanged(
    to: Recipient,
    p: { organizationName: string; masked: string | null },
  ): Promise<void> {
    const what = p.masked ? `to ${p.masked}` : 'were removed';
    const rendered = await this.renderSystemEmailTemplate('payout_changed', {
      organizationName: p.organizationName,
      changeDescription: what,
    });
    await this.deliver(to, rendered.subject, rendered.text, 'payout_changed');
  }

  /**
   * Sent ONLY when a brand-new tenant/user who did not previously exist on KodiHub is created.
   */
  async sendTenantWelcome(
    to: Recipient,
    p: {
      firstName: string;
      lastName: string;
      organizationName: string;
      tenantCode: string;
    },
  ): Promise<void> {
    if (!to.email) return;
    const baseUrl = this.env.APP_URL.replace(/\/$/, '');
    const portalLink = `${baseUrl}/tenant`;
    const setPasswordLink = `${baseUrl}/forgot-password?identifier=${encodeURIComponent(to.email)}`;
    const signInIdentifier = [to.email, to.phone].filter(Boolean).join(' or ');
    const rendered = await this.renderSystemEmailTemplate('tenant_welcome', {
      firstName: p.firstName,
      lastName: p.lastName,
      organizationName: p.organizationName,
      tenantCode: p.tenantCode,
      signInIdentifier,
      portalLink,
      setPasswordLink,
    });
    await this.dispatchEmail(
      { to: to.email, subject: rendered.subject, text: rendered.text },
      'tenant_welcome',
    );
  }

  /**
   * Sent when an already-existing user/tenant on KodiHub is added to a new organisation
   * without an immediate house/unit assignment.
   */
  async sendTenantAddedToOrg(
    to: Recipient,
    p: {
      firstName: string;
      lastName: string;
      organizationName: string;
      tenantCode: string;
    },
  ): Promise<void> {
    if (!to.email) return;
    const portalLink = `${this.env.APP_URL.replace(/\/$/, '')}/tenant`;
    const rendered = await this.renderSystemEmailTemplate('tenant_added_to_org', {
      firstName: p.firstName,
      lastName: p.lastName,
      organizationName: p.organizationName,
      tenantCode: p.tenantCode,
      portalLink,
    });
    await this.dispatchEmail(
      { to: to.email, subject: rendered.subject, text: rendered.text },
      'tenant_added_to_org',
    );
  }

  /**
   * Sent whenever a tenant is assigned to a house / unit (1st unit, additional units in the
   * same property, or units across different properties).
   */
  async sendTenantUnitAssigned(to: Recipient, p: TenantUnitAssignedEmailPayload): Promise<void> {
    if (!to.email) return;
    const portalLink = `${this.env.APP_URL.replace(/\/$/, '')}/tenant`;
    const rendered = await this.renderSystemEmailTemplate('tenant_unit_assigned', {
      ...p,
      portalLink,
    });
    await this.dispatchEmail(
      { to: to.email, subject: rendered.subject, text: rendered.text },
      'tenant_unit_assigned',
    );
  }

  /**
   * Sent whenever a Move-In, Monthly, or Ad-hoc invoice is issued for a tenant.
   */
  async sendTenantInvoiceIssued(to: Recipient, p: TenantInvoiceEmailPayload): Promise<void> {
    if (!to.email) return;
    const portalLink = `${this.env.APP_URL.replace(/\/$/, '')}/tenant`;
    const { pdfBuffer, ...vars } = p;
    const rendered = await this.renderSystemEmailTemplate('tenant_invoice', {
      ...vars,
      portalLink,
    });
    await this.dispatchEmail(
      {
        to: to.email,
        subject: rendered.subject,
        text: rendered.text,
        ...(pdfBuffer
          ? {
              attachments: [
                {
                  filename: `${p.invoiceNumber}.pdf`,
                  content: pdfBuffer,
                  contentType: 'application/pdf',
                },
              ],
            }
          : {}),
      },
      'tenant_invoice',
    );
  }

  /**
   * Detailed payment receipt email with the official branded Receipt PDF (`<receiptNumber>.pdf`)
   * attached, sent whenever a payment receipt is issued for a tenant who has an email address.
   */
  async sendTenantPaymentReceiptEmail(
    to: Recipient,
    p: TenantPaymentReceiptEmailPayload,
  ): Promise<void> {
    if (!to.email) return;
    const portalLink = `${this.env.APP_URL.replace(/\/$/, '')}/tenant`;
    const { pdfBuffer, ...vars } = p;
    const rendered = await this.renderSystemEmailTemplate('tenant_payment_receipt', {
      ...vars,
      portalLink,
    });
    await this.dispatchEmail(
      {
        to: to.email,
        subject: rendered.subject,
        text: rendered.text,
        ...(pdfBuffer
          ? {
              attachments: [
                {
                  filename: `${p.receiptNumber}.pdf`,
                  content: pdfBuffer,
                  contentType: 'application/pdf',
                },
              ],
            }
          : {}),
      },
      'tenant_payment_receipt',
    );
  }

  /**
   * Detailed rent reminder email with open-invoice breakdown and statement/invoice PDF attached,
   * sent alongside SMS rent reminders (manual, due soon, or overdue).
   */
  async sendTenantRentReminder(to: Recipient, p: TenantRentReminderEmailPayload): Promise<void> {
    if (!to.email) return;
    const portalLink = `${this.env.APP_URL.replace(/\/$/, '')}/tenant`;
    const { pdfBuffer, pdfFilename, ...vars } = p;
    const rendered = await this.renderSystemEmailTemplate('tenant_rent_reminder', {
      ...vars,
      portalLink,
    });
    await this.dispatchEmail(
      {
        to: to.email,
        subject: rendered.subject,
        text: rendered.text,
        ...(pdfBuffer
          ? {
              attachments: [
                {
                  filename: pdfFilename ?? `Statement-${p.tenantCode}.pdf`,
                  content: pdfBuffer,
                  contentType: 'application/pdf',
                },
              ],
            }
          : {}),
      },
      'tenant_rent_reminder',
    );
  }

  /** A plain SMS (callers log it). Throws if the provider refuses. */
  async sendSms(phone: string, text: string): Promise<void> {
    await this.dispatchSms(phone, text);
  }

  /** Sends a direct platform email (e.g. SMTP test or broadcast) and records it in PlatformEmailLog. */
  async sendRawEmail(m: EmailMessage & { kind?: string }): Promise<void> {
    await this.dispatchEmail(
      { to: m.to, subject: m.subject, text: m.text, html: m.html },
      m.kind ?? 'other',
    );
  }

  private async renderSystemEmailTemplate(
    key: EmailTemplateKey,
    vars: Record<string, string | number | null | undefined>,
  ): Promise<{ subject: string; text: string }> {
    const settings = this.prisma
      ? await this.prisma.platformSettings.findUnique({ where: { id: 1 } })
      : null;
    const tpl = resolveEmailTemplate(key, settings?.emailTemplates);
    return {
      subject: interpolateTemplate(tpl.subject, vars).trim(),
      text: interpolateTemplate(tpl.body, vars).trimEnd(),
    };
  }

  /** SMS and email where available; succeeds if at least one went out. */
  private async deliver(
    to: Recipient,
    subject: string,
    text: string,
    kind = 'other',
  ): Promise<void> {
    const tasks: Promise<void>[] = [];
    if (to.phone) tasks.push(this.dispatchSms(to.phone, text));
    if (to.email) tasks.push(this.dispatchEmail({ to: to.email, subject, text }, kind));
    const results = await Promise.allSettled(tasks);
    if (tasks.length && results.every((r) => r.status === 'rejected'))
      throw new Error('Message could not be delivered');
  }

  private async dispatchSms(phone: string, text: string): Promise<void> {
    if (this.env.NODE_ENV !== 'test' && this.prisma && this.cipher) {
      const settings = await this.prisma.platformSettings.findUnique({ where: { id: 1 } });
      if (settings?.atUsername && settings.atApiKeyEnc) {
        const apiKey = this.cipher.decrypt(settings.atApiKeyEnc, AT_API_KEY_CONTEXT);
        const sender = new AfricasTalkingSmsSender(
          settings.atUsername,
          apiKey,
          settings.atSenderId ?? undefined,
        );
        await sender.send(phone, text);
        return;
      }
    }
    await this.sms.send(phone, text);
  }

  private async dispatchEmail(m: EmailMessage, kind: string): Promise<void> {
    const triggeredById = currentContext()?.userId ?? null;
    const settings = this.prisma
      ? await this.prisma.platformSettings.findUnique({ where: { id: 1 } })
      : null;

    if (settings?.smtpAllowlist && !isAllowedByAllowlist(m.to, settings.smtpAllowlist)) {
      const error = 'Recipient is not on the SMTP allowlist';
      await this.recordEmailLog({
        to: m.to,
        subject: m.subject,
        kind,
        status: 'FAILED',
        error,
        triggeredById,
      });
      throw new Error(error);
    }

    try {
      if (this.env.NODE_ENV !== 'test' && settings?.smtpHost) {
        const pass =
          settings.smtpPassEnc && this.cipher
            ? this.cipher.decrypt(settings.smtpPassEnc, SMTP_PASS_CONTEXT)
            : undefined;
        const port = settings.smtpPort ?? 587;
        const enc = (settings.smtpEncryption ?? 'tls').toLowerCase();
        const transport = nodemailer.createTransport({
          host: settings.smtpHost,
          port,
          secure: enc === 'ssl' || port === 465,
          ignoreTLS: enc === 'none',
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 15_000,
          ...(settings.smtpUser && pass ? { auth: { user: settings.smtpUser, pass } } : {}),
        });
        const parsedFrom = parseFromAddress(settings.smtpFromEmail || this.env.EMAIL_FROM);
        const fromAddr = parsedFrom.email || this.env.EMAIL_FROM;
        const fromName = settings.smtpFromName || parsedFrom.name;
        const from = fromName ? `"${fromName}" <${fromAddr}>` : fromAddr;
        const html =
          m.html ??
          renderBrandedEmailHtml({
            subject: m.subject,
            text: m.text,
            brandName: fromName || 'KodiHub',
          });
        await transport.sendMail({
          from,
          to: m.to,
          subject: m.subject,
          text: m.text,
          html,
          ...(m.attachments?.length ? { attachments: m.attachments } : {}),
        });
      } else {
        await this.email.send(m);
      }

      await this.recordEmailLog({
        to: m.to,
        subject: m.subject,
        kind,
        status: 'SENT',
        error: null,
        triggeredById,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await this.recordEmailLog({
        to: m.to,
        subject: m.subject,
        kind,
        status: 'FAILED',
        error,
        triggeredById,
      });
      throw e;
    }
  }

  private async recordEmailLog(entry: {
    to: string;
    subject: string;
    kind: string;
    status: 'SENT' | 'FAILED';
    error: string | null;
    triggeredById: string | null;
  }): Promise<void> {
    if (!this.prisma) return;
    try {
      await this.prisma.platformEmailLog.create({ data: entry });
    } catch (err) {
      this.logger.warn({ err }, 'Could not write PlatformEmailLog');
    }
  }
}

export function paymentReceiptText(p: {
  amount: string;
  number: string;
  balance: string;
  organizationName: string;
}): string {
  return `Received KES ${p.amount} ref ${p.number}. ${p.balance}. Thank you - ${p.organizationName}`.slice(
    0,
    160,
  );
}
