import { Logger } from '@nestjs/common';
import { importPKCS8, SignJWT } from 'jose';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../../config/env.js';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
  /** Sender name shown instead of KodiHub's, e.g. "Makini Homes via KodiHub" (same address). */
  fromName?: string;
  /** Where replies go, e.g. the host's own email. */
  replyTo?: string;
}

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushSendResult {
  sent: boolean;
  /** True when FCM reports the device token is no longer valid / unregistered and should be pruned. */
  unregistered?: boolean;
}

export interface SmsSender {
  send(to: string, text: string): Promise<void>;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export interface PushSender {
  send(message: PushMessage): Promise<PushSendResult>;
}

export type OutboxEntry =
  | { channel: 'sms'; to: string; text: string; at: Date; via?: string }
  | {
      channel: 'email';
      to: string;
      subject: string;
      text: string;
      html?: string;
      attachments?: EmailAttachment[];
      at: Date;
    }
  | {
      channel: 'push';
      to: string;
      title: string;
      body: string;
      text: string;
      data?: Record<string, string>;
      at: Date;
    };

/** Messages "sent" by the log adapters. Tests read OTP codes and invitation links from here. */
export const outbox: OutboxEntry[] = [];

function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 6)}****${phone.slice(-2)}` : '****';
}

/** Dev/test: records the message and logs it. Message bodies are only logged outside production. */
export class LogSmsSender implements SmsSender {
  private readonly logger = new Logger('SMS');
  constructor(
    private readonly showBodies: boolean,
    private readonly via = 'platform',
  ) {}

  async send(to: string, text: string): Promise<void> {
    outbox.push({ channel: 'sms', to, text, at: new Date(), via: this.via });
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
    sandbox = false,
  ) {
    this.url =
      sandbox || username === 'sandbox'
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
      ...(m.attachments?.length ? { attachments: m.attachments } : {}),
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

function maskToken(token: string): string {
  return token.length > 10 ? `${token.slice(0, 6)}…${token.slice(-4)}` : '****';
}

export class LogPushSender implements PushSender {
  private readonly logger = new Logger('Push');
  constructor(private readonly showBodies: boolean) {}

  async send(m: PushMessage): Promise<PushSendResult> {
    outbox.push({
      channel: 'push',
      to: m.token,
      title: m.title,
      body: m.body,
      text: `${m.title}\n${m.body}`,
      ...(m.data ? { data: m.data } : {}),
      at: new Date(),
    });
    this.logger.log(
      this.showBodies
        ? `→ ${maskToken(m.token)}: ${m.title} — ${m.body}`
        : `→ ${maskToken(m.token)} (body hidden)`,
    );
    return { sent: true };
  }
}

interface ServiceAccountCredentials {
  project_id?: string;
  client_email: string;
  private_key: string;
}

export function parseServiceAccountJson(raw: string): ServiceAccountCredentials {
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith('{')
    ? trimmed
    : Buffer.from(trimmed, 'base64').toString('utf8');
  const parsed = JSON.parse(jsonText) as Partial<ServiceAccountCredentials>;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('FCM service account JSON must contain client_email and private_key');
  }
  return {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, '\n'),
  };
}

/**
 * Firebase Cloud Messaging HTTP v1 API sender (`https://fcm.googleapis.com/v1/projects/{id}/messages:send`).
 * Authenticates using either a service-account JSON key (`FCM_SERVICE_ACCOUNT_JSON`) or the GCP
 * metadata server (Application Default Credentials on Cloud Run / Compute Engine).
 */
export class FcmPushSender implements PushSender {
  private readonly logger = new Logger('FCM');
  private readonly projectId: string;
  private readonly credentials: ServiceAccountCredentials | null;
  private cachedAccessToken: { token: string; expiresAtMs: number } | null = null;

  constructor(opts: { projectId: string; serviceAccountJson?: string }) {
    this.projectId = opts.projectId;
    this.credentials = opts.serviceAccountJson
      ? parseServiceAccountJson(opts.serviceAccountJson)
      : null;
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedAccessToken && this.cachedAccessToken.expiresAtMs - 60_000 > now) {
      return this.cachedAccessToken.token;
    }

    if (this.credentials) {
      const iat = Math.floor(now / 1000);
      const exp = iat + 3600;
      const key = await importPKCS8(this.credentials.private_key, 'RS256');
      const assertion = await new SignJWT({
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
      })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
        .setIssuer(this.credentials.client_email)
        .setSubject(this.credentials.client_email)
        .setAudience('https://oauth2.googleapis.com/token')
        .setIssuedAt(iat)
        .setExpirationTime(exp)
        .sign(key);

      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`FCM OAuth token exchange failed with HTTP ${res.status}`);
      }
      const data = (await res.json()) as { access_token: string; expires_in?: number };
      this.cachedAccessToken = {
        token: data.access_token,
        expiresAtMs: now + (data.expires_in ?? 3600) * 1000,
      };
      return data.access_token;
    }

    // Fallback to GCP Metadata Server (Cloud Run / GCE)
    const res = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      {
        headers: { 'Metadata-Flavor': 'Google' },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) {
      throw new Error(`GCP metadata token fetch failed with HTTP ${res.status}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in?: number };
    this.cachedAccessToken = {
      token: data.access_token,
      expiresAtMs: now + (data.expires_in ?? 3600) * 1000,
    };
    return data.access_token;
  }

  async send(m: PushMessage): Promise<PushSendResult> {
    const accessToken = await this.getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/messages:send`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: m.token,
          notification: {
            title: m.title,
            body: m.body,
          },
          ...(m.data ? { data: m.data } : {}),
          android: {
            priority: 'HIGH',
            notification: {
              channel_id: 'kodihub_default',
              sound: 'default',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
              },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      return { sent: true };
    }

    const errText = await res.text().catch(() => '');
    const isUnregistered =
      res.status === 404 ||
      errText.includes('UNREGISTERED') ||
      errText.includes('registration-token-not-registered');
    if (isUnregistered) {
      this.logger.debug(`Pruning unregistered FCM token ${maskToken(m.token)}`);
      return { sent: false, unregistered: true };
    }

    this.logger.warn(`FCM send failed (${res.status}): ${errText.slice(0, 200)}`);
    return { sent: false };
  }
}

export function createPushSender(env: Env): PushSender {
  if (env.FCM_PROVIDER === 'fcm') {
    const sa = env.FCM_SERVICE_ACCOUNT_JSON
      ? parseServiceAccountJson(env.FCM_SERVICE_ACCOUNT_JSON)
      : null;
    const projectId = env.FCM_PROJECT_ID ?? sa?.project_id ?? env.GCP_PROJECT_ID;
    if (projectId) {
      return new FcmPushSender({
        projectId,
        serviceAccountJson: env.FCM_SERVICE_ACCOUNT_JSON,
      });
    }
  }
  return new LogPushSender(env.NODE_ENV !== 'production');
}
