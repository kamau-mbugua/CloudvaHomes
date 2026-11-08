import type { Tx } from '../../../prisma/prisma.module.js';

/** Organisation SMS accounts (balances, settings). Endpoints are added in Task 8 of the SMS plan. */
export class SmsAccountsService {
  /**
   * Every new organisation starts on KodiHub SMS with the platform's free units (spec call 8),
   * recorded as an "Opening balance" adjustment. Runs inside the organisation-creating transaction.
   */
  static async openAccount(tx: Tx, orgId: string): Promise<void> {
    const settings = await tx.platformSettings.findUnique({
      where: { id: 1 },
      select: { smsFreeUnits: true },
    });
    const units = settings?.smsFreeUnits ?? 100;
    await tx.smsAccount.create({ data: { orgId, balance: units } });
    if (units > 0) {
      await tx.smsLedgerEntry.create({
        data: { orgId, kind: 'ADJUSTMENT', units, balanceAfter: units, reason: 'Opening balance' },
      });
    }
  }
}

/** Adds (or, with a negative number, removes) units with a ledger entry; returns the new balance. */
export async function creditUnits(
  tx: Tx,
  orgId: string,
  units: number,
  entry: {
    kind: 'PURCHASE' | 'ADJUSTMENT';
    purchaseId?: string;
    reason?: string;
    createdById?: string | null;
  },
): Promise<number> {
  const rows = await tx.$queryRaw<{ balance: number }[]>`
    INSERT INTO "sms_accounts" ("orgId", "balance", "updatedAt") VALUES (${orgId}::uuid, ${units}, (now() AT TIME ZONE 'UTC'))
    ON CONFLICT ("orgId") DO UPDATE SET "balance" = "sms_accounts"."balance" + ${units}, "updatedAt" = (now() AT TIME ZONE 'UTC')
    RETURNING "balance"`;
  const balance = rows[0]!.balance;
  await tx.smsLedgerEntry.create({
    data: {
      orgId,
      kind: entry.kind,
      units,
      balanceAfter: balance,
      purchaseId: entry.purchaseId ?? null,
      reason: entry.reason ?? null,
      createdById: entry.createdById ?? null,
    },
  });
  return balance;
}
