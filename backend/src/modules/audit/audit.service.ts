import { Inject, Injectable } from '@nestjs/common';
import { currentContext, withoutOrgScope } from '../../common/context/request-context.js';
import { Prisma } from '../../generated/prisma/client.js';
import { DB, type Db, type Tx } from '../../prisma/prisma.module.js';

const REDACTED_KEYS = new Set([
  'password',
  'passwordHash',
  'tokenHash',
  'codeHash',
  'code',
  'token',
  'idNumber',
  'secrets',
  'secretsEnc',
  'payoutEnc',
]);

/** Deep copy with secrets/PII replaced, BigInt → string, Dates → ISO (JSON-safe). Pure. */
export function redact(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => redact(v)) as Prisma.InputJsonValue;
  if (typeof value === 'object') {
    const out: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACTED_KEYS.has(k) ? '[redacted]' : redact(v);
    }
    return out as Prisma.InputJsonValue;
  }
  return value as Prisma.InputJsonValue;
}

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  /** Defaults to the request's active organisation. */
  orgId?: string | null;
  /** Defaults to the request's user. */
  actorId?: string | null;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Pass the transaction the change runs in, so the record commits (or rolls back) with it. */
  async record(entry: AuditEntry, tx?: Tx): Promise<void> {
    const ctx = currentContext();
    const orgId = entry.orgId !== undefined ? entry.orgId : (ctx?.orgId ?? null);
    const write = () => this.write(entry, orgId, tx);
    // User-level events (orgId null) or platform events for another organisation are written
    // deliberately outside the caller's org scope.
    await (ctx?.orgId && orgId !== ctx.orgId ? withoutOrgScope(write) : write());
  }

  private async write(entry: AuditEntry, orgId: string | null, tx?: Tx): Promise<void> {
    const ctx = currentContext();
    const client = tx ?? this.db;
    await client.auditLog.create({
      data: {
        orgId,
        actorId: entry.actorId !== undefined ? entry.actorId : (ctx?.userId ?? null),
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        before: redact(entry.before) ?? Prisma.DbNull,
        after: redact(entry.after) ?? Prisma.DbNull,
        ip: ctx?.ip ?? null,
        requestId: ctx?.requestId ?? null,
      },
    });
  }
}
