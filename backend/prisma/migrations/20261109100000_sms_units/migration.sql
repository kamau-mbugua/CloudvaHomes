-- Platform SMS vs organisation SMS (docs/specs/2026-11-08-sms-platform-and-org-design.md).
-- CreateEnum
CREATE TYPE "SmsMode" AS ENUM ('PLATFORM', 'OWN');

-- CreateEnum
CREATE TYPE "SmsProvider" AS ENUM ('AFRICASTALKING', 'TEXTSMS', 'HOSTPINNACLE');

-- CreateEnum
CREATE TYPE "SmsKind" AS ENUM ('PLATFORM', 'ORG');

-- CreateEnum
CREATE TYPE "SmsRoute" AS ENUM ('PLATFORM', 'ORG_PROVIDER', 'PLATFORM_FALLBACK', 'PLATFORM_FREE');

-- CreateEnum
CREATE TYPE "SmsLogStatus" AS ENUM ('SENT', 'FAILED', 'NO_UNITS');

-- CreateEnum
CREATE TYPE "SmsLedgerKind" AS ENUM ('PURCHASE', 'ADJUSTMENT', 'CHARGE', 'REFUND');

-- CreateEnum
CREATE TYPE "SmsPurchaseState" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- AlterTable
ALTER TABLE "platform_stk_requests" ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'INVOICE';

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "hostpinnacleKeyEnc" BYTEA,
ADD COLUMN     "hostpinnaclePasswordEnc" BYTEA,
ADD COLUMN     "hostpinnacleSenderId" TEXT,
ADD COLUMN     "hostpinnacleUserId" TEXT,
ADD COLUMN     "smsBundles" INTEGER[] DEFAULT ARRAY[500, 1000, 5000]::INTEGER[],
ADD COLUMN     "smsFreeUnits" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "smsMinUnits" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "smsProvider" "SmsProvider" NOT NULL DEFAULT 'AFRICASTALKING',
ADD COLUMN     "smsUnitPrice" BIGINT NOT NULL DEFAULT 80,
ADD COLUMN     "textsmsKeyEnc" BYTEA,
ADD COLUMN     "textsmsPartnerId" TEXT,
ADD COLUMN     "textsmsSenderId" TEXT;

-- CreateTable
CREATE TABLE "sms_accounts" (
    "orgId" UUID NOT NULL,
    "mode" "SmsMode" NOT NULL DEFAULT 'PLATFORM',
    "provider" "SmsProvider",
    "providerUser" TEXT,
    "providerKeyEnc" BYTEA,
    "providerSecretEnc" BYTEA,
    "senderId" TEXT,
    "sandbox" BOOLEAN NOT NULL DEFAULT false,
    "unitPrice" BIGINT,
    "lowBalanceLevel" INTEGER NOT NULL DEFAULT 50,
    "fallbackToPlatform" BOOLEAN NOT NULL DEFAULT false,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "lowWarnedOn" DATE,
    "emptyWarnedOn" DATE,
    "failWarnedOn" DATE,
    "failingSince" TIMESTAMP(3),
    "lastFailReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_accounts_pkey" PRIMARY KEY ("orgId")
);

-- CreateTable
CREATE TABLE "sms_logs" (
    "id" UUID NOT NULL,
    "orgId" UUID,
    "kind" "SmsKind" NOT NULL,
    "type" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 0,
    "route" "SmsRoute",
    "provider" "SmsProvider",
    "providerMessageId" TEXT,
    "status" "SmsLogStatus" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_ledger" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "kind" "SmsLedgerKind" NOT NULL,
    "units" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "smsLogId" UUID,
    "purchaseId" UUID,
    "reason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_purchases" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "units" INTEGER NOT NULL,
    "unitPrice" BIGINT NOT NULL,
    "amount" BIGINT NOT NULL,
    "state" "SmsPurchaseState" NOT NULL DEFAULT 'PENDING',
    "phone" TEXT,
    "stkRequestId" UUID,
    "mpesaReceipt" TEXT,
    "source" "PlatformPaySource" NOT NULL,
    "requestedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "sms_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sms_logs_orgId_createdAt_idx" ON "sms_logs"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "sms_ledger_orgId_createdAt_idx" ON "sms_ledger"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sms_purchases_stkRequestId_key" ON "sms_purchases"("stkRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "sms_purchases_mpesaReceipt_key" ON "sms_purchases"("mpesaReceipt");

-- CreateIndex
CREATE INDEX "sms_purchases_orgId_createdAt_idx" ON "sms_purchases"("orgId", "createdAt");


-- Every existing organisation gets an SMS account with the opening balance (spec call 8).
INSERT INTO "sms_accounts" ("orgId", "balance", "updatedAt")
SELECT "id", 100, (now() AT TIME ZONE 'UTC') FROM "organizations";
INSERT INTO "sms_ledger" ("id", "orgId", "kind", "units", "balanceAfter", "reason", "createdAt")
SELECT gen_random_uuid(), "id", 'ADJUSTMENT', 100, 100, 'Opening balance', (now() AT TIME ZONE 'UTC') FROM "organizations";

-- Managers and accountants can see SMS balance and usage (Owner roles are computed in code).
UPDATE "roles" SET "permissions" = array_append("permissions", 'sms:view')
 WHERE "systemKey" IN ('MANAGER', 'ACCOUNTANT') AND NOT ('sms:view' = ANY("permissions"));
