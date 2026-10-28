-- CreateEnum
CREATE TYPE "DarajaEnv" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "InboundSource" AS ENUM ('MPESA_STK', 'MPESA_C2B');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'IGNORED');

-- CreateEnum
CREATE TYPE "MatchMethod" AS ENUM ('AUTO_STK', 'AUTO_ACCOUNT', 'AUTO_PHONE', 'MANUAL', 'EXISTING');

-- CreateEnum
CREATE TYPE "StkState" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT');

-- AlterTable
ALTER TABLE "payment_channels" ADD COLUMN     "c2bRegisteredAt" TIMESTAMP(3),
ADD COLUMN     "callbackToken" TEXT,
ADD COLUMN     "darajaEnv" "DarajaEnv",
ADD COLUMN     "secretsEnc" BYTEA;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "inboundId" UUID;

-- CreateTable
CREATE TABLE "inbound_transactions" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "source" "InboundSource" NOT NULL,
    "providerRef" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "payerName" TEXT,
    "payerPhone" TEXT,
    "accountRef" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB NOT NULL,
    "matchStatus" "MatchStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchedBy" "MatchMethod",
    "tenantId" UUID,
    "paymentId" UUID,
    "ignoredReason" TEXT,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stk_requests" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "invoiceIds" UUID[],
    "phone" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "accountRef" TEXT NOT NULL,
    "merchantRequestId" TEXT,
    "checkoutRequestId" TEXT,
    "state" "StkState" NOT NULL DEFAULT 'PENDING',
    "resultCode" TEXT,
    "resultDesc" TEXT,
    "mpesaReceipt" TEXT,
    "inboundId" UUID,
    "paymentId" UUID,
    "idempotencyKey" TEXT,
    "requestedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "stk_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbound_transactions_orgId_matchStatus_occurredAt_idx" ON "inbound_transactions"("orgId", "matchStatus", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_transactions_channelId_providerRef_key" ON "inbound_transactions"("channelId", "providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "stk_requests_checkoutRequestId_key" ON "stk_requests"("checkoutRequestId");

-- CreateIndex
CREATE INDEX "stk_requests_state_createdAt_idx" ON "stk_requests"("state", "createdAt");

-- CreateIndex
CREATE INDEX "stk_requests_tenantId_createdAt_idx" ON "stk_requests"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "stk_requests_orgId_idempotencyKey_key" ON "stk_requests"("orgId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "payment_channels_callbackToken_key" ON "payment_channels"("callbackToken");

-- CreateIndex
CREATE UNIQUE INDEX "payments_inboundId_key" ON "payments"("inboundId");

-- AddForeignKey
ALTER TABLE "inbound_transactions" ADD CONSTRAINT "inbound_transactions_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "payment_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stk_requests" ADD CONSTRAINT "stk_requests_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "payment_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "inbound_transactions" ADD CONSTRAINT "inbound_amount_check" CHECK ("amount" > 0);
ALTER TABLE "stk_requests" ADD CONSTRAINT "stk_amount_check" CHECK ("amount" > 0);
