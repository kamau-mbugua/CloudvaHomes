import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { FieldCipher } from '../../common/crypto/field-cipher.js';
import { emptyContext, runWithContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { PayoutAccount } from '../../generated/prisma/client.js';
import { violatesUnique } from '../../prisma/errors.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { orgContext, requireStepUp } from '../auth/decorators.js';
import { todayInNairobi } from '../billing/billing-math.js';
import { payoutHookUrls } from '../banks/urls.js';
import { DarajaClient, type DarajaTarget } from '../mpesa/daraja.client.js';
import { parseB2cResult, toMsisdn } from '../mpesa/daraja.js';
import type { BulkFileQueryDto, ResolvePayoutDto, SetB2cAccountDto } from './payouts.dto.js';
import { RemittancesService } from './remittances.service.js';

interface B2cSecrets {
  consumerKey: string;
  consumerSecret: string;
  securityCredential: string;
}

/** A payout with no result after this long is UNCERTAIN: a person must check M-Pesa. */
export const PAYOUT_ANSWER_MS = 30 * 60_000;

const stateError = (message: string) => AppError.conflict(message, 'REMITTANCE_STATE');
const secretContext = (a: Pick<PayoutAccount, 'orgId' | 'id'>) =>
  `${a.orgId}:payout.${a.id}.secrets`;

/**
 * Money out (design §5.3, phase 10): M-Pesa B2C remittance payouts and bank bulk files.
 * A payout is never retried automatically; anything unclear waits for a person.
 */
@Injectable()
export class PayoutsService {
  private readonly log = new Logger(PayoutsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly audit: AuditService,
    private readonly daraja: DarajaClient,
    private readonly remittances: RemittancesService,
  ) {}

  // ── Payout accounts ──

  private viewAccount(a: PayoutAccount) {
    return {
      id: a.id,
      kind: a.kind,
      name: a.name,
      shortcode: a.shortcode,
      environment: a.darajaEnv,
      initiatorName: a.initiatorName,
      configured: true,
      callbackUrls: payoutHookUrls(this.env, a.callbackToken),
      updatedAt: a.updatedAt,
    };
  }

  async accounts() {
    const rows = await this.db.payoutAccount.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map((a) => this.viewAccount(a));
  }

  async setB2c(dto: SetB2cAccountDto) {
    requireStepUp();
    const { orgId } = orgContext();
    const existing = await this.db.payoutAccount.findFirst({ where: { kind: 'MPESA_B2C' } });
    const previous = existing ? this.secrets(existing) : null;
    const secrets: B2cSecrets = {
      consumerKey: dto.consumerKey?.trim() || previous?.consumerKey || '',
      consumerSecret: dto.consumerSecret?.trim() || previous?.consumerSecret || '',
      securityCredential: dto.securityCredential?.trim() || previous?.securityCredential || '',
    };
    for (const [k, v] of Object.entries(secrets)) {
      if (!v) throw AppError.fieldInvalid(k, 'Required when setting up the account');
    }
    const row = await this.db.$transaction(async (tx) => {
      const id = existing?.id ?? randomUUID();
      const data = {
        name: dto.name.trim(),
        shortcode: dto.shortcode,
        darajaEnv: dto.environment,
        initiatorName: dto.initiatorName.trim(),
        secretsEnc: this.cipher.encrypt(JSON.stringify(secrets), secretContext({ orgId, id })),
      };
      const saved = existing
        ? await tx.payoutAccount.update({ where: { id }, data })
        : await tx.payoutAccount.create({
            data: {
              id,
              orgId,
              kind: 'MPESA_B2C',
              callbackToken: randomBytes(32).toString('base64url'),
              ...data,
            },
          });
      await this.audit.record(
        {
          action: existing ? 'payout_account.update' : 'payout_account.create',
          entity: 'payout_account',
          entityId: id,
          after: {
            name: data.name,
            shortcode: data.shortcode,
            environment: data.darajaEnv,
            keysChanged: !!(dto.consumerKey || dto.consumerSecret || dto.securityCredential),
          },
        },
        tx,
      );
      return saved;
    });
    return this.viewAccount(row);
  }

  async removeB2c() {
    requireStepUp();
    const a = await this.db.payoutAccount.findFirst({ where: { kind: 'MPESA_B2C' } });
    if (!a) throw AppError.notFound('Payout account');
    if (await this.db.payout.count({ where: { accountId: a.id } })) {
      throw AppError.conflict(
        'Payouts were sent from this account, so it stays for the record. Change its keys instead.',
        'PAYOUT_ACCOUNT_IN_USE',
      );
    }
    await this.db.$transaction(async (tx) => {
      await tx.payoutAccount.delete({ where: { id: a.id } });
      await this.audit.record(
        { action: 'payout_account.remove', entity: 'payout_account', entityId: a.id },
        tx,
      );
    });
  }

  private secrets(a: PayoutAccount): B2cSecrets | null {
    if (!a.secretsEnc.length) return null;
    return JSON.parse(this.cipher.decrypt(a.secretsEnc, secretContext(a))) as B2cSecrets;
  }

  private target(a: PayoutAccount): { target: DarajaTarget; secrets: B2cSecrets } {
    const secrets = this.secrets(a);
    if (!secrets)
      throw AppError.conflict('Set up the M-Pesa payout account first', 'NO_PAYOUT_ACCOUNT');
    return {
      target: {
        key: `payout:${a.id}`,
        environment: a.darajaEnv,
        credentials: { consumerKey: secrets.consumerKey, consumerSecret: secrets.consumerSecret },
      },
      secrets,
    };
  }

  // ── Sending a remittance ──

  async send(remittanceId: string, idempotencyKey?: string) {
    requireStepUp();
    const ctx = orgContext();
    if (idempotencyKey) {
      const done = await this.db.payout.findFirst({ where: { idempotencyKey } });
      if (done) {
        if (done.remittanceId !== remittanceId) {
          throw AppError.conflict(
            'This Idempotency-Key was already used for another remittance',
            'IDEMPOTENCY_MISMATCH',
          );
        }
        return this.remittances.get(remittanceId);
      }
    }
    const r = await this.remittances.find(remittanceId);
    if (r.status !== 'APPROVED') throw stateError('Only an approved remittance can be sent');
    if (r.direction !== 'TO_LANDLORD')
      throw stateError('This remittance is owed by the landlord, not to them');
    if (r.approvedById === ctx.userId) {
      throw AppError.conflict(
        'Someone other than the person who approved it must send it',
        'SAME_PERSON',
      );
    }
    if (r.net <= 0n || r.net % 100n !== 0n) {
      throw new AppError(
        422,
        'WHOLE_SHILLINGS',
        'M-Pesa sends whole shillings only. Pay this one by bank or cheque.',
      );
    }
    const landlord = await this.db.landlord.findUniqueOrThrow({ where: { id: r.landlordId } });
    if (landlord.payoutMethod !== 'MPESA' || !landlord.payoutEnc) {
      throw AppError.conflict('The landlord’s payout method isn’t M-Pesa', 'PAYOUT_NOT_MPESA');
    }
    // The approver saw the payout destination at approval time; a later change needs a new approval.
    if (landlord.payoutUpdatedAt && r.approvedAt && landlord.payoutUpdatedAt > r.approvedAt) {
      throw AppError.conflict(
        'The landlord’s payout details changed after this was approved. Cancel it and draft a new one.',
        'PAYOUT_CHANGED',
      );
    }
    const details = JSON.parse(
      this.cipher.decrypt(landlord.payoutEnc, `${landlord.orgId}:landlord.${landlord.id}.payout`),
    ) as { phone?: string };
    if (!details.phone)
      throw AppError.conflict('The landlord’s payout method isn’t M-Pesa', 'PAYOUT_NOT_MPESA');
    const account = await this.db.payoutAccount.findFirst({ where: { kind: 'MPESA_B2C' } });
    if (!account)
      throw AppError.conflict('Set up the M-Pesa payout account first', 'NO_PAYOUT_ACCOUNT');
    const { target, secrets } = this.target(account);

    // Claim the remittance (APPROVED → SENDING) and create the payout in one step.
    const ourRef = `HODI-${randomUUID()}`;
    let payoutId: string;
    try {
      payoutId = await this.db.$transaction(async (tx) => {
        const { count } = await tx.remittance.updateMany({
          where: { id: r.id, status: 'APPROVED' },
          data: { status: 'SENDING' },
        });
        if (!count) throw stateError('Someone else just changed this remittance');
        const p = await tx.payout.create({
          data: {
            orgId: ctx.orgId,
            remittanceId: r.id,
            accountId: account.id,
            amount: r.net,
            phone: details.phone!,
            originatorConversationId: ourRef,
            idempotencyKey: idempotencyKey ?? null,
            requestedById: ctx.userId,
          },
        });
        await this.audit.record(
          {
            action: 'payout.send',
            entity: 'remittance',
            entityId: r.id,
            after: { number: r.number, amount: r.net, to: landlord.payoutHint },
          },
          tx,
        );
        return p.id;
      });
    } catch (e) {
      if (idempotencyKey && violatesUnique(e, 'idempotencyKey'))
        return this.remittances.get(remittanceId);
      throw e;
    }

    const urls = payoutHookUrls(this.env, account.callbackToken);
    try {
      const accepted = await this.daraja.b2c(target, {
        initiatorName: account.initiatorName,
        securityCredential: secrets.securityCredential,
        shortcode: account.shortcode,
        phone: toMsisdn(details.phone),
        amountKes: Number(r.net / 100n),
        remarks: `${r.number} ${r.period}`.slice(0, 100),
        occasion: r.number,
        resultUrl: urls.result,
        timeoutUrl: urls.timeout,
      });
      await this.db.payout.update({
        where: { id: payoutId },
        data: {
          originatorConversationId: accepted.originatorConversationId,
          conversationId: accepted.conversationId,
        },
      });
    } catch (e) {
      if (e instanceof AppError) {
        // Safaricom answered and refused it: nothing was sent, back to APPROVED with the reason.
        await this.fail(payoutId, r.id, null, e.message);
        throw e;
      }
      // No clear answer (network, timeout): M-Pesa may have queued it. Never resend blindly.
      this.log.error({ err: e, payoutId }, 'B2C request without a clear answer');
      await this.db.payout.updateMany({
        where: { id: payoutId, state: 'PENDING' },
        data: {
          state: 'UNCERTAIN',
          resultDesc:
            'Lost contact with M-Pesa while sending. Check the B2C statement before doing anything.',
        },
      });
    }
    return this.remittances.get(remittanceId);
  }

  private async fail(payoutId: string, remittanceId: string, code: string | null, desc: string) {
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.payout.updateMany({
        where: { id: payoutId, state: { in: ['PENDING', 'UNCERTAIN'] } },
        data: { state: 'FAILED', resultCode: code, resultDesc: desc, completedAt: new Date() },
      });
      if (!count) return;
      await tx.remittance.updateMany({
        where: { id: remittanceId, status: 'SENDING' },
        data: { status: 'APPROVED' },
      });
      await this.audit.record(
        {
          action: 'payout.failed',
          entity: 'remittance',
          entityId: remittanceId,
          actorId: null,
          after: { code, desc },
        },
        tx,
      );
    });
  }

  private async succeed(payoutId: string, receipt: string, userId: string | null, note?: string) {
    const p = await this.db.payout.findUniqueOrThrow({ where: { id: payoutId } });
    const r = await this.db.remittance.findUniqueOrThrow({
      where: { id: p.remittanceId },
      include: { landlord: true },
    });
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.payout.updateMany({
        where: { id: payoutId, state: { in: ['PENDING', 'UNCERTAIN'] } },
        data: {
          state: 'SUCCESS',
          receipt,
          completedAt: new Date(),
          ...(userId ? { resolvedById: userId, resolvedNote: note ?? null } : {}),
        },
      });
      if (!count) return; // a retried callback
      await this.remittances.markPaid(tx, r, 'SENDING', {
        method: 'MPESA',
        reference: receipt,
        paidAt: todayInNairobi(),
        // Paid by whoever sent it (or confirmed it by hand), not "someone".
        userId: userId ?? p.requestedById,
        masked: r.landlord.payoutHint,
      });
    });
  }

  /** Safaricom's B2C result for a payout account (token + IP already checked by the controller). */
  async handleResult(token: string, body: unknown, timedOut = false) {
    const account = await this.prisma.payoutAccount.findUnique({ where: { callbackToken: token } });
    if (!account) throw AppError.notFound('Webhook');
    const res = parseB2cResult(body);
    if (!res) {
      this.log.warn({ accountId: account.id }, 'B2C callback that could not be parsed');
      return;
    }
    await runWithContext(emptyContext({ orgId: account.orgId }), async () => {
      const p = await this.db.payout.findFirst({
        where: { accountId: account.id, originatorConversationId: res.originatorConversationId },
      });
      // Both ids must match what Safaricom gave us when it accepted the request.
      if (
        !p ||
        (p.conversationId && res.conversationId && p.conversationId !== res.conversationId)
      ) {
        this.log.warn({ accountId: account.id }, 'B2C callback for an unknown payout');
        return;
      }
      if (p.state !== 'PENDING') return;
      if (timedOut) {
        await this.db.payout.updateMany({
          where: { id: p.id, state: 'PENDING' },
          data: {
            state: 'UNCERTAIN',
            resultDesc: 'M-Pesa timed out before confirming. Check the B2C statement.',
          },
        });
        return;
      }
      if (res.resultCode === '0' && res.receipt) {
        if (res.amount !== null && res.amount !== p.amount) {
          this.log.error({ payoutId: p.id }, 'B2C result amount differs from the payout');
          await this.db.payout.updateMany({
            where: { id: p.id, state: 'PENDING' },
            data: {
              state: 'UNCERTAIN',
              resultDesc: 'M-Pesa reported a different amount. Check the B2C statement.',
            },
          });
          return;
        }
        await this.succeed(p.id, res.receipt, null);
      } else {
        await this.fail(
          p.id,
          p.remittanceId,
          res.resultCode,
          res.resultDesc || 'M-Pesa declined the payment',
        );
      }
    });
  }

  /** A person's answer for an UNCERTAIN payout, after checking the M-Pesa statement. */
  async resolve(remittanceId: string, dto: ResolvePayoutDto) {
    requireStepUp();
    const ctx = orgContext();
    await this.remittances.find(remittanceId);
    const p = await this.db.payout.findFirst({ where: { remittanceId, state: 'UNCERTAIN' } });
    if (!p)
      throw AppError.conflict('There is no unconfirmed payout to resolve', 'REMITTANCE_STATE');
    if (dto.outcome === 'PAID') {
      await this.succeed(p.id, dto.receipt!.toUpperCase(), ctx.userId, dto.note.trim());
    } else {
      await this.db.payout.update({
        where: { id: p.id },
        data: { resolvedById: ctx.userId, resolvedNote: dto.note.trim() },
      });
      await this.fail(
        p.id,
        remittanceId,
        null,
        `Not paid (checked by a person): ${dto.note.trim()}`,
      );
    }
    await this.audit.record({
      action: 'payout.resolve',
      entity: 'remittance',
      entityId: remittanceId,
      after: { outcome: dto.outcome, receipt: dto.receipt ?? null, note: dto.note.trim() },
    });
    return this.remittances.get(remittanceId);
  }

  /** Scheduled: PENDING payouts with no answer for 30 minutes become UNCERTAIN. Never resent. */
  async sweep(now = Date.now()) {
    const { count } = await this.prisma.payout.updateMany({
      where: { state: 'PENDING', createdAt: { lt: new Date(now - PAYOUT_ANSWER_MS) } },
      data: { state: 'UNCERTAIN', resultDesc: 'No answer from M-Pesa. Check the B2C statement.' },
    });
    return { uncertain: count };
  }

  // ── Bank bulk-payment file ──

  async bulkFile(q: BulkFileQueryDto) {
    requireStepUp();
    const ids = [...new Set(q.ids.split(','))];
    const rows = await Promise.all(ids.map((id) => this.remittances.find(id)));
    const lines = [['Beneficiary', 'Bank', 'Branch', 'Account number', 'Amount', 'Reference']];
    let total = 0n;
    for (const r of rows) {
      if (r.status !== 'APPROVED' || r.direction !== 'TO_LANDLORD') {
        throw stateError(`${r.number} isn’t an approved payout to a landlord`);
      }
      const l = await this.db.landlord.findUniqueOrThrow({ where: { id: r.landlordId } });
      if (l.payoutMethod !== 'BANK' || !l.payoutEnc) {
        throw AppError.conflict(`${r.number}: the landlord isn’t paid by bank`, 'PAYOUT_NOT_BANK');
      }
      const d = JSON.parse(
        this.cipher.decrypt(l.payoutEnc, `${l.orgId}:landlord.${l.id}.payout`),
      ) as Record<string, string>;
      lines.push([
        d.accountName ?? l.name,
        d.bankName ?? '',
        d.branch ?? '',
        d.accountNumber ?? '',
        moneyPlain(r.net),
        r.number,
      ]);
      total += r.net;
    }
    await this.audit.record({
      action: 'remittance.bulk_file',
      entity: 'remittance',
      entityId: null,
      after: { numbers: rows.map((r) => r.number), total },
    });
    return lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
}

/** 123450n → "1234.50" (no grouping: bank upload files want plain numbers). */
function moneyPlain(cents: bigint) {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

/** Quotes when needed; a leading =,+,-,@ is neutralised so spreadsheets don't run it. */
function csvCell(v: string) {
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
