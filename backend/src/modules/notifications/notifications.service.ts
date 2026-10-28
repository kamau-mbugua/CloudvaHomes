import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { createEmailSender, createSmsSender, type EmailSender, type SmsSender } from './senders.js';

export interface Recipient {
  email?: string | null;
  phone?: string | null;
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

  constructor(@Inject(ENV) private readonly env: Env) {
    this.sms = createSmsSender(env);
    this.email = createEmailSender(env);
  }

  async sendCode(
    to: Recipient,
    purpose: 'login' | 'reset' | 'step-up',
    code: string,
    minutes: number,
  ): Promise<void> {
    const what = {
      login: 'sign-in code',
      reset: 'password reset code',
      'step-up': 'confirmation code',
    }[purpose];
    const text = `Your Hodi ${what} is ${code}. It expires in ${minutes} minutes. Don't share it with anyone.`;
    if (to.phone) await this.sms.send(to.phone, text);
    else if (to.email) await this.email.send({ to: to.email, subject: `Your Hodi ${what}`, text });
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
        this.email.send({
          to: to.email,
          subject: `Join ${p.organizationName} on Hodi`,
          text:
            `Hi ${p.firstName},\n\n${by} to join ${p.organizationName} on Hodi.\n\n` +
            `Accept the invitation: ${link}\n\nThe link expires in 7 days.`,
        }),
      );
    }
    if (to.phone) {
      tasks.push(
        this.sms.send(to.phone, `${by} to ${p.organizationName} on Hodi. Accept: ${link}`),
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
    await this.sms.send(phone, paymentReceiptText(p));
  }

  /** A landlord was given owner-portal access. */
  async sendOwnerPortalAccess(to: Recipient, p: { organizationName: string }): Promise<void> {
    const link = `${this.env.APP_URL.replace(/\/$/, '')}/owner`;
    const text = `${p.organizationName} has given you access to your property statements on Hodi: ${link} - sign in with a code sent to this phone or email.`;
    await this.deliver(to, `Your statements from ${p.organizationName}`, text);
  }

  /** Payout details changed — always tell the landlord (a common fraud route). */
  async sendPayoutChanged(
    to: Recipient,
    p: { organizationName: string; masked: string | null },
  ): Promise<void> {
    const what = p.masked ? `to ${p.masked}` : 'were removed';
    const text = `${p.organizationName}: the account your rent payouts go to was changed ${what}. If you did not ask for this, contact them now.`;
    await this.deliver(to, 'Your payout details were changed', text);
  }

  /** A plain SMS (callers log it). Throws if the provider refuses. */
  async sendSms(phone: string, text: string): Promise<void> {
    await this.sms.send(phone, text);
  }

  /** SMS and email where available; succeeds if at least one went out. */
  private async deliver(to: Recipient, subject: string, text: string): Promise<void> {
    const tasks: Promise<void>[] = [];
    if (to.phone) tasks.push(this.sms.send(to.phone, text));
    if (to.email) tasks.push(this.email.send({ to: to.email, subject, text }));
    const results = await Promise.allSettled(tasks);
    if (tasks.length && results.every((r) => r.status === 'rejected'))
      throw new Error('Message could not be delivered');
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
