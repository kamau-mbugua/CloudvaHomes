-- Deposits entered at move-in before the deposit ledger existed become OPENING entries, so
-- depositHeld always equals the sum of a tenancy's ledger.
INSERT INTO "deposit_transactions" ("id", "orgId", "tenancyId", "kind", "amount", "note", "createdAt")
SELECT gen_random_uuid(), t."orgId", t."id", 'OPENING', t."depositHeld", 'Deposit held before Hodi', t."createdAt"
  FROM "tenancies" t
 WHERE t."depositHeld" > 0
   AND NOT EXISTS (SELECT 1 FROM "deposit_transactions" d WHERE d."tenancyId" = t."id");
