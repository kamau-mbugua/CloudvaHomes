import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { currentContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { FieldCipher } from '../../common/crypto/field-cipher.js';
import { smsKes } from '../../common/money/money.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type EmailTemplateKey,
  interpolateTemplate,
  renderBrandedEmailHtml,
  resolveEmailTemplate,
} from './email-templates.js';
import type { GuestEmailTemplateKey } from './guest-email-templates.js';
import {
  createEmailSender,
  createPushSender,
  createSmsSender,
  type EmailAttachment,
  type EmailMessage,
  type EmailSender,
  type PushSender,
  type SmsSender,
} from './senders.js';
import { ShortLinksService } from './short-links.service.js';
import { AT_KEY_CONTEXT, SmsService } from './sms/sms.service.js';
import { smsWarningCopy } from './sms/sms-copy.js';
import {
  type OrgSmsSpec,
  SmsNotSentError,
  type SmsSecret,
  type SmsSpec,
  type SmsWarning,
} from './sms/sms-types.js';

export const SMTP_PASS_CONTEXT = 'platform.smtp.password';
export const AT_API_KEY_CONTEXT = AT_KEY_CONTEXT;

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

/** A secret inside an email (code, invitation link, temporary password) and what to call it. */
export interface EmailSecret {
  value: string;
  label: string;
}

/** What a secret looks like in a logged email body. */
export const HIDDEN_SECRET = '••••••';
export const EMAIL_LOG_BODY_CONTEXT = 'platform-email-log:body';
export const EMAIL_LOG_SECRET_CONTEXT = 'platform-email-log:secret';

