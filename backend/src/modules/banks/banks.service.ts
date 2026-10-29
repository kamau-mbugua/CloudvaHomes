import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { FieldCipher } from '../../common/crypto/field-cipher.js';
import {
  currentContext,
  emptyContext,
  runWithContext,
} from '../../common/context/request-context.js';
import { parseDateOnly } from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { PaymentChannel, Prisma } from '../../generated/prisma/client.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { orgContext, requireStepUp } from '../auth/decorators.js';
import { InboundService } from '../mpesa/inbound.service.js';
import { narrativeRef } from '../mpesa/matching.js';
import { ChannelsService } from '../payments/channels/channels.service.js';
import { BankPayloadError, bankAdapter } from './bank-adapter.js';
import { guessMapping, parseCsv, readStatement, type StatementMapping } from './statement-csv.js';
import { bankHookUrl } from './urls.js';

export const MAX_STATEMENT_BYTES = 2 * 1024 * 1024;

const secretContext = (c: Pick<PaymentChannel, 'orgId' | 'id'>) =>
  `${c.orgId}:channel.${c.id}.bank-webhook`;

const csvInvalid = (message: string) => new AppError(422, 'CSV_INVALID', message);

/**
 * Bank money-in (design §5.2): CSV statements and signed notifications become
 * InboundTransactions and go through the same matching as M-Pesa.
 */
@Injectable()
export class BanksService {
  private readonly log = new Logger(BanksService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly audit: AuditService,
    private readonly channels: ChannelsService,
    private readonly inbound: InboundService,
  ) {}

  private async bankChannel(id: string) {
    const c = await this.channels.find(id);
    if (c.kind !== 'BANK_ACCOUNT') {
      throw new AppError(
        422,
        'NOT_BANK_CHANNEL',
        'Only bank account channels take bank statements',
      );
    }
    return c;
  }

  // ── CSV statements ──

  private rowsOf(file?: { buffer: Buffer; size: number }) {
    if (!file?.size) throw csvInvalid('Choose a CSV file');
    if (file.size > MAX_STATEMENT_BYTES) throw csvInvalid('The file is larger than 2 MB; split it');
    const rows = parseCsv(file.buffer.toString('utf8'));
    if (rows.length < 2) throw csvInvalid('The file has no rows under the header');
    return rows;
  }

  private mappingFrom(raw: string | undefined, fallback: unknown): StatementMapping | null {
    const value = raw ? safeJson(raw) : fallback;
    if (!value || typeof value !== 'object') return null;
    const m = value as Record<string, unknown>;
    const str = (k: string) => (typeof m[k] === 'string' && m[k] ? (m[k] as string) : undefined);
    if (!str('date') || !str('reference') || !(str('amount') || str('credit'))) return null;
    return {
      date: str('date')!,
      dateFormat: m.dateFormat === 'YMD' ? 'YMD' : 'DMY',
      reference: str('reference')!,
      ...(str('amount')
        ? { amount: str('amount') }
        : { credit: str('credit'), debit: str('debit') }),
      transactionId: str('transactionId'),
      payer: str('payer'),
    };
  }

  async preview(channelId: string, file?: { buffer: Buffer; size: number }, mapping?: string) {
    const c = await this.bankChannel(channelId);
    const rows = this.rowsOf(file);
    const headers = rows[0]!;
    const chosen =
      this.mappingFrom(mapping, undefined) ??
      this.mappingFrom(undefined, fitsHeaders(c.statementMapping, headers));
    const guessed =
      chosen ??
      guessMapping(
        headers,
        rows.slice(1, 6).map((r) => r[0] ?? ''),
      );
    const parsed = chosen ? readStatement(rows, chosen) : null;
    return {
      headers,
      sample: rows.slice(1, 11),
      mapping: guessed,
      parsed: parsed
        ? {
            credits: parsed.credits.length,
            total: parsed.credits.reduce((s, x) => s + x.amount, 0n),
            skipped: parsed.skipped,
            errors: parsed.errors.slice(0, 50),
          }
        : null,
    };
  }

  async importStatement(
    channelId: string,
    file: { buffer: Buffer; size: number; originalname?: string } | undefined,
    mappingRaw: string | undefined,
  ) {
    const ctx = orgContext();
    const c = await this.bankChannel(channelId);
    const rows = this.rowsOf(file);
    const mapping = this.mappingFrom(mappingRaw, undefined);
    if (!mapping) throw csvInvalid('Choose the date, amount (or credit) and reference columns');
    const { credits, errors } = readStatement(rows, mapping);
    if (errors.some((e) => e.row === 0)) throw csvInvalid(errors[0]!.message);
    const filename = (file?.originalname ?? 'statement.csv').slice(0, 200);

    let created = 0;
    let matched = 0;
    for (const cr of credits) {
      const r = await this.inbound.receive(c, {
        source: 'BANK_STATEMENT',
        providerRef: cr.providerRef,
        amount: cr.amount,
        payerName: cr.payer,
        payerPhone: null,
        accountRef: narrativeRef(cr.reference),
        occurredAt: parseDateOnly(cr.occurredAt),
        raw: {
          file: filename,
          row: cr.row,
          date: cr.occurredAt,
          reference: cr.reference,
          transactionId: cr.transactionId,
          payer: cr.payer,
        },
      });
      if (!r.replay) created++;
      if (!r.replay && r.paymentId) matched++;
    }

    const record = await this.db.$transaction(async (tx) => {
      await tx.paymentChannel.update({
        where: { id: c.id },
        data: { statementMapping: mapping as unknown as Prisma.InputJsonValue },
      });
      const imp = await tx.statementImport.create({
        data: {
          orgId: ctx.orgId,
          channelId: c.id,
          filename,
          rows: rows.length - 1,
          credits: credits.length,
          created,
          duplicates: credits.length - created,
          matched,
          createdById: ctx.userId,
        },
      });
      await this.audit.record(
        {
          action: 'bank.statement_import',
          entity: 'payment_channel',
          entityId: c.id,
          after: { filename, credits: credits.length, created, matched },
        },
        tx,
      );
      return imp;
    });
    return { ...toImport(record), errors: errors.slice(0, 50) };
  }

