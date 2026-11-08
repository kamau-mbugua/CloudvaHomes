import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { FieldCipher } from '../../../common/crypto/field-cipher.js';
import { AppError } from '../../../common/errors/app-error.js';
import { parseDateOnly } from '../../../common/dates/date-only.js';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.js';
import type { SmsAccount, SmsProvider } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { todayInNairobi } from '../../billing/billing-math.js';
import { smsSegments } from '../../tenant-portal/broadcast-rules.js';
import { createSmsSender } from '../senders.js';
import { createProviderSender, ProviderError, type ProviderSender } from './sms-providers.js';
import type {
  OrgSmsSpec,
  SmsOutcome,
  SmsProviderConfig,
  SmsRouteName,
  SmsSpec,
  SmsWarning,
} from './sms-types.js';

export const AT_KEY_CONTEXT = 'platform.sms.africastalking';
export const TEXTSMS_KEY_CONTEXT = 'platform.sms.textsms';
export const HOSTPINNACLE_KEY_CONTEXT = 'platform.sms.hostpinnacle.key';
export const HOSTPINNACLE_PASSWORD_CONTEXT = 'platform.sms.hostpinnacle.password';
/** Bound to the organisation so a stored key can't be copied to another organisation's row. */
export const orgKeyContext = (orgId: string) => `sms.org.apikey:${orgId}`;
export const orgPasswordContext = (orgId: string) => `sms.org.password:${orgId}`;

interface Attempt {
  ok: boolean;
  provider: SmsProvider | null;
  messageId: string | null;
  reason: string | null;
}

/**
 * The only code that talks to SMS providers (docs/specs/2026-11-08-sms-platform-and-org-design.md).
 * Platform messages: KodiHub's provider, never units. Organisation messages: the organisation's
 * own provider (mode OWN) or KodiHub's provider paid in prepaid units (mode PLATFORM).
 * Never throws for provider or unit problems: the outcome says what happened.
 */
@Injectable()
export class SmsService {
  private readonly log = new Logger(SmsService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
  ) {}

  async send(spec: SmsSpec, to: string, text: string): Promise<SmsOutcome> {
    const units = Math.max(1, smsSegments(text));
    if (spec.kind === 'platform') {
      const sent = await this.viaPlatform(to, text);
      return this.finish(spec, to, sent, {
        route: 'PLATFORM',
        units: 0,
        warn: null,
        balance: null,
      });
    }
    const account = await this.account(spec.orgId);
    return account.mode === 'OWN'
      ? this.sendOwn(spec, account, to, text, units)
      : this.sendPlatformPaid(spec, account, to, text, units);
  }

  /** The platform provider: platform settings first, then the server's own SMS config. */
  async platformSender(): Promise<{ sender: ProviderSender; provider: SmsProvider | null }> {
    const config = await this.platformConfig();
    if (config) {
      return {
        sender: createProviderSender(config, this.env, 'platform'),
        provider: config.provider,
      };
    }
    const fallback = createSmsSender(this.env);
    return {
      provider: this.env.SMS_PROVIDER === 'africastalking' ? 'AFRICASTALKING' : null,
      sender: {
        send: async (to, text) => {
          try {
            await fallback.send(to, text);
            return { messageId: null };
          } catch (e) {
            throw new ProviderError(
              e instanceof Error ? e.message : 'SMS provider refused the message',
            );
          }
        },
      },
    };
  }

  /** The organisation's own provider details, or null when they are incomplete. */
  orgConfig(a: SmsAccount): SmsProviderConfig | null {
    if (!a.provider || !a.providerUser || !a.providerKeyEnc) return null;
    const apiKey = this.cipher.decrypt(a.providerKeyEnc, orgKeyContext(a.orgId));
    switch (a.provider) {
      case 'TEXTSMS':
        return { provider: 'TEXTSMS', partnerId: a.providerUser, apiKey, senderId: a.senderId };
      case 'AFRICASTALKING':
        return {
          provider: 'AFRICASTALKING',
          username: a.providerUser,
          apiKey,
          senderId: a.senderId,
          sandbox: a.sandbox,
        };
      case 'HOSTPINNACLE':
        if (!a.providerSecretEnc || !a.senderId) return null;
        return {
          provider: 'HOSTPINNACLE',
          userId: a.providerUser,
          password: this.cipher.decrypt(a.providerSecretEnc, orgPasswordContext(a.orgId)),
          apiKey,
          senderId: a.senderId,
        };
    }
  }

