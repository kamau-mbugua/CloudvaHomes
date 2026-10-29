import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { FieldCipher } from '../../common/crypto/field-cipher.js';
import { withoutOrgScope } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type {
  PlatformSettings,
  PlatformStkRequest,
  Prisma,
} from '../../generated/prisma/client.js';
import { violatesUnique } from '../../prisma/errors.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { orgContext, requireStepUp } from '../auth/decorators.js';
import { DarajaClient, type DarajaTarget } from '../mpesa/daraja.client.js';
import {
  type C2bConfirmation,
  type DarajaCredentials,
  darajaTimestamp,
  normalizeAccountRef,
  parseStkCallback,
  stkPassword,
  stkStateFor,
  toMsisdn,
} from '../mpesa/daraja.js';
import { AT_API_KEY_CONTEXT } from '../notifications/notifications.service.js';
import { requiredPhone } from '../portfolio/fields.js';
import { PlatformBillingService } from './platform-billing.service.js';
import type { BillingPayDto, PlatformSettingsDto } from './platform.dto.js';

const SECRETS_CONTEXT = 'platform.daraja.secrets';

/** Hodi's own Daraja app: organisations pay their Hodi bill by STK push or to the paybill. */
@Injectable()
export class PlatformPayService {
  private readonly log = new Logger(PlatformPayService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly cipher: FieldCipher,
    private readonly audit: AuditService,
    private readonly daraja: DarajaClient,
    private readonly billing: PlatformBillingService,
  ) {}

  // ── Settings ──

  urls(token: string) {
    const base = `${(this.env.PUBLIC_API_URL ?? this.env.APP_URL).replace(/\/$/, '')}/api/v1/hooks/platform/${token}`;
    return {
      stk: `${base}/stk`,
      c2bConfirm: `${base}/c2b/confirm`,
      c2bValidate: `${base}/c2b/validate`,
    };
  }

  private credentials(s: PlatformSettings): DarajaCredentials | null {
    if (!s.secretsEnc) return null;
    return JSON.parse(this.cipher.decrypt(s.secretsEnc, SECRETS_CONTEXT)) as DarajaCredentials;
  }

  view(s: PlatformSettings) {
    const creds = this.credentials(s);
    const smsDbConfigured = Boolean(s.atUsername && s.atApiKeyEnc);
    return {
      dueDays: s.dueDays,
      suspendAfterDays: s.suspendAfterDays,
      defaultPlanId: s.defaultPlanId,
      paybill: s.paybill,
      daraja: {
        configured: !!creds && !!s.darajaEnv,
        environment: s.darajaEnv,
        passkey: !!creds?.passkey,
        callbackUrls: s.callbackToken ? this.urls(s.callbackToken) : null,
      },
      requireAdminTwoFactor: s.requireAdminTwoFactor,
      adminTwoFactorChannel: s.adminTwoFactorChannel,
      sms: {
        configured: smsDbConfigured || this.env.SMS_PROVIDER === 'africastalking',
        username: s.atUsername ?? (this.env.SMS_PROVIDER === 'africastalking' ? this.env.AT_USERNAME ?? null : null),
        senderId: s.atSenderId ?? this.env.AT_SENDER_ID ?? null,
        apiKeySet: Boolean(s.atApiKeyEnc),
        source: smsDbConfigured
          ? ('database' as const)
          : this.env.SMS_PROVIDER === 'africastalking'
            ? ('env' as const)
            : ('log' as const),
      },
      allowPublicSignup: s.allowPublicSignup,
      minAppVersionCode: s.minAppVersionCode,
      minAppVersionName: s.minAppVersionName,
      appUpdateMessage: s.appUpdateMessage,
      appStoreUrl: s.appStoreUrl,
      maintenanceMode: s.maintenanceMode,
      maintenanceMessage: s.maintenanceMessage,
      updatedAt: s.updatedAt,
    };
  }

  async getSettings() {
    return this.view(await this.billing.settings());
  }

