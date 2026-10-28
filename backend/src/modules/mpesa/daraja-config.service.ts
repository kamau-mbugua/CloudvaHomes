import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { FieldCipher } from '../../common/crypto/field-cipher.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { PaymentChannel } from '../../generated/prisma/client.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { requireStepUp } from '../auth/decorators.js';
import { ChannelsService } from '../payments/channels/channels.service.js';
import { DarajaClient, type DarajaTarget } from './daraja.client.js';
import { type DarajaCredentials, stkPassword, darajaTimestamp } from './daraja.js';
import type { SetDarajaDto } from './mpesa.dto.js';
import { callbackUrls } from './urls.js';

const MPESA = new Set(['MPESA_PAYBILL', 'MPESA_TILL']);

/** Per-channel Daraja credentials (encrypted, write-only) and webhook registration. */
@Injectable()
export class DarajaConfigService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly cipher: FieldCipher,
    private readonly audit: AuditService,
    private readonly channels: ChannelsService,
    private readonly daraja: DarajaClient,
  ) {}

  private context(c: Pick<PaymentChannel, 'orgId' | 'id'>) {
    return `${c.orgId}:channel.${c.id}.secrets`;
  }

  credentials(c: PaymentChannel): DarajaCredentials | null {
    if (!c.secretsEnc) return null;
    return JSON.parse(this.cipher.decrypt(c.secretsEnc, this.context(c))) as DarajaCredentials;
  }

  /** Everything needed to call Daraja for a channel, or 409 DARAJA_NOT_CONFIGURED. */
  target(c: PaymentChannel): DarajaTarget & { credentials: DarajaCredentials } {
    const credentials = this.credentials(c);
    if (!credentials || !c.darajaEnv || !c.shortcode) {
      throw AppError.conflict('Set up this channel’s Daraja keys first', 'DARAJA_NOT_CONFIGURED');
    }
    return { key: c.id, environment: c.darajaEnv, credentials };
  }

  /** STK fields: tills push to their store number; the password needs the passkey. */
  stkAuth(c: PaymentChannel, credentials: DarajaCredentials) {
    if (!credentials.passkey) {
      throw AppError.conflict(
        'Add the Lipa na M-Pesa passkey to send payment prompts',
        'DARAJA_NOT_CONFIGURED',
      );
    }
    const businessShortCode =
      c.kind === 'MPESA_TILL' ? (credentials.storeNumber ?? c.shortcode!) : c.shortcode!;
    const timestamp = darajaTimestamp();
    return {
      businessShortCode,
      partyB: c.shortcode!,
      transactionType:
        c.kind === 'MPESA_TILL'
          ? ('CustomerBuyGoodsOnline' as const)
          : ('CustomerPayBillOnline' as const),
      timestamp,
      password: stkPassword(businessShortCode, credentials.passkey, timestamp),
    };
  }

  urls(c: PaymentChannel) {
    if (!c.callbackToken)
      throw AppError.conflict('Set up this channel’s Daraja keys first', 'DARAJA_NOT_CONFIGURED');
    return callbackUrls(this.env, c.callbackToken);
  }

  private async mpesaChannel(id: string) {
    const c = await this.channels.find(id);
    if (!MPESA.has(c.kind)) {
      throw new AppError(
        422,
        'NOT_MPESA_CHANNEL',
        'Only M-Pesa paybill and till channels use Daraja',
      );
    }
    if (!c.shortcode)
      throw AppError.fieldInvalid('shortcode', 'Add the paybill or till number first');
    return c;
  }

  async set(id: string, dto: SetDarajaDto) {
    requireStepUp();
    const c = await this.mpesaChannel(id);
    // Changing the keys without retyping the passkey or store number keeps the saved ones.
    const previous = this.credentials(c);
    const passkey = dto.passkey?.trim() || previous?.passkey;
    const storeNumber = dto.storeNumber?.trim() || previous?.storeNumber;
    const secrets: DarajaCredentials = {
      consumerKey: dto.consumerKey.trim(),
      consumerSecret: dto.consumerSecret.trim(),
      ...(passkey ? { passkey } : {}),
      ...(storeNumber ? { storeNumber } : {}),
    };
    const row = await this.db.$transaction(async (tx) => {
      const updated = await tx.paymentChannel.update({
        where: { id },
        data: {
          darajaEnv: dto.environment,
          secretsEnc: this.cipher.encrypt(JSON.stringify(secrets), this.context(c)),
          callbackToken: c.callbackToken ?? newToken(),
        },
      });
      await this.audit.record(
        {
          action: 'channel.daraja_set',
          entity: 'payment_channel',
          entityId: id,
          after: {
            environment: dto.environment,
            passkey: !!secrets.passkey,
            storeNumber: secrets.storeNumber ?? null,
          },
        },
        tx,
      );
      return updated;
    });
    return this.channels.view(row);
  }

  async remove(id: string) {
    requireStepUp();
    await this.mpesaChannel(id);
    const row = await this.db.$transaction(async (tx) => {
      const updated = await tx.paymentChannel.update({
        where: { id },
        data: { secretsEnc: null, darajaEnv: null, c2bRegisteredAt: null },
      });
      await this.audit.record(
        { action: 'channel.daraja_remove', entity: 'payment_channel', entityId: id },
        tx,
      );
      return updated;
    });
    return this.channels.view(row);
  }

  /** New webhook URLs; the old ones stop working at once. Register C2B again afterwards. */
  async rotate(id: string) {
    requireStepUp();
    const c = await this.mpesaChannel(id);
    if (!c.secretsEnc)
      throw AppError.conflict('Set up this channel’s Daraja keys first', 'DARAJA_NOT_CONFIGURED');
    const row = await this.db.$transaction(async (tx) => {
      const updated = await tx.paymentChannel.update({
        where: { id },
        data: { callbackToken: newToken(), c2bRegisteredAt: null },
      });
      await this.audit.record(
        { action: 'channel.daraja_rotate', entity: 'payment_channel', entityId: id },
        tx,
      );
      return updated;
    });
    return this.channels.view(row);
  }

  async registerC2b(id: string) {
    const c = await this.mpesaChannel(id);
    const target = this.target(c);
    const urls = this.urls(c);
    await this.daraja.registerC2b(target, {
      shortCode: c.shortcode!,
      confirmationUrl: urls.c2bConfirm,
      validationUrl: urls.c2bValidate,
    });
    const row = await this.db.$transaction(async (tx) => {
      const updated = await tx.paymentChannel.update({
        where: { id },
        data: { c2bRegisteredAt: new Date() },
      });
      await this.audit.record(
        { action: 'channel.c2b_register', entity: 'payment_channel', entityId: id },
        tx,
      );
      return updated;
    });
    return this.channels.view(row);
  }
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}