  /** The organisation's account, created (empty) for organisations made before SMS accounts. */
  async account(orgId: string): Promise<SmsAccount> {
    return this.prisma.smsAccount.upsert({ where: { orgId }, create: { orgId }, update: {} });
  }

  /**
   * Units a bulk send of `text` to `recipients` people needs, against the balance. Own-SMS
   * organisations use no units. Throws SMS_UNITS_LOW when `enforce` and the balance can't cover it.
   */
  async bulkUnits(orgId: string, text: string, recipients: number, enforce = false) {
    const account = await this.account(orgId);
    const perMessage = smsSegments(text);
    const needed = perMessage * recipients;
    if (enforce && account.mode === 'PLATFORM' && needed > account.balance) {
      throw AppError.conflict(
        `Not enough SMS units for this notice: it needs ${needed}, you have ${account.balance}.`,
        'SMS_UNITS_LOW',
      );
    }
    return {
      mode: account.mode,
      balance: account.mode === 'PLATFORM' ? account.balance : null,
      unitsPerMessage: perMessage,
      unitsNeeded: account.mode === 'PLATFORM' ? needed : null,
    };
  }

  /** Admin check of an organisation's saved provider details: one real SMS through it. */
  async sendTest(orgId: string, to: string): Promise<{ sent: boolean; reason: string | null }> {
    const account = await this.account(orgId);
    const config = this.orgConfig(account);
    const attempt: Attempt = config
      ? await this.attempt(
          createProviderSender(config, this.env, `org:${orgId}`),
          config.provider,
          to,
          'KodiHub test message: your SMS account works.',
        )
      : {
          ok: false,
          provider: account.provider,
          messageId: null,
          reason: 'The SMS account is not fully set up',
        };
    await this.prisma.smsLog.create({
      data: {
        orgId,
        kind: 'PLATFORM',
        type: 'sms_test',
        to,
        route: 'ORG_PROVIDER',
        provider: attempt.provider,
        providerMessageId: attempt.messageId,
        status: attempt.ok ? 'SENT' : 'FAILED',
        reason: attempt.reason,
      },
    });
    return { sent: attempt.ok, reason: attempt.reason };
  }

  // ── Routes ──

  private async sendOwn(
    spec: OrgSmsSpec,
    account: SmsAccount,
    to: string,
    text: string,
    units: number,
  ): Promise<SmsOutcome> {
    const config = this.orgConfig(account);
    let own: Attempt = {
      ok: false,
      provider: account.provider,
      messageId: null,
      reason: 'Your SMS account is not fully set up',
    };
    if (config) {
      own = await this.attempt(
        createProviderSender(config, this.env, `org:${spec.orgId}`),
        config.provider,
        to,
        text,
      );
    }
    if (own.ok) {
      if (account.failingSince) {
        await this.prisma.smsAccount.update({
          where: { orgId: spec.orgId },
          data: { failingSince: null, lastFailReason: null },
        });
      }
      return this.finish(spec, to, own, {
        route: 'ORG_PROVIDER',
        units: 0,
        warn: null,
        balance: null,
      });
    }

    await this.prisma.smsAccount.update({
      where: { orgId: spec.orgId },
      data: { failingSince: account.failingSince ?? new Date(), lastFailReason: own.reason },
    });
    const warn = (await this.claimWarning(spec.orgId, 'FAILING')) ? 'FAILING' : null;

    if (account.fallbackToPlatform) {
      const logId = randomUUID();
      const balance = await this.charge(spec.orgId, units, logId);
      if (balance !== null) {
        const sent = await this.viaPlatform(to, text);
        if (sent.ok) {
          return this.finish(
            spec,
            to,
            sent,
            { route: 'PLATFORM_FALLBACK', units, warn, balance },
            logId,
          );
        }
        const after = await this.refund(spec.orgId, units, logId);
        return this.finish(
          spec,
          to,
          sent,
          { route: 'PLATFORM_FALLBACK', units: 0, warn, balance: after },
          logId,
        );
      }
    }
    return this.finish(spec, to, own, { route: 'ORG_PROVIDER', units: 0, warn, balance: null });
  }