  async updateSettings(dto: PlatformSettingsDto) {
    const keysChange =
      dto.consumerKey !== undefined ||
      dto.consumerSecret !== undefined ||
      dto.passkey !== undefined;
    if (keysChange) requireStepUp();
    return withoutOrgScope(async () => {
      const before = await this.billing.settings();
      if (dto.defaultPlanId) {
        const plan = await this.db.plan.findUnique({ where: { id: dto.defaultPlanId } });
        if (!plan?.active) throw AppError.fieldInvalid('defaultPlanId', 'Choose an active plan');
      }
      const data: Prisma.PlatformSettingsUpdateInput = {
        ...(dto.dueDays !== undefined ? { dueDays: dto.dueDays } : {}),
        ...(dto.suspendAfterDays !== undefined ? { suspendAfterDays: dto.suspendAfterDays } : {}),
        ...(dto.defaultPlanId !== undefined ? { defaultPlanId: dto.defaultPlanId } : {}),
        ...(dto.paybill !== undefined ? { paybill: dto.paybill } : {}),
        ...(dto.darajaEnvironment !== undefined ? { darajaEnv: dto.darajaEnvironment } : {}),
        ...(dto.requireAdminTwoFactor !== undefined
          ? { requireAdminTwoFactor: dto.requireAdminTwoFactor }
          : {}),
        ...(dto.adminTwoFactorChannel !== undefined
          ? { adminTwoFactorChannel: dto.adminTwoFactorChannel }
          : {}),
        ...(dto.atUsername !== undefined ? { atUsername: dto.atUsername?.trim() || null } : {}),
        ...(dto.atSenderId !== undefined ? { atSenderId: dto.atSenderId?.trim() || null } : {}),
        ...(dto.allowPublicSignup !== undefined
          ? { allowPublicSignup: dto.allowPublicSignup }
          : {}),
        ...(dto.minAppVersionCode !== undefined
          ? { minAppVersionCode: dto.minAppVersionCode }
          : {}),
        ...(dto.minAppVersionName !== undefined
          ? { minAppVersionName: dto.minAppVersionName?.trim() || null }
          : {}),
        ...(dto.appUpdateMessage !== undefined
          ? { appUpdateMessage: dto.appUpdateMessage?.trim() || null }
          : {}),
        ...(dto.appStoreUrl !== undefined ? { appStoreUrl: dto.appStoreUrl?.trim() || null } : {}),
        ...(dto.maintenanceMode !== undefined ? { maintenanceMode: dto.maintenanceMode } : {}),
        ...(dto.maintenanceMessage !== undefined
          ? { maintenanceMessage: dto.maintenanceMessage?.trim() || null }
          : {}),
      };
      if (dto.clearAtApiKey) {
        data.atApiKeyEnc = null;
      } else if (dto.atApiKey?.trim()) {
        data.atApiKeyEnc = this.cipher.encrypt(dto.atApiKey.trim(), AT_API_KEY_CONTEXT);
      }
      if (keysChange) {
        const previous = this.credentials(before);
        const consumerKey = dto.consumerKey?.trim() || previous?.consumerKey;
        const consumerSecret = dto.consumerSecret?.trim() || previous?.consumerSecret;
        if (!consumerKey || !consumerSecret) {
          throw AppError.fieldInvalid('consumerSecret', 'Enter both the consumer key and secret');
        }
        const passkey = dto.passkey?.trim() || previous?.passkey;
        const secrets: DarajaCredentials = {
          consumerKey,
          consumerSecret,
          ...(passkey ? { passkey } : {}),
        };
        data.secretsEnc = this.cipher.encrypt(JSON.stringify(secrets), SECRETS_CONTEXT);
        data.callbackToken = before.callbackToken ?? randomBytes(32).toString('base64url');
        if (!before.darajaEnv && !dto.darajaEnvironment) data.darajaEnv = 'SANDBOX';
      }
      const after = await this.db.$transaction(async (tx) => {
        const row = await tx.platformSettings.update({ where: { id: 1 }, data });
        const { daraja: _a, ...b } = this.view(before);
        const { daraja: _b, ...a } = this.view(row);
        await this.audit.record(
          {
            action: 'platform.settings_update',
            entity: 'platform_settings',
            entityId: '1',
            orgId: null,
            before: b,
            after: { ...a, keysChanged: keysChange },
          },
          tx,
        );
        return row;
      });
      return this.view(after);
    });
  }

