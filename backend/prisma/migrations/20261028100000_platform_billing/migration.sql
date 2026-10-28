-- CreateEnum
CREATE TYPE "PlatformPayMethod" AS ENUM ('MPESA', 'BANK', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "PlatformPaySource" AS ENUM ('STK', 'C2B', 'MANUAL');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "billingRef" TEXT,
ADD COLUMN     "minimumOverride" BIGINT,
ADD COLUMN     "noSuspendUntil" DATE,
ADD COLUMN     "planId" UUID,
ADD COLUMN     "platformCredit" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "priceOverride" BIGINT,
ADD COLUMN     "trialEndsAt" DATE;

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pricePerUnit" BIGINT NOT NULL,
    "minimumMonthly" BIGINT NOT NULL DEFAULT 0,
    "trialDays" INTEGER NOT NULL DEFAULT 30,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_invoices" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "occupiedUnits" INTEGER NOT NULL,
    "rate" BIGINT NOT NULL,
    "minimum" BIGINT NOT NULL,
    "total" BIGINT NOT NULL,
    "amountPaid" BIGINT NOT NULL DEFAULT 0,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_payments" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "unallocated" BIGINT NOT NULL,
    "method" "PlatformPayMethod" NOT NULL,
    "source" "PlatformPaySource" NOT NULL,
    "reference" TEXT NOT NULL,
    "payerName" TEXT,
    "note" TEXT,
    "receivedAt" DATE NOT NULL,
    "recordedById" UUID,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_allocations" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_stk_requests" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "checkoutRequestId" TEXT,
    "state" "StkState" NOT NULL DEFAULT 'PENDING',
    "resultDesc" TEXT,
    "mpesaReceipt" TEXT,
    "paymentId" UUID,
    "idempotencyKey" TEXT,
    "requestedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "platform_stk_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "dueDays" INTEGER NOT NULL DEFAULT 10,
    "suspendAfterDays" INTEGER NOT NULL DEFAULT 21,
    "defaultPlanId" UUID,
    "paybill" TEXT,
    "darajaEnv" "DarajaEnv",
    "secretsEnc" BYTEA,
    "callbackToken" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "platform_invoices_number_key" ON "platform_invoices"("number");

-- CreateIndex
CREATE INDEX "platform_invoices_orgId_status_dueDate_idx" ON "platform_invoices"("orgId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "platform_payments_reference_key" ON "platform_payments"("reference");

-- CreateIndex
CREATE INDEX "platform_payments_orgId_receivedAt_idx" ON "platform_payments"("orgId", "receivedAt");

-- CreateIndex
CREATE INDEX "platform_allocations_invoiceId_idx" ON "platform_allocations"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_stk_requests_checkoutRequestId_key" ON "platform_stk_requests"("checkoutRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_stk_requests_idempotencyKey_key" ON "platform_stk_requests"("idempotencyKey");

-- CreateIndex
CREATE INDEX "platform_stk_requests_state_createdAt_idx" ON "platform_stk_requests"("state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "platform_settings_callbackToken_key" ON "platform_settings"("callbackToken");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_billingRef_key" ON "organizations"("billingRef");

-- AddForeignKey
ALTER TABLE "platform_allocations" ADD CONSTRAINT "platform_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "platform_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_allocations" ADD CONSTRAINT "platform_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "platform_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE UNIQUE INDEX "platform_invoices_one_live_per_period" ON "platform_invoices"("orgId", "period")
  WHERE "status" <> 'VOID';
ALTER TABLE "plans" ADD CONSTRAINT "plans_amounts_check" CHECK ("pricePerUnit" >= 0 AND "minimumMonthly" >= 0 AND "trialDays" BETWEEN 0 AND 365);
ALTER TABLE "platform_payments" ADD CONSTRAINT "platform_payments_amount_check" CHECK ("amount" > 0 AND "unallocated" BETWEEN 0 AND "amount");
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_single_row" CHECK ("id" = 1);
-- Existing organisations get billing account numbers in creation order.
UPDATE "organizations" o SET "billingRef" = 'H' || lpad(x.n::text, 5, '0')
  FROM (SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS n FROM "organizations") x
 WHERE x."id" = o."id" AND o."billingRef" IS NULL;
INSERT INTO "platform_settings" ("id", "updatedAt") VALUES (1, now()) ON CONFLICT DO NOTHING;