  private async sendPlatformPaid(
    spec: OrgSmsSpec,
    account: SmsAccount,
    to: string,
    text: string,
    units: number,
  ): Promise<SmsOutcome> {
    const logId = randomUUID();
    const balance = await this.charge(spec.orgId, units, logId);
    if (balance === null) {
      const warn = (await this.claimWarning(spec.orgId, 'EMPTY')) ? 'EMPTY' : null;
      if (spec.type === 'booking_otp') {
        // A guest's booking code never blocks a booking: KodiHub pays for it (spec call 9).
        const sent = await this.viaPlatform(to, text);
        return this.finish(spec, to, sent, {
          route: 'PLATFORM_FREE',
          units: 0,
          warn,
          balance: account.balance,
        });
      }
      return this.finish(
        spec,
        to,
        { ok: false, provider: null, messageId: null, reason: null },
        { route: null, units: 0, warn, balance: account.balance, noUnits: true },
        logId,
      );
    }
    const sent = await this.viaPlatform(to, text);
    if (!sent.ok) {
      const after = await this.refund(spec.orgId, units, logId);
      return this.finish(
        spec,
        to,
        sent,
        { route: 'PLATFORM', units: 0, warn: null, balance: after },
        logId,
      );
    }
    const warn =
      balance < account.lowBalanceLevel && (await this.claimWarning(spec.orgId, 'LOW'))
        ? 'LOW'
        : null;
    return this.finish(spec, to, sent, { route: 'PLATFORM', units, warn, balance }, logId);
  }

  // ── Units ──

