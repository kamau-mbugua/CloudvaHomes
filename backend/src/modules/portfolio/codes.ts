import type { Tx } from '../../prisma/prisma.module.js';

/**
 * Next human-readable code for an organisation, e.g. nextCode(tx, orgId, 'tenant', 'T', 5) →
 * "T00042". One atomic upsert: concurrent callers get distinct numbers, and a rolled-back
 * transaction gives its number back. Codes grow past the width rather than wrap.
 */
export async function nextCode(
  tx: Tx,
  orgId: string,
  name: string,
  prefix: string,
  width: number,
): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "org_counters" ("orgId", "name", "value") VALUES (${orgId}::uuid, ${name}, 1)
    ON CONFLICT ("orgId", "name") DO UPDATE SET "value" = "org_counters"."value" + 1
    RETURNING "value"`;
  return `${prefix}${String(rows[0]!.value).padStart(width, '0')}`;
}
