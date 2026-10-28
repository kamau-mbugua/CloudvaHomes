import { Inject, Injectable, Logger } from '@nestjs/common';
import { emptyContext, runWithContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { toSkipTake } from '../../common/http/pagination.js';
import { paginated } from '../../common/http/response.js';
import type { PaymentChannel, Prisma, StkRequest } from '../../generated/prisma/client.js';
import { violatesUnique } from '../../prisma/errors.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { orgContext } from '../auth/decorators.js';
import { requiredPhone } from '../portfolio/fields.js';
import { allowedPropertyIds, tenantScope } from '../portfolio/property-scope.js';
import { TenantsService } from '../portfolio/tenants/tenants.service.js';
import { ChannelsService } from '../payments/channels/channels.service.js';
import { DarajaConfigService } from './daraja-config.service.js';
import { DarajaClient } from './daraja.client.js';
import { parseStkCallback, stkStateFor, toMsisdn } from './daraja.js';
import { InboundService } from './inbound.service.js';
import type { ListStkQueryDto, StkPushDto } from './mpesa.dto.js';

const INCLUDE = {
  channel: { select: { id: true, name: true } },
} satisfies Prisma.StkRequestInclude;

/** Re-query pending requests after this long; give up after TIMEOUT_MS. */
export const SWEEP_AFTER_MS = 90_000;
export const TIMEOUT_MS = 10 * 60_000;

/**
 * Lipa na M-Pesa Online: push a payment prompt to a phone, then turn Safaricom's callback —
 * only after re-querying it — into a payment. Final states are written once (conditional
 * update from PENDING), so the callback, its retries and the sweep can't double-process.
 */
@Injectable()
export class StkService {
  private readonly log = new Logger(StkService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: DarajaConfigService,
    private readonly daraja: DarajaClient,
    private readonly channels: ChannelsService,
    private readonly tenants: TenantsService,
    private readonly inbound: InboundService,
  ) {}

  private async view(r: StkRequest & { channel: { id: string; name: string } }) {
    const t = await this.db.tenant.findUnique({
      where: { id: r.tenantId },
      select: { id: true, code: true, firstName: true, lastName: true },
    });
    return {
      id: r.id,
      state: r.state,
      phone: r.phone,
      amount: r.amount,
      accountRef: r.accountRef,
      resultDesc: r.resultDesc,
      mpesaReceipt: r.mpesaReceipt,
      tenant: t,
      channel: r.channel,
      invoiceIds: r.invoiceIds,
      paymentId: r.paymentId,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
    };
  }

  async push(dto: StkPushDto, idempotencyKey?: string) {
    const ctx = orgContext();
    if (idempotencyKey) {
      const existing = await this.db.stkRequest.findFirst({
        where: { idempotencyKey },
        include: INCLUDE,
      });
      if (existing) {
        if (existing.tenantId !== dto.tenantId || existing.amount !== BigInt(dto.amount)) {
          throw AppError.conflict(
            'This Idempotency-Key was already used for a different request',
            'IDEMPOTENCY_MISMATCH',
          );
        }
        return this.view(existing);
      }
    }
    const tenant = await this.tenants.find(dto.tenantId);
    const channel = await this.channels.find(dto.channelId);
    if (channel.status !== 'ACTIVE')
      throw AppError.conflict('This payment channel is inactive', 'CHANNEL_INACTIVE');
    const target = this.config.target(channel);
    const amount = BigInt(dto.amount);
    if (amount <= 0n || amount % 100n !== 0n) {
      throw AppError.fieldInvalid('amount', 'M-Pesa takes whole shillings only');
    }
    const phone = requiredPhone('phone', dto.phone ?? tenant.phone);
    if (!/^\+254[17]\d{8}$/.test(phone))
      throw AppError.fieldInvalid('phone', 'Enter a Safaricom number');
    if (dto.invoiceIds?.length) {
      const owned = await this.db.invoice.count({
        where: { id: { in: dto.invoiceIds }, tenantId: tenant.id },
      });
      if (owned !== new Set(dto.invoiceIds).size) {
        throw AppError.fieldInvalid('invoiceIds', 'Choose invoices of this tenant');
      }
    }
    const auth = this.config.stkAuth(channel, target.credentials);
    const urls = this.config.urls(channel);

    let request: StkRequest;
    try {
      request = await this.db.stkRequest.create({
        data: {
          orgId: ctx.orgId,
          channelId: channel.id,
          tenantId: tenant.id,
          invoiceIds: [...new Set(dto.invoiceIds ?? [])],
          phone,
          amount,
          accountRef: tenant.code,
          idempotencyKey: idempotencyKey ?? null,
          requestedById: ctx.userId,
        },
      });
    } catch (e) {
      if (idempotencyKey && violatesUnique(e, 'idempotencyKey')) {
        // An identical retry won the race: answer with its request, sending nothing new.
        const winner = await this.db.stkRequest.findFirstOrThrow({
          where: { idempotencyKey },
          include: INCLUDE,
        });
        return this.view(winner);
      }
      throw e;
    }
    try {
      const res = await this.daraja.stkPush(target, {
        ...auth,
        amountKes: Number(amount / 100n),
        phone: toMsisdn(phone),
        callbackUrl: urls.stk,
        accountReference: tenant.code.slice(0, 12),
        description: 'Rent'.slice(0, 13),
      });
      request = await this.db.stkRequest.update({
        where: { id: request.id },
        data: {
          merchantRequestId: res.merchantRequestId,
          checkoutRequestId: res.checkoutRequestId,
        },
      });
    } catch (e) {
      await this.db.stkRequest.update({
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
      action: 'stk.push',
      entity: 'stk_request',
      entityId: request.id,
      after: { tenantId: tenant.id, channelId: channel.id, amount, phone },
    });
    return this.get(request.id);
  }

  async get(id: string) {
    const r = await this.db.stkRequest.findFirst({
      where: { id, ...(await this.visibleTenants()) },
      include: INCLUDE,
    });
    if (!r) throw AppError.notFound('Payment request');
    return this.view(r);
  }

  async list(q: ListStkQueryDto) {
    const where: Prisma.StkRequestWhereInput = {
      ...(q.tenantId ? { tenantId: q.tenantId } : await this.visibleTenants()),
      ...(q.state ? { state: q.state } : {}),
    };
    if (q.tenantId) await this.tenants.find(q.tenantId);
    const [rows, total] = await Promise.all([
      this.db.stkRequest.findMany({
        where,
        include: INCLUDE,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(q),
      }),
      this.db.stkRequest.count({ where }),
    ]);
    return paginated(await Promise.all(rows.map((r) => this.view(r))), total, q);
  }

  /** StkRequest has no tenant relation; property-limited callers see their tenants' requests. */
  private async visibleTenants(): Promise<Prisma.StkRequestWhereInput> {
    if (!allowedPropertyIds()) return {};
    const rows = await this.db.tenant.findMany({ where: tenantScope(), select: { id: true } });
    return { tenantId: { in: rows.map((r) => r.id) } };
  }

  /**
   * Safaricom's STK result for a channel (webhook, already authenticated by token + IP).
   * A success is re-queried before any money is recorded.
   */
  async handleCallback(channel: PaymentChannel, body: unknown): Promise<void> {
    const cb = parseStkCallback(body);
    if (!cb) {
      this.log.warn({ channelId: channel.id }, 'STK callback without a CheckoutRequestID');
      return;
    }
    const req = await this.db.stkRequest.findFirst({
      where: { checkoutRequestId: cb.checkoutRequestId, channelId: channel.id },
    });
    if (!req) {
      this.log.warn({ channelId: channel.id }, 'STK callback for an unknown request');
      return;
    }
    if (req.state !== 'PENDING') return; // retry of a finished request
    const state = stkStateFor(cb.resultCode);
    if (state !== 'SUCCESS') {
      await this.finish(req.id, { state, resultCode: cb.resultCode, resultDesc: cb.resultDesc });
      return;
    }
    // Daraja doesn't sign callbacks: confirm with Safaricom before believing it.
    const confirmed = await this.query(channel, req);
    if (confirmed.resultCode !== '0') {
      this.log.warn(
        { stkId: req.id, resultCode: confirmed.resultCode },
        'STK success callback not confirmed by query',
      );
      if (confirmed.resultCode !== null) {
        await this.finish(req.id, {
          state: stkStateFor(confirmed.resultCode),
          resultCode: confirmed.resultCode,
          resultDesc: confirmed.resultDesc,
        });
      }
      return;
    }
    if (!cb.receipt || !cb.amount) {
      this.log.warn({ stkId: req.id }, 'STK success without receipt or amount');
      return;
    }
    const { inboundId, paymentId } = await this.inbound.receive(
      channel,
      {
        source: 'MPESA_STK',
        providerRef: cb.receipt,
        amount: cb.amount,
        payerName: null,
        payerPhone: cb.phone,
        accountRef: req.accountRef,
        occurredAt: cb.occurredAt ?? new Date(),
        raw: body as Prisma.InputJsonValue,
      },
      { tenantId: req.tenantId, invoiceIds: req.invoiceIds },
    );
    await this.finish(req.id, {
      state: 'SUCCESS',
      resultCode: '0',
      resultDesc: cb.resultDesc,
      mpesaReceipt: cb.receipt,
      inboundId,
      paymentId,
    });
  }

  private async query(channel: PaymentChannel, req: StkRequest) {
    const target = this.config.target(channel);
    const auth = this.config.stkAuth(channel, target.credentials);
    return this.daraja.stkQuery(target, {
      businessShortCode: auth.businessShortCode,
      password: auth.password,
      timestamp: auth.timestamp,
      checkoutRequestId: req.checkoutRequestId!,
    });
  }

  private async finish(
    id: string,
    data: Partial<
      Pick<StkRequest, 'resultCode' | 'resultDesc' | 'mpesaReceipt' | 'inboundId' | 'paymentId'>
    > & {
      state: StkRequest['state'];
    },
  ) {
    await this.db.stkRequest.updateMany({
      where: { id, state: 'PENDING' },
      data: { ...data, completedAt: new Date() },
    });
  }

  /**
   * Scheduled: re-query requests pending for over 90 s (a lost callback); give up on those
   * over 10 min. A success found this way still needs the callback for its receipt, so it
   * stays pending until the callback arrives or the time runs out.
   */
  async sweep(now = Date.now()) {
    const pending = await this.prisma.stkRequest.findMany({
      where: { state: 'PENDING', createdAt: { lt: new Date(now - SWEEP_AFTER_MS) } },
      include: { channel: true },
      take: 200,
    });
    let finished = 0;
    for (const req of pending) {
      await runWithContext(emptyContext({ orgId: req.orgId }), async () => {
        try {
          if (!req.checkoutRequestId) {
            await this.finish(req.id, { state: 'FAILED', resultDesc: 'The prompt was never sent' });
            finished++;
            return;
          }
          const res = await this.query(req.channel, req);
          if (res.resultCode !== null && res.resultCode !== '0') {
            await this.finish(req.id, {
              state: stkStateFor(res.resultCode),
              resultCode: res.resultCode,
              resultDesc: res.resultDesc,
            });
            finished++;
          } else if (now - req.createdAt.getTime() > TIMEOUT_MS) {
            await this.finish(req.id, {
              state: 'TIMEOUT',
              resultDesc:
                res.resultCode === '0'
                  ? 'M-Pesa reported success but never sent the receipt. Check the M-Pesa statement and reconcile.'
                  : 'No answer from the phone in time',
            });
            finished++;
          }
        } catch (e) {
          this.log.error({ err: e, stkId: req.id }, 'STK sweep failed for a request');
        }
      });
    }
    return { checked: pending.length, finished };
  }
}