  async imports(channelId: string) {
    await this.bankChannel(channelId);
    const rows = await this.db.statementImport.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map(toImport);
  }

  // ── Notifications ──

  /** Turns notifications on (or replaces the secret). The secret is returned this once. */
  async enableWebhook(channelId: string, adapter: string) {
    requireStepUp();
    const c = await this.bankChannel(channelId);
    if (!bankAdapter(adapter)) throw AppError.fieldInvalid('adapter', 'Unknown bank format');
    const secret = randomBytes(32).toString('base64url');
    const row = await this.db.$transaction(async (tx) => {
      const updated = await tx.paymentChannel.update({
        where: { id: c.id },
        data: {
          bankAdapter: adapter,
          secretsEnc: this.cipher.encrypt(secret, secretContext(c)),
          callbackToken: c.callbackToken ?? randomBytes(32).toString('base64url'),
        },
      });
      await this.audit.record(
        {
          action: 'bank.webhook_enable',
          entity: 'payment_channel',
          entityId: c.id,
          after: { adapter, replacedSecret: !!c.secretsEnc },
        },
        tx,
      );
      return updated;
    });
    return { adapter, url: bankHookUrl(this.env, row.callbackToken!), secret };
  }

  async disableWebhook(channelId: string) {
    requireStepUp();
    const c = await this.bankChannel(channelId);
    await this.db.$transaction(async (tx) => {
      await tx.paymentChannel.update({
        where: { id: c.id },
        data: { bankAdapter: null, secretsEnc: null, callbackToken: null },
      });
      await this.audit.record(
        { action: 'bank.webhook_disable', entity: 'payment_channel', entityId: c.id },
        tx,
      );
    });
  }

  /**
   * A bank's notification (public: proven by the URL token and the body signature), run as
   * the channel's organisation. 404 for an unknown token, 401 for a bad signature.
   */
  async receiveWebhook(
    token: string,
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | undefined,
  ) {
    const c = await this.prisma.paymentChannel.findUnique({ where: { callbackToken: token } });
    const adapter = bankAdapter(c?.bankAdapter);
    if (!c || c.kind !== 'BANK_ACCOUNT' || !adapter || !c.secretsEnc || c.status !== 'ACTIVE') {
      throw AppError.notFound('Webhook');
    }
    const secret = this.cipher.decrypt(c.secretsEnc, secretContext(c));
    if (!rawBody || !adapter.verify(headers, rawBody, secret)) {
      this.log.warn({ channelId: c.id }, 'Bank notification with a bad signature');
      throw AppError.unauthenticated('BAD_SIGNATURE', 'Signature check failed');
    }
    let credits;
    try {
      credits = adapter.parse(rawBody);
    } catch (e) {
      if (e instanceof BankPayloadError) throw new AppError(422, 'CSV_INVALID', e.message);
      throw e;
    }
    const ctx = currentContext();
    return runWithContext(
      emptyContext({ orgId: c.orgId, requestId: ctx?.requestId ?? null, ip: ctx?.ip ?? null }),
      async () => {
        let created = 0;
        for (const cr of credits) {
          const r = await this.inbound.receive(c, {
            source: 'BANK_IPN',
            providerRef: cr.transactionId,
            amount: cr.amount,
            payerName: cr.payerName,
            payerPhone: null,
            accountRef: narrativeRef(cr.reference),
            occurredAt: cr.occurredAt,
            raw: {
              adapter: adapter.code,
              transactionId: cr.transactionId,
              reference: cr.reference,
              payerName: cr.payerName,
              payerAccount: cr.payerAccount,
              occurredAt: cr.occurredAt.toISOString(),
            },
          });
          if (!r.replay) created++;
        }
        return { received: credits.length, created };
      },
    );
  }
}

function toImport(i: {
  id: string;
  filename: string;
  rows: number;
  credits: number;
  created: number;
  duplicates: number;
  matched: number;
  createdAt: Date;
}) {
  return {
    id: i.id,
    filename: i.filename,
    rows: i.rows,
    credits: i.credits,
    created: i.created,
    duplicates: i.duplicates,
    matched: i.matched,
    createdAt: i.createdAt,
  };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw csvInvalid('mapping must be JSON');
  }
}

/** The saved mapping, only if every column it names is in this file. */
function fitsHeaders(saved: unknown, headers: string[]) {
  if (!saved || typeof saved !== 'object') return undefined;
  const names = Object.entries(saved as Record<string, unknown>)
    .filter(([k, v]) => k !== 'dateFormat' && typeof v === 'string')
    .map(([, v]) => v as string);
  return names.every((n) => headers.includes(n)) ? saved : undefined;
}
