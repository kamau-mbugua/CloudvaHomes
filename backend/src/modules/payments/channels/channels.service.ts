import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error.js';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.js';
import { bankHookUrl } from '../../banks/urls.js';
import { callbackUrls } from '../../mpesa/urls.js';
import type { PaymentChannel, Prisma } from '../../../generated/prisma/client.js';
import { violatesUnique } from '../../../prisma/errors.js';
import { DB, type Db } from '../../../prisma/prisma.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { orgContext } from '../../auth/decorators.js';
import { optionalText } from '../../portfolio/fields.js';
import { allowedPropertyIds } from '../../portfolio/property-scope.js';
import type { CreateChannelDto, ListChannelsQueryDto, UpdateChannelDto } from './channels.dto.js';

const MPESA_KINDS = new Set(['MPESA_PAYBILL', 'MPESA_TILL']);

/** Daraja status for M-Pesa channels; secrets are never part of it. */
function darajaInfo(c: PaymentChannel, env: Env) {
  if (!MPESA_KINDS.has(c.kind)) return null;
  return {
    configured: !!c.secretsEnc,
    environment: c.darajaEnv,
    callbackUrls: c.callbackToken ? callbackUrls(env, c.callbackToken) : null,
    c2bRegisteredAt: c.c2bRegisteredAt,
  };
}

/** Bank notifications (phase 10): which format and where to post; the secret is never shown again. */
function bankWebhookInfo(c: PaymentChannel, env: Env) {
  if (c.kind !== 'BANK_ACCOUNT' || !c.bankAdapter || !c.callbackToken) return null;
  return { adapter: c.bankAdapter, url: bankHookUrl(env, c.callbackToken) };
}

export function toChannel(c: PaymentChannel, env: Env) {
  return {
    id: c.id,
    kind: c.kind,
    name: c.name,
    shortcode: c.shortcode,
    bankName: c.bankName,
    accountNumber: c.accountNumber,
    accountName: c.accountName,
    propertyIds: c.propertyIds,
    status: c.status,
    daraja: darajaInfo(c, env),
    bankWebhook: bankWebhookInfo(c, env),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/** Audit snapshot: everything except Daraja secrets and the webhook token. */
function snapshot(c: PaymentChannel) {
  return {
    kind: c.kind,
    name: c.name,
    shortcode: c.shortcode,
    bankName: c.bankName,
    accountNumber: c.accountNumber,
    accountName: c.accountName,
    propertyIds: c.propertyIds,
    status: c.status,
    darajaEnv: c.darajaEnv,
  };
}

/** Channels a property-limited caller may use: org-wide ones, or ones covering their properties. */
export function channelScope(): Prisma.PaymentChannelWhereInput {
  const ids = allowedPropertyIds();
  return ids
    ? { OR: [{ propertyIds: { isEmpty: true } }, { propertyIds: { hasSome: [...ids] } }] }
    : {};
}

const nameTaken = () => AppError.conflict('Another channel already has this name', 'NAME_TAKEN');

@Injectable()
export class ChannelsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
  ) {}

  view(c: PaymentChannel) {
    return toChannel(c, this.env);
  }

  async list(q: ListChannelsQueryDto) {
    const rows = await this.db.paymentChannel.findMany({
      where: { ...channelScope(), ...(q.status ? { status: q.status } : {}) },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.view(r));
  }

  async create(dto: CreateChannelDto) {
    const { orgId } = orgContext();
    const propertyIds = await this.checkProperties(dto.propertyIds ?? []);
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.paymentChannel.create({
          data: {
            orgId,
            kind: dto.kind,
            name: dto.name.trim(),
            shortcode: optionalText(dto.shortcode) ?? null,
            bankName: optionalText(dto.bankName) ?? null,
            accountNumber: optionalText(dto.accountNumber) ?? null,
            accountName: optionalText(dto.accountName) ?? null,
            propertyIds,
          },
        });
        await this.audit.record(
          {
            action: 'channel.create',
            entity: 'payment_channel',
            entityId: row.id,
            after: snapshot(row),
          },
          tx,
        );
        return this.view(row);
      });
    } catch (e) {
      if (violatesUnique(e, 'name')) throw nameTaken();
      throw e;
    }
  }

  async update(id: string, dto: UpdateChannelDto) {
    const before = await this.find(id);
    const propertyIds = dto.propertyIds ? await this.checkProperties(dto.propertyIds) : undefined;
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.paymentChannel.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.shortcode !== undefined ? { shortcode: optionalText(dto.shortcode) } : {}),
            ...(dto.bankName !== undefined ? { bankName: optionalText(dto.bankName) } : {}),
            ...(dto.accountNumber !== undefined
              ? { accountNumber: optionalText(dto.accountNumber) }
              : {}),
            ...(dto.accountName !== undefined
              ? { accountName: optionalText(dto.accountName) }
              : {}),
            ...(propertyIds ? { propertyIds } : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
          },
        });
        await this.audit.record(
          {
            action: 'channel.update',
            entity: 'payment_channel',
            entityId: id,
            before: snapshot(before),
            after: snapshot(row),
          },
          tx,
        );
        return this.view(row);
      });
    } catch (e) {
      if (violatesUnique(e, 'name')) throw nameTaken();
      throw e;
    }
  }

  async remove(id: string) {
    const before = await this.find(id);
    if (await this.db.payment.count({ where: { channelId: id } })) {
      throw AppError.conflict(
        'Payments were received on this channel. Mark it inactive instead.',
        'IN_USE',
      );
    }
    await this.db.$transaction(async (tx) => {
      await tx.paymentChannel.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'channel.delete',
          entity: 'payment_channel',
          entityId: id,
          before: snapshot(before),
        },
        tx,
      );
    });
  }

  /** A channel the caller may use, or 404. */
  async find(id: string): Promise<PaymentChannel> {
    const c = await this.db.paymentChannel.findFirst({ where: { id, ...channelScope() } });
    if (!c) throw AppError.notFound('Payment channel');
    return c;
  }

  private async checkProperties(ids: string[]) {
    const unique = [...new Set(ids)];
    if (
      unique.length &&
      (await this.db.property.count({ where: { id: { in: unique } } })) !== unique.length
    ) {
      throw AppError.fieldInvalid('propertyIds', 'Choose properties from this organisation');
    }
    return unique;
  }
}
