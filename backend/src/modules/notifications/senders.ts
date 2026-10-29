import { Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../../config/env.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SmsSender {
  send(to: string, text: string): Promise<void>;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export type OutboxEntry =
  | { channel: 'sms'; to: string; text: string; at: Date }
  | { channel: 'email'; to: string; subject: string; text: string; at: Date };

/** Messages "sent" by the log adapters. Tests read OTP codes and invitation links from here. */
export const outbox: OutboxEntry[] = [];

function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 6)}****${phone.slice(-2)}` : '****';
}

/** Dev/test: records the message and logs it. Message bodies are only logged outside production. */
export class LogSmsSender implements SmsSender {
  private readonly logger = new Logger('SMS');
  constructor(private readonly showBodies: boolean) {}

  async send(to: string, text: string): Promise<void> {
    outbox.push({ channel: 'sms', to, text, at: new Date() });
    this.logger.log(this.showBodies ? `→ ${to}: ${text}` : `→ ${maskPhone(to)} (body hidden)`);
  }
}

export class LogEmailSender implements EmailSender {
  private readonly logger = new Logger('Email');
  constructor(private readonly showBodies: boolean) {}

  async send(m: EmailMessage): Promise<void> {
    outbox.push({ channel: 'email', ...m, at: new Date() });
    this.logger.log(
      this.showBodies
        ? `→ ${m.to}: ${m.subject}\n${m.text}`
        : `→ ${m.to}: ${m.subject} (body hidden)`,
    );
  }
}

/**
 * Africa's Talking bulk SMS API. https://developers.africastalking.com/docs/sms/sending
 * The username "sandbox" targets the sandbox host.
 */
export class AfricasTalkingSmsSender implements SmsSender {
  private readonly url: string;
  constructor(
    private readonly username: string,
    private readonly apiKey: string,
    private readonly senderId?: string,
  ) {
    this.url =
      username === 'sandbox'
        ? 'https://api.sandbox.africastalking.com/version1/messaging'
        : 'https://api.africastalking.com/version1/messaging';
  }

  async send(to: string, text: string): Promise<void> {
    const body = new URLSearchParams({ username: this.username, to, message: text });
    if (this.senderId) body.set('from', this.senderId);
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        apiKey: this.apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Africa's Talking responded ${res.status}`);
    }
    const json = (await res.json()) as {
      SMSMessageData?: { Recipients?: { status?: string; statusCode?: number }[] };
    };
    const recipient = json.SMSMessageData?.Recipients?.[0];
    // 100 = processed, 101 = sent, 102 = queued
    if (!recipient || ![100, 101, 102].includes(recipient.statusCode ?? 0)) {
      throw new Error(
        `Africa's Talking rejected the message: ${recipient?.status ?? 'no recipient'}`,
      );
    }
  }
}

export class SmtpEmailSender implements EmailSender {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(env: Env) {
    this.from = env.EMAIL_FROM;
    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }

  async send(m: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: m.to,
      subject: m.subject,
      text: m.text,
      ...(m.html ? { html: m.html } : {}),
    });
  }
}

export function createSmsSender(env: Env): SmsSender {
  if (env.SMS_PROVIDER === 'africastalking') {
    return new AfricasTalkingSmsSender(env.AT_USERNAME!, env.AT_API_KEY!, env.AT_SENDER_ID);
  }
  return new LogSmsSender(env.NODE_ENV !== 'production');
}

export function createEmailSender(env: Env): EmailSender {
  if (env.EMAIL_PROVIDER === 'smtp') return new SmtpEmailSender(env);
  return new LogEmailSender(env.NODE_ENV !== 'production');
}
