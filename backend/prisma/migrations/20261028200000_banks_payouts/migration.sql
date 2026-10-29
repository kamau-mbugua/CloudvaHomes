-- CreateEnum
CREATE TYPE "PayoutAccountKind" AS ENUM ('MPESA_B2C');

-- CreateEnum
CREATE TYPE "PayoutState" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'UNCERTAIN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InboundSource" ADD VALUE 'BANK_IPN';
ALTER TYPE "InboundSource" ADD VALUE 'BANK_STATEMENT';

-- AlterEnum
ALTER TYPE "RemittanceStatus" ADD VALUE 'SENDING';

-- AlterTable
ALTER TABLE "payment_channels" ADD COLUMN     "bankAdapter" TEXT,
ADD COLUMN     "statementMapping" JSONB;

-- CreateTable
CREATE TABLE "statement_imports" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "rows" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "created" INTEGER NOT NULL,
    "duplicates" INTEGER NOT NULL,
    "matched" INTEGER NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statement_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_accounts" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "kind" "PayoutAccountKind" NOT NULL,
    "name" TEXT NOT NULL,
    "shortcode" TEXT NOT NULL,
    "darajaEnv" "DarajaEnv" NOT NULL,
    "initiatorName" TEXT NOT NULL,
    "secretsEnc" BYTEA NOT NULL,
    "callbackToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "remittanceId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "phone" TEXT NOT NULL,
    "state" "PayoutState" NOT NULL DEFAULT 'PENDING',
    "originatorConversationId" TEXT NOT NULL,
    "conversationId" TEXT,
    "receipt" TEXT,
    "resultCode" TEXT,
    "resultDesc" TEXT,
    "idempotencyKey" TEXT,
    "requestedById" UUID NOT NULL,
    "resolvedById" UUID,
    "resolvedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "statement_imports_orgId_channelId_createdAt_idx" ON "statement_imports"("orgId", "channelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payout_accounts_callbackToken_key" ON "payout_accounts"("callbackToken");

-- CreateIndex
CREATE UNIQUE INDEX "payout_accounts_orgId_kind_key" ON "payout_accounts"("orgId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_originatorConversationId_key" ON "payouts"("originatorConversationId");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_idempotencyKey_key" ON "payouts"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payouts_orgId_remittanceId_idx" ON "payouts"("orgId", "remittanceId");

-- CreateIndex
CREATE INDEX "payouts_state_createdAt_idx" ON "payouts"("state", "createdAt");

-- AddForeignKey
ALTER TABLE "statement_imports" ADD CONSTRAINT "statement_imports_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "payment_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "payout_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- At most one payout in flight (or awaiting a person's check) per remittance.
CREATE UNIQUE INDEX "payouts_one_open_per_remittance" ON "payouts" ("remittanceId") WHERE "state" IN ('PENDING', 'UNCERTAIN');