  /** Daraja target + STK fields, or null when Hodi's M-Pesa isn't set up. */
  private stkSetup(s: PlatformSettings) {
    const creds = this.credentials(s);
    if (!creds?.passkey || !s.darajaEnv || !s.paybill || !s.callbackToken) return null;
    const timestamp = darajaTimestamp();
    const target: DarajaTarget = { key: 'platform', environment: s.darajaEnv, credentials: creds };
    return {
      target,
      businessShortCode: s.paybill,
      timestamp,
      password: stkPassword(s.paybill, creds.passkey, timestamp),
      callbackUrl: this.urls(s.callbackToken).stk,
    };
  }

  canPayInApp(s: PlatformSettings) {
    return this.stkSetup(s) !== null;
  }

  // ── Organisation pays Hodi ──

  private viewStk(r: PlatformStkRequest) {
    return {
      id: r.id,
      state: r.state,
      phone: r.phone,
      amount: r.amount,
      resultDesc: r.resultDesc,
      mpesaReceipt: r.mpesaReceipt,
      paymentId: r.paymentId,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
    };
  }

  async pay(dto: BillingPayDto, idempotencyKey?: string) {
    const ctx = orgContext();
    if (idempotencyKey) {
      const existing = await this.db.platformStkRequest.findFirst({
        where: { idempotencyKey, orgId: ctx.orgId },
      });
      if (existing) {
        if (existing.amount !== BigInt(dto.amount)) {
          throw AppError.conflict(
            'This Idempotency-Key was already used for a different request',
            'IDEMPOTENCY_MISMATCH',
          );
        }
        return this.viewStk(existing);
      }
    }
    const settings = await this.billing.settings();
    const setup = this.stkSetup(settings);
    if (!setup)
      throw AppError.conflict(
        'Paying in the app isn’t available yet. Use the paybill.',
        'NO_MPESA',
      );
    const amount = BigInt(dto.amount);
    if (amount <= 0n || amount % 100n !== 0n)
      throw AppError.fieldInvalid('amount', 'M-Pesa takes whole shillings only');
    const [org, user] = await Promise.all([
      this.db.organization.findUniqueOrThrow({ where: { id: ctx.orgId } }),
      this.db.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { phone: true } }),
    ]);
    const phone = requiredPhone('phone', dto.phone ?? user.phone ?? '');
    if (!/^\+254[17]\d{8}$/.test(phone))
      throw AppError.fieldInvalid('phone', 'Enter a Safaricom number');

    let request: PlatformStkRequest;
    try {
      request = await this.db.platformStkRequest.create({
        data: {
          orgId: ctx.orgId,
          phone,
          amount,
          idempotencyKey: idempotencyKey ?? null,
          requestedById: ctx.userId,
        },
      });
    } catch (e) {
      if (idempotencyKey && violatesUnique(e, 'idempotencyKey')) {
        return this.viewStk(
          await this.db.platformStkRequest.findFirstOrThrow({ where: { idempotencyKey } }),
        );
      }
      throw e;
    }
    try {
      const res = await this.daraja.stkPush(setup.target, {
        businessShortCode: setup.businessShortCode,
        partyB: setup.businessShortCode,
        transactionType: 'CustomerPayBillOnline',
        amountKes: Number(amount / 100n),
        phone: toMsisdn(phone),
        callbackUrl: setup.callbackUrl,
        accountReference: org.billingRef ?? 'HODI',
        description: 'Hodi bill',
        password: setup.password,
        timestamp: setup.timestamp,
      });
      request = await this.db.platformStkRequest.update({
        where: { id: request.id },
        data: { checkoutRequestId: res.checkoutRequestId },
      });
    } catch (e) {
      await this.db.platformStkRequest.update({
        where: { id: request.id },
        data: {
          state: 'FAILED',
          resultDesc: e instanceof AppError ? e.message : 'Could not reach M-Pesa',
          completedAt: new Date(),
        },
      });
      throw e;
    }
    await this.audit.record({
      action: 'platform_stk.push',
      entity: 'platform_stk_request',
      entityId: request.id,
      after: { amount, phone },
    });
    return this.viewStk(request);
  }

  async getStk(id: string) {
    const r = await this.db.platformStkRequest.findFirst({
      where: { id, orgId: orgContext().orgId },
    });
    if (!r) throw AppError.notFound('Payment request');
    return this.viewStk(r);
  }

  // ── Safaricom callbacks (already authenticated by token + IP) ──

  async settingsByToken(token: string) {
    const s = await this.db.platformSettings.findUnique({ where: { callbackToken: token } });
    return s?.secretsEnc ? s : null;
  }

  handleStkCallback(settings: PlatformSettings, body: unknown) {
    return withoutOrgScope(async () => {
      const cb = parseStkCallback(body);
      if (!cb) return;
      const req = await this.db.platformStkRequest.findUnique({
        where: { checkoutRequestId: cb.checkoutRequestId },
      });
      if (!req || req.state !== 'PENDING') return;
      const state = stkStateFor(cb.resultCode);
      if (state !== 'SUCCESS') {
        await this.finish(req.id, { state, resultDesc: cb.resultDesc });
        return;
      }
      // Daraja doesn't sign callbacks: confirm with Safaricom before believing it.
      const setup = this.stkSetup(settings);
      if (!setup) return;
      const confirmed = await this.daraja.stkQuery(setup.target, {
        businessShortCode: setup.businessShortCode,
        password: setup.password,
        timestamp: setup.timestamp,
        checkoutRequestId: cb.checkoutRequestId,
      });
      if (confirmed.resultCode !== '0') {
        this.log.warn(
          { stkId: req.id, resultCode: confirmed.resultCode },
          'Platform STK success not confirmed by query',
        );
        if (confirmed.resultCode !== null) {
          await this.finish(req.id, {
            state: stkStateFor(confirmed.resultCode),
            resultDesc: confirmed.resultDesc,
          });
        }
        return;
      }
      if (!cb.receipt || !cb.amount) return;
      const paymentId = await this.recordOnce(req.orgId, {
        amount: cb.amount,
        source: 'STK',
        reference: cb.receipt,
        receivedAt: cb.occurredAt ?? new Date(),
        raw: body as Prisma.InputJsonValue,
      });
      await this.finish(req.id, {
        state: 'SUCCESS',
        resultDesc: cb.resultDesc,
        mpesaReceipt: cb.receipt,
        paymentId,
      });
    });
  }

  /** Paybill payment to Hodi: the account number is the organisation's billing ref. */
  handleC2b(c: C2bConfirmation, body: unknown) {
    return withoutOrgScope(async () => {
      const ref = normalizeAccountRef(c.accountRef);
      const org = ref
        ? await this.db.organization.findUnique({
            where: { billingRef: ref },
            select: { id: true },
          })
        : null;
      if (!org) {
        // Unmatched money to Hodi's paybill: a platform admin records it by hand.
        this.log.warn(
          { receipt: c.receipt },
          'Hodi paybill payment with an unknown account number',
        );
        return;
      }
      await this.recordOnce(org.id, {
        amount: c.amount,
        source: 'C2B',
        reference: c.receipt,
        receivedAt: c.occurredAt,
        payerName: c.payerName,
        raw: body as Prisma.InputJsonValue,
      });
    });
  }

  /** A retried callback carries the same receipt: answer with the payment already recorded. */
  private async recordOnce(
    orgId: string,
    p: {
      amount: bigint;
      source: 'STK' | 'C2B';
      reference: string;
      receivedAt: Date;
      payerName?: string | null;
      raw: Prisma.InputJsonValue;
    },
  ): Promise<string> {
    try {
      return await this.billing.recordPayment({ orgId, method: 'MPESA', ...p });
    } catch (e) {
      if (e instanceof AppError && e.code === 'DUPLICATE_REFERENCE') {
        const existing = await this.db.platformPayment.findUniqueOrThrow({
          where: { reference: p.reference.toUpperCase() },
        });
        return existing.id;
      }
      throw e;
    }
  }

  private async finish(
    id: string,
    data: Partial<Pick<PlatformStkRequest, 'resultDesc' | 'mpesaReceipt' | 'paymentId'>> & {
      state: PlatformStkRequest['state'];
    },
  ) {
    await this.db.platformStkRequest.updateMany({
      where: { id, state: 'PENDING' },
      data: { ...data, completedAt: new Date() },
    });
  }
}
