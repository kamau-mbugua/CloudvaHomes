import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { currentContext } from '../../common/context/request-context.js';
import { FieldCipher } from '../../common/crypto/field-cipher.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
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

export function isAllowedByAllowlist(email: string, allowlistRaw: string | null | undefined): boolean {
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
    const text = `Your Hodi ${what} is ${code}. It expires in ${minutes} minutes. Don't share it with anyone.`;
    if (to.phone) await this.dispatchSms(to.phone, text);
    else if (to.email) await this.dispatchEmail({ to: to.email, subject: `Your Hodi ${what}`, text }, kind);
  }

  async sendInvitation(
    to: Recipient,
    p: { firstName: string; organizationName: string; inviterName: string | null; token: string },
  ): Promise<void> {
    const link = `${this.env.APP_URL.replace(/\/$/, '')}/invite/${p.token}`;
    const by = p.inviterName ? `${p.inviterName} invited you` : 'You have been invited';
    const tasks: Promise<void>[] = [];
    if (to.email) {
      tasks.push(
        this.dispatchEmail(
          {
            to: to.email,
            subject: `Join ${p.organizationName} on Hodi`,
            text:
              `Hi ${p.firstName},\n\n${by} to join ${p.organizationName} on Hodi.\n\n` +
              `Accept the invitation: ${link}\n\nThe link expires in 7 days.`,
          },
          'invitation',
        ),
      );
    }
    if (to.phone) {
      tasks.push(
        this.dispatchSms(to.phone, `${by} to ${p.organizationName} on Hodi. Accept: ${link}`),
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
    const text = `${p.organizationName} has given you access to your property statements on Hodi: ${link} - sign in with a code sent to this phone or email.`;
    await this.deliver(to, `Your statements from ${p.organizationName}`, text, 'portal_access');
  }

  /** Payout details changed — always tell the landlord (a common fraud route). */
  async sendPayoutChanged(
    to: Recipient,
    p: { organizationName: string; masked: string | null },
  ): Promise<void> {
    const what = p.masked ? `to ${p.masked}` : 'were removed';
    const text = `${p.organizationName}: the account your rent payouts go to was changed ${what}. If you did not ask for this, contact them now.`;
    await this.deliver(to, 'Your payout details were changed', text, 'payout_changed');
  }

  /** A plain SMS (callers log it). Throws if the provider refuses. */
  async sendSms(phone: string, text: string): Promise<void> {
    await this.dispatchSms(phone, text);
  }

  /** Sends a direct platform email (e.g. SMTP test or broadcast) and records it in PlatformEmailLog. */
  async sendRawEmail(m: EmailMessage & { kind?: string }): Promise<void> {
    await this.dispatchEmail({ to: m.to, subject: m.subject, text: m.text }, m.kind ?? 'other');
  }

  /** SMS and email where available; succeeds if at least one went out. */
  private async deliver(to: Recipient, subject: string, text: string, kind = 'other'): Promise<void> {
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
          ...(settings.smtpUser && pass
            ? { auth: { user: settings.smtpUser, pass } }
            : {}),
        });
        const fromAddr = settings.smtpFromEmail || this.env.EMAIL_FROM;
        const from = settings.smtpFromName ? `"${settings.smtpFromName}" <${fromAddr}>` : fromAddr;
        await transport.sendMail({ from, to: m.to, subject: m.subject, text: m.text });
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