  /** Takes `units` atomically; returns the new balance, or null when the balance can't cover it. */
  private async charge(orgId: string, units: number, logId: string): Promise<number | null> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ balance: number }[]>`
        UPDATE "sms_accounts" SET "balance" = "balance" - ${units}, "updatedAt" = (now() AT TIME ZONE 'UTC')
         WHERE "orgId" = ${orgId}::uuid AND "balance" >= ${units}
        RETURNING "balance"`;
      const balance = rows[0]?.balance;
      if (balance === undefined) return null;
      await tx.smsLedgerEntry.create({
        data: { orgId, kind: 'CHARGE', units: -units, balanceAfter: balance, smsLogId: logId },
      });
      return balance;
    });
  }

  private async refund(orgId: string, units: number, logId: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ balance: number }[]>`
        UPDATE "sms_accounts" SET "balance" = "balance" + ${units}, "updatedAt" = (now() AT TIME ZONE 'UTC')
         WHERE "orgId" = ${orgId}::uuid RETURNING "balance"`;
      const balance = rows[0]!.balance;
      await tx.smsLedgerEntry.create({
        data: { orgId, kind: 'REFUND', units, balanceAfter: balance, smsLogId: logId },
      });
      return balance;
    });
  }

  /** At most one warning of each kind per organisation per Nairobi day; true = this call claimed it. */
  private async claimWarning(orgId: string, warn: SmsWarning): Promise<boolean> {
    const today = parseDateOnly(todayInNairobi());
    const field = { LOW: 'lowWarnedOn', EMPTY: 'emptyWarnedOn', FAILING: 'failWarnedOn' }[warn];
    const res = await this.prisma.smsAccount.updateMany({
      where: { orgId, OR: [{ [field]: null }, { [field]: { not: today } }] },
      data: { [field]: today },
    });
    return res.count === 1;
  }

  // ── Providers ──

  private async viaPlatform(to: string, text: string): Promise<Attempt> {
    const { sender, provider } = await this.platformSender();
    return this.attempt(sender, provider, to, text);
  }

  private async attempt(
    sender: ProviderSender,
    provider: SmsProvider | null,
    to: string,
    text: string,
  ): Promise<Attempt> {
    try {
      const r = await sender.send(to, text);
      return { ok: true, provider, messageId: r.messageId, reason: null };
    } catch (e) {
      const reason =
        e instanceof ProviderError ? e.message : 'The SMS provider refused the message';
      if (!(e instanceof ProviderError))
        this.log.warn({ err: e }, 'SMS provider failed unexpectedly');
      return { ok: false, provider, messageId: null, reason };
    }
  }

  /**
   * KodiHub's provider: the one chosen in platform settings when its details are complete,
   * otherwise any other complete one. Only with none at all does the server's own SMS config
   * apply — so a half-filled choice never sends real messages to the log sender.
   */
  private async platformConfig(): Promise<SmsProviderConfig | null> {
    const s = await this.prisma.platformSettings.findUnique({ where: { id: 1 } });
    if (!s) return null;
    const configs: Record<SmsProvider, () => SmsProviderConfig | null> = {
      TEXTSMS: () =>
        s.textsmsPartnerId && s.textsmsKeyEnc
          ? {
              provider: 'TEXTSMS',
              partnerId: s.textsmsPartnerId,
              apiKey: this.cipher.decrypt(s.textsmsKeyEnc, TEXTSMS_KEY_CONTEXT),
              senderId: s.textsmsSenderId,
            }
          : null,
      HOSTPINNACLE: () =>
        s.hostpinnacleUserId &&
        s.hostpinnacleKeyEnc &&
        s.hostpinnaclePasswordEnc &&
        s.hostpinnacleSenderId
          ? {
              provider: 'HOSTPINNACLE',
              userId: s.hostpinnacleUserId,
              password: this.cipher.decrypt(
                s.hostpinnaclePasswordEnc,
                HOSTPINNACLE_PASSWORD_CONTEXT,
              ),
              apiKey: this.cipher.decrypt(s.hostpinnacleKeyEnc, HOSTPINNACLE_KEY_CONTEXT),
              senderId: s.hostpinnacleSenderId,
            }
          : null,
      AFRICASTALKING: () =>
        s.atUsername && s.atApiKeyEnc
          ? {
              provider: 'AFRICASTALKING',
              username: s.atUsername,
              apiKey: this.cipher.decrypt(s.atApiKeyEnc, AT_KEY_CONTEXT),
              senderId: s.atSenderId,
              sandbox: false,
            }
          : null,
    };
    const order: SmsProvider[] = [
      s.smsProvider,
      ...(['AFRICASTALKING', 'TEXTSMS', 'HOSTPINNACLE'] as const).filter(
        (p) => p !== s.smsProvider,
      ),
    ];
    for (const p of order) {
      const config = configs[p]();
      if (config) return config;
    }
    return null;
  }

  // ── Records ──

  private async finish(
    spec: SmsSpec,
    to: string,
    a: Attempt,
    o: {
      route: SmsRouteName | null;
      units: number;
      warn: SmsWarning | null;
      balance: number | null;
      noUnits?: boolean;
    },
    logId: string = randomUUID(),
  ): Promise<SmsOutcome> {
    const status = o.noUnits ? 'NO_UNITS' : a.ok ? 'SENT' : 'FAILED';
    await this.prisma.smsLog.create({
      data: {
        id: logId,
        orgId: spec.kind === 'org' ? spec.orgId : null,
        kind: spec.kind === 'org' ? 'ORG' : 'PLATFORM',
        type: spec.type,
        to,
        units: status === 'SENT' ? o.units : 0,
        route: o.route,
        provider: a.provider,
        providerMessageId: a.messageId,
        status,
        reason: a.reason,
      },
    });
    return {
      status,
      route: o.route,
      units: status === 'SENT' ? o.units : 0,
      reason: a.reason,
      logId,
      warn: o.warn,
      balance: o.balance,
    };
  }
}
