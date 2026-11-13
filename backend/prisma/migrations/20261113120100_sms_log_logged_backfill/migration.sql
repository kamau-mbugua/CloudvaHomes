-- Messages recorded as "sent" through KodiHub's provider with no provider at all went only to
-- the server log. Mark them as not sent, and give back the units organisations were charged.
CREATE TEMP TABLE "logged_sms" AS
SELECT l."id", l."orgId", l."units"
  FROM "sms_logs" l
 WHERE l."status" = 'SENT' AND l."provider" IS NULL
   AND l."route" IN ('PLATFORM', 'PLATFORM_FALLBACK', 'PLATFORM_FREE');

INSERT INTO "sms_ledger" ("id", "orgId", "kind", "units", "balanceAfter", "smsLogId", "reason", "createdAt")
SELECT gen_random_uuid(), r."orgId", 'REFUND', r."units",
       a."balance" + sum(r."units") OVER (PARTITION BY r."orgId" ORDER BY r."id"),
       r."id", 'Not sent: no SMS provider was set up', (now() AT TIME ZONE 'UTC')
  FROM "logged_sms" r
  JOIN "sms_accounts" a ON a."orgId" = r."orgId"
 WHERE r."units" > 0
   AND EXISTS (SELECT 1 FROM "sms_ledger" c WHERE c."smsLogId" = r."id" AND c."kind" = 'CHARGE')
   AND NOT EXISTS (SELECT 1 FROM "sms_ledger" f WHERE f."smsLogId" = r."id" AND f."kind" = 'REFUND');

UPDATE "sms_accounts" a
   SET "balance" = a."balance" + g."units", "updatedAt" = (now() AT TIME ZONE 'UTC')
  FROM (SELECT e."orgId", sum(e."units")::int AS "units"
          FROM "sms_ledger" e JOIN "logged_sms" r ON r."id" = e."smsLogId"
         WHERE e."kind" = 'REFUND' AND e."reason" = 'Not sent: no SMS provider was set up'
         GROUP BY e."orgId") g
 WHERE a."orgId" = g."orgId";

UPDATE "sms_logs" l
   SET "status" = 'LOGGED', "units" = 0,
       "reason" = 'No SMS provider was set up, so this was only written to the server log.'
  FROM "logged_sms" r
 WHERE l."id" = r."id";

DROP TABLE "logged_sms";