/**
 * Account messages (codes, invitations). Phase 1 sends synchronously; moving to Cloud Tasks
 * later only changes this class. Wording stays short: SMS over 160 characters costs double.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly sms: SmsSender;
  private readonly email: EmailSender;
  private readonly push: PushSender;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly cipher?: FieldCipher,
    @Optional() private readonly smsRouter?: SmsService,
    @Optional() private readonly shortLinks?: ShortLinksService,
  ) {
    this.sms = createSmsSender(env);
    this.email = createEmailSender(env);
    this.push = createPushSender(env);
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
    const smsType = (
      {
        login: 'login_otp',
        reset: 'password_reset',
        'step-up': 'step_up',
        'admin-2fa': 'admin_2fa',
      } as const
    )[purpose];
    const smsText = `Your KodiHub ${what} is ${code}. It expires in ${minutes} minutes. Don't share it with anyone.`;
    const tasks: Promise<void>[] = [];
    if (to.phone) {
      tasks.push(
        this.dispatchSms({ kind: 'platform', type: smsType }, to.phone, smsText, {
          value: code,
          label: 'Code',
        }),
      );
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
            { value: code, label: 'Code' },
          ),
        ),
      );
    }
    const results = await Promise.allSettled(tasks);
    if (tasks.length && results.every((r) => r.status === 'rejected')) {
      throw (results[0] as PromiseRejectedResult).reason;
    }
  }

  /** A guest's booking code on a host's booking site: the host's message (spec §2). */
  async sendBookingCode(
    orgId: string,
    phone: string,
    code: string,
    minutes: number,
    bizName: string,
  ): Promise<void> {
    try {
      await this.dispatchSms(
        { kind: 'org', orgId, type: 'booking_otp' },
        phone,
        `Your ${bizName} booking code is ${code}. It expires in ${minutes} minutes.`,
        { value: code, label: 'Code' },
      );
    } catch (e) {
      // A guest sees a plain message, not a server error (e.g. the host's own SMS account is failing).
      this.logger.warn({ err: e, orgId }, 'Guest booking code not sent');
      throw new AppError(
        502,
        'DELIVERY_FAILED',
        "We couldn't send the code. Please try again shortly, or contact the host.",
      );
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
            { value: link, label: 'Invitation link' },
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
            { value: link, label: 'Invitation link' },
          ),
        );
      }
    }
    if (to.phone) {
      // A short link keeps the SMS to one unit; it lasts as long as the invitation (7 days).
      const smsLink = this.shortLinks
        ? await this.shortLinks.shortenOrKeep(link, { kind: 'invitation', days: 8 })
        : link;
      tasks.push(
        this.dispatchSms(
          { kind: 'platform', type: 'invitation' },
          to.phone,
          `${by} to ${p.organizationName} on KodiHub. Accept: ${smsLink}`,
          { value: smsLink, label: 'Invitation link' },
        ),
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
   * Payment receipt SMS, e.g. "Received KES 25,000 ref RCT-2026-000012. Balance KES 1,200.
   * Thank you - Kilimani Agency". Kept to one 160-character SMS where the organisation name allows.
   */
  async sendPaymentReceipt(
    orgId: string,
    phone: string,
    p: { amount: bigint; number: string; owed: bigint; organizationName: string },
  ): Promise<void> {
    await this.dispatchSms(
      { kind: 'org', orgId, type: 'payment_receipt' },
      phone,
      paymentReceiptText(p),
    );
  }

  /** A landlord was given owner-portal access. */
  async sendOwnerPortalAccess(to: Recipient, p: { organizationName: string }): Promise<void> {
    const link = `${this.env.APP_URL.replace(/\/$/, '')}/owner`;
    const rendered = await this.renderSystemEmailTemplate('owner_portal_access', {
      organizationName: p.organizationName,
      portalLink: link,
    });
    await this.deliver(to, rendered.subject, rendered.text, 'portal_access', {
      kind: 'platform',
      type: 'owner_portal_access',
    });
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
    await this.deliver(to, rendered.subject, rendered.text, 'payout_changed', {
      kind: 'platform',
      type: 'payout_changed',
    });
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

  /**
   * An email to a short-stay guest from one of the guest templates, in the host's name (replies
   * go to the host). Throws when it could not be sent; it is logged either way.
   */
  async sendGuestEmail(p: {
    to: string;
    template: GuestEmailTemplateKey;
    vars: Record<string, string>;
    hostName: string;
    hostEmail: string | null;
    attachments?: EmailAttachment[];
  }): Promise<void> {
    const rendered = await this.renderSystemEmailTemplate(p.template, p.vars);
    await this.dispatchEmail(
      {
        to: p.to,
        subject: rendered.subject,
        // Lines left empty by missing details collapse, so the email never shows gaps.
        text: rendered.text.replace(/\n{3,}/g, '\n\n'),
        fromName: `${p.hostName} via KodiHub`,
        ...(p.hostEmail ? { replyTo: p.hostEmail } : {}),
        ...(p.attachments?.length ? { attachments: p.attachments } : {}),
      },
      p.template,
    );
  }

  /** An organisation's SMS to its tenant/guest (callers log it). Throws SmsNotSentError unless sent. */
  async sendSms(spec: OrgSmsSpec, phone: string, text: string): Promise<void> {
    await this.dispatchSms(spec, phone, text);
  }

  /** Sends a direct platform email (e.g. SMTP test or broadcast) and records it in PlatformEmailLog. */
  async sendRawEmail(m: EmailMessage & { kind?: string }): Promise<void> {
    await this.dispatchEmail(
      { to: m.to, subject: m.subject, text: m.text, html: m.html },
      m.kind ?? 'other',
    );
  }

  /**
   * Sends login credentials and a sign-in link to a newly added or password-reset platform
   * operator (Superadmin or Salesperson). Never throws if delivery fails — returns whether
   * at least one channel succeeded.
   */
  async sendOperatorWelcome(
    to: Recipient,
    p: {
      firstName: string;
      role: 'SUPERADMIN' | 'SALESPERSON';
      temporaryPassword: string | null;
    },
  ): Promise<boolean> {
    const loginUrl = `${this.env.APP_URL.replace(/\/$/, '')}/login`;
    const roleLabel = p.role === 'SUPERADMIN' ? 'Superadmin' : 'Salesperson';
    const signInId = [to.email, to.phone].filter(Boolean).join(' or ');
    const subject = `Your KodiHub ${roleLabel} account`;
    const emailBody = p.temporaryPassword
      ? `Hi ${p.firstName},\n\n` +
        `You have been added to KodiHub as a ${roleLabel}.\n\n` +
        `--- Sign-in Details ---\n` +
        `Sign in at: ${loginUrl}\n` +
        `Email / Phone: ${signInId}\n` +
        `Temporary password: ${p.temporaryPassword}\n\n` +
        `For your security, you will be prompted to change this temporary password as soon as you sign in.`
      : `Hi ${p.firstName},\n\n` +
        `Your KodiHub account (${signInId}) has been granted ${roleLabel} access.\n\n` +
        `Sign in with your existing password at: ${loginUrl}`;
    const smsText = p.temporaryPassword
      ? `KodiHub ${roleLabel}: sign in at ${loginUrl} with ${to.email ?? to.phone} and temp password ${p.temporaryPassword} (change on first login).`
      : `Your KodiHub account now has ${roleLabel} access. Sign in at ${loginUrl}`;

    const tasks: Promise<void>[] = [];
    if (to.email) {
      tasks.push(
        this.dispatchEmail(
          { to: to.email, subject, text: emailBody },
          'invitation',
          p.temporaryPassword
            ? { value: p.temporaryPassword, label: 'Temporary password' }
            : undefined,
        ),
      );
    }
    if (to.phone) {
      tasks.push(
        this.dispatchSms(
          { kind: 'platform', type: 'operator_welcome' },
          to.phone,
          smsText.slice(0, 160),
          p.temporaryPassword
            ? { value: p.temporaryPassword, label: 'Temporary password' }
            : undefined,
        ),
      );
    }
    if (!tasks.length) return false;
    const results = await Promise.allSettled(tasks);
    return results.some((r) => r.status === 'fulfilled');
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
    kind: string,
    smsSpec: SmsSpec,
  ): Promise<void> {
    const tasks: Promise<void>[] = [];
    if (to.phone) tasks.push(this.dispatchSms(smsSpec, to.phone, text));
    if (to.email) tasks.push(this.dispatchEmail({ to: to.email, subject, text }, kind));
    const results = await Promise.allSettled(tasks);
    if (tasks.length && results.every((r) => r.status === 'rejected'))
      throw new Error('Message could not be delivered');
  }

  /** Every SMS goes through SmsService, which picks the route (spec §2–3). */
  private async dispatchSms(
    spec: SmsSpec,
    phone: string,
    text: string,
    secret?: SmsSecret,
  ): Promise<void> {
    if (!this.smsRouter) {
      await this.sms.send(phone, text); // constructed outside Nest (unit tests)
      return;
    }
    const outcome = await this.smsRouter.send(spec, phone, text, secret);
    if (outcome.warn && spec.kind === 'org') {
      await this.warnOwners(spec.orgId, outcome.warn, outcome);
    }
    if (outcome.status !== 'SENT') throw new SmsNotSentError(outcome);
  }

  /** Warns owners about SMS units or a failing SMS account (spec §6). */
  private async warnOwners(
    orgId: string,
    warn: SmsWarning,
    detail: { balance: number | null; reason: string | null },
  ): Promise<void> {
    const copy = smsWarningCopy(warn, detail);
    await this.notifyOwners(orgId, copy, async (orgName) => {
      const rendered = await this.renderSystemEmailTemplate(copy.kind as EmailTemplateKey, {
        organizationName: orgName,
        balance: String(detail.balance ?? 0),
        reason: detail.reason ?? '',
      });
      return { subject: rendered.subject, text: rendered.text };
    });
  }

  /**
   * In-app notice (+ optional email) to each active owner of an organisation. Best effort: it
   * never throws, so a notice can't fail the work that triggered it.
   */
  async notifyOwners(
    orgId: string,
    copy: { kind: string; title: string; body: string },
    email?:
      | { subject: string; text: string }
      | ((organizationName: string) => Promise<{ subject: string; text: string }>),
  ): Promise<void> {
    if (!this.prisma) return;
    try {
      const owners = await this.prisma.membership.findMany({
        where: { orgId, status: 'ACTIVE', role: { systemKey: 'OWNER' } },
        select: {
          userId: true,
          user: { select: { email: true } },
          organization: { select: { name: true } },
        },
      });
      for (const o of owners) {
        await this.notifyUser({ userId: o.userId, orgId, ...copy, actionUrl: '/app/settings/sms' });
        if (o.user.email && email) {
          const m = typeof email === 'function' ? await email(o.organization.name) : email;
          await this.dispatchEmail({ to: o.user.email, ...m }, copy.kind).catch((err: unknown) =>
            this.logger.warn({ err, orgId }, 'Owner email failed'),
          );
        }
      }
    } catch (err) {
      this.logger.warn({ err, orgId, kind: copy.kind }, 'Could not notify owners');
    }
  }

  /**
   * `secret` is a code, invitation link or temporary password inside the text. The log keeps the
   * text with it blanked out and the secret encrypted apart, for a superadmin to reveal with a reason.
   */
  private async dispatchEmail(m: EmailMessage, kind: string, secret?: EmailSecret): Promise<void> {
    const triggeredById = currentContext()?.userId ?? null;
    const stored = this.storedEmailBody(m.text, secret);
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
        ...stored,
      });
      throw new Error(error);
    }

    try {
      if (this.env.NODE_ENV !== 'test' && settings?.smtpHost) {
        if (isForbiddenSmtpHost(settings.smtpHost)) {
          throw new Error('SMTP host points to a forbidden private or loopback address');
        }
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
        const fromName = m.fromName || settings.smtpFromName || parsedFrom.name;
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
          ...(m.replyTo ? { replyTo: m.replyTo } : {}),
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
        ...stored,
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
        ...stored,
      });
      throw e;
    }
  }

  /** The body to keep in the email log: encrypted, with the secret blanked out and kept apart. */
  private storedEmailBody(
    text: string,
    secret?: EmailSecret,
  ): {
    bodyEnc?: Uint8Array<ArrayBuffer>;
    secretEnc?: Uint8Array<ArrayBuffer>;
    secretLabel?: string;
  } {
    if (!this.cipher) return {};
    try {
      const value = secret?.value;
      const hidden = value ? text.split(value).join(HIDDEN_SECRET) : text;
      return {
        bodyEnc: this.cipher.encrypt(hidden, EMAIL_LOG_BODY_CONTEXT),
        ...(value
          ? {
              secretEnc: this.cipher.encrypt(value, EMAIL_LOG_SECRET_CONTEXT),
              secretLabel: secret.label,
            }
          : {}),
      };
    } catch (err) {
      this.logger.warn({ err }, 'Could not encrypt the email body for the log');
      return {};
    }
  }

  private async recordEmailLog(entry: {
    to: string;
    subject: string;
    kind: string;
    status: 'SENT' | 'FAILED';
    error: string | null;
    triggeredById: string | null;
    bodyEnc?: Uint8Array<ArrayBuffer>;
    secretEnc?: Uint8Array<ArrayBuffer>;
    secretLabel?: string;
  }): Promise<void> {
    if (!this.prisma) return;
    try {
      await this.prisma.platformEmailLog.create({ data: entry });
    } catch (err) {
      this.logger.warn({ err }, 'Could not write PlatformEmailLog');
    }
  }

  // ── In-App Notifications & Push Devices ──

  async notifyUser(entry: {
    userId: string;
    orgId?: string | null;
    tenantId?: string | null;
    kind: string;
    title: string;
    body: string;
    actionUrl?: string | null;
  }): Promise<void> {
    if (!this.prisma) return;
    try {
      const created = await this.prisma.userNotification.create({
        data: {
          userId: entry.userId,
          orgId: entry.orgId ?? null,
          tenantId: entry.tenantId ?? null,
          kind: entry.kind,
          title: entry.title,
          body: entry.body,
          actionUrl: entry.actionUrl ?? null,
        },
      });
      await this.dispatchPushToUsers([entry.userId], {
        title: entry.title,
        body: entry.body,
        data: {
          notificationId: created.id,
          kind: entry.kind,
          ...(entry.actionUrl ? { actionUrl: entry.actionUrl } : {}),
          ...(entry.orgId ? { orgId: entry.orgId } : {}),
          ...(entry.tenantId ? { tenantId: entry.tenantId } : {}),
        },
      });
    } catch (err) {
      this.logger.warn({ err }, 'Could not create UserNotification');
    }
  }

  async notifyOrgStaff(
    orgId: string,
    entry: {
      kind: string;
      title: string;
      body: string;
      actionUrl?: string | null;
      excludeUserId?: string | null;
    },
  ): Promise<void> {
    if (!this.prisma) return;
    try {
      const memberships = await this.prisma.membership.findMany({
        where: {
          orgId,
          status: 'ACTIVE',
          ...(entry.excludeUserId ? { userId: { not: entry.excludeUserId } } : {}),
        },
        select: { userId: true },
      });
      if (!memberships.length) return;
      const userIds = [...new Set(memberships.map((m) => m.userId))];
      await this.prisma.userNotification.createMany({
        data: userIds.map((userId) => ({
          userId,
          orgId,
          kind: entry.kind,
          title: entry.title,
          body: entry.body,
          actionUrl: entry.actionUrl ?? null,
        })),
      });
      await this.dispatchPushToUsers(userIds, {
        title: entry.title,
        body: entry.body,
        data: {
          kind: entry.kind,
          orgId,
          ...(entry.actionUrl ? { actionUrl: entry.actionUrl } : {}),
        },
      });
    } catch (err) {
      this.logger.warn({ err }, 'Could not create staff UserNotifications');
    }
  }

  private async dispatchPushToUsers(
    userIds: string[],
    payload: { title: string; body: string; data?: Record<string, string> },
  ): Promise<{ targeted: number; sent: number }> {
    if (!this.prisma || !userIds.length) return { targeted: 0, sent: 0 };
    try {
      const devices = await this.prisma.deviceToken.findMany({
        where: { userId: { in: userIds } },
        select: { token: true },
      });
      if (!devices.length) return { targeted: 0, sent: 0 };
      const staleTokens: string[] = [];
      let sent = 0;
      await Promise.allSettled(
        devices.map(async (d) => {
          const res = await this.push.send({
            token: d.token,
            title: payload.title,
            body: payload.body,
            data: payload.data,
          });
          if (res.sent) sent += 1;
          if (res.unregistered) staleTokens.push(d.token);
        }),
      );
      if (staleTokens.length > 0) {
        await this.prisma.deviceToken.deleteMany({
          where: { token: { in: staleTokens } },
        });
      }
      return { targeted: devices.length, sent };
    } catch (err) {
      this.logger.warn({ err }, 'Push notification dispatch failed');
      return { targeted: 0, sent: 0 };
    }
  }

  async listForUser(userId: string, q: { page: number; pageSize: number; unreadOnly?: boolean }) {
    if (!this.prisma) {
      return {
        data: [],
        meta: { page: q.page, pageSize: q.pageSize, total: 0, totalPages: 1, unreadCount: 0 },
      };
    }
    const where = {
      userId,
      ...(q.unreadOnly ? { readAt: null } : {}),
    };
    const skip = (q.page - 1) * q.pageSize;
    const [rows, total, unreadCount] = await Promise.all([
      this.prisma.userNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: q.pageSize,
      }),
      this.prisma.userNotification.count({ where }),
      this.prisma.userNotification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      data: rows,
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
        unreadCount,
      },
    };
  }

  async markRead(userId: string, id: string) {
    if (!this.prisma) return { updated: 0 };
    const res = await this.prisma.userNotification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: res.count };
  }

  async markAllRead(userId: string) {
    if (!this.prisma) return { updated: 0 };
    const res = await this.prisma.userNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: res.count };
  }

  async deleteNotification(userId: string, id: string) {
    if (!this.prisma) return { removed: 0 };
    const res = await this.prisma.userNotification.deleteMany({
      where: { id, userId },
    });
    return { removed: res.count };
  }

  async listDevices(userId: string) {
    if (!this.prisma) return [];
    return this.prisma.deviceToken.findMany({
      where: { userId },
      select: { id: true, platform: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async sendTestNotification(userId: string) {
    if (!this.prisma) return { sent: false, devicesTargeted: 0 };
    const title = 'KodiHub notification check';
    const body = 'Your in-app and push notifications are active and working.';
    const created = await this.prisma.userNotification.create({
      data: {
        userId,
        orgId: currentContext()?.orgId ?? null,
        kind: 'TEST_NOTIFICATION',
        title,
        body,
        actionUrl: null,
      },
    });
    const pushRes = await this.dispatchPushToUsers([userId], {
      title,
      body,
      data: { notificationId: created.id, kind: 'TEST_NOTIFICATION' },
    });
    return {
      sent: true,
      notificationId: created.id,
      devicesTargeted: pushRes.targeted,
      devicesSent: pushRes.sent,
    };
  }

  async registerDevice(userId: string, dto: { token: string; platform: string }) {
    if (!this.prisma) return { registered: false };
    const token = dto.token.trim();
    const platform = dto.platform.trim().toUpperCase();
    await this.prisma.deviceToken.upsert({
      where: { token },
      update: { userId, platform },
      create: { userId, token, platform },
    });
    return { registered: true };
  }

  async unregisterDevice(userId: string, token: string) {
    if (!this.prisma) return { removed: 0 };
    const res = await this.prisma.deviceToken.deleteMany({
      where: { userId, token: token.trim() },
    });
    return { removed: res.count };
  }
}

export function isForbiddenSmtpHost(rawHost: string): boolean {
  const host = rawHost
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (!host || /[\s/:@?#]/.test(host)) return true;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata' ||
    host === 'metadata.google.internal' ||
    host === '::1' ||
    host === '::' ||
    host === '0:0:0:0:0:0:0:1' ||
    host.startsWith('fe80:') ||
    host.startsWith('fc') ||
    host.startsWith('fd')
  ) {
    return true;
  }
  const v4Mapped = host.startsWith('::ffff:') ? host.slice(7) : host;
  if (/^\d+$/.test(v4Mapped) || /^0x[0-9a-f]+$/i.test(v4Mapped)) {
    return true;
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v4Mapped);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((n) => n < 0 || n > 255)) return true;
    const [a, b] = parts as [number, number, number, number];
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    ) {
      return true;
    }
  }
  return false;
}

export function paymentReceiptText(p: {
  amount: bigint;
  number: string;
  /** What the tenant owes after this payment; negative is credit. */
  owed: bigint;
  organizationName: string;
}): string {
  const standing =
    p.owed > 0n
      ? `Balance ${smsKes(p.owed)}`
      : p.owed < 0n
        ? `Credit ${smsKes(-p.owed)}`
        : 'Nothing owing';
  return `Received ${smsKes(p.amount)} ref ${p.number}. ${standing}. Thank you - ${p.organizationName}`.slice(
    0,
    160,
  );
}
