-- CreateEnum
CREATE TYPE "ChannelKind" AS ENUM ('MPESA_PAYBILL', 'MPESA_TILL', 'BANK_ACCOUNT', 'CASH', 'CHEQUE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MPESA_PAYBILL', 'MPESA_TILL', 'BANK_ACCOUNT', 'CASH', 'CHEQUE', 'DEPOSIT');

-- CreateEnum
CREATE TYPE "DepositKind" AS ENUM ('OPENING', 'RECEIVED', 'APPLIED', 'REFUNDED', 'REVERSAL');

-- CreateTable
CREATE TABLE "payment_channels" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "kind" "ChannelKind" NOT NULL,
    "name" TEXT NOT NULL,
    "shortcode" TEXT,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "propertyIds" UUID[],
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "tenantId" UUID NOT NULL,
    "channelId" UUID,
    "tenancyId" UUID,
    "method" "PaymentMethod" NOT NULL,
    "amount" BIGINT NOT NULL,
    "unallocated" BIGINT NOT NULL DEFAULT 0,
    "reference" TEXT,
    "paidBy" TEXT,
    "note" TEXT,
    "receivedAt" DATE NOT NULL,
    "reversesId" UUID,
    "reversalReason" TEXT,
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_transactions" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "tenancyId" UUID NOT NULL,
    "kind" "DepositKind" NOT NULL,
    "amount" BIGINT NOT NULL,
    "paymentId" UUID,
    "invoiceId" UUID,
    "reference" TEXT,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_channels_orgId_name_key" ON "payment_channels"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reversesId_key" ON "payments"("reversesId");

-- CreateIndex
CREATE INDEX "payments_tenantId_receivedAt_idx" ON "payments"("tenantId", "receivedAt");

-- CreateIndex
CREATE INDEX "payments_orgId_receivedAt_idx" ON "payments"("orgId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_orgId_number_key" ON "payments"("orgId", "number");

-- CreateIndex
CREATE INDEX "payment_allocations_paymentId_idx" ON "payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "payment_allocations_invoiceId_idx" ON "payment_allocations"("invoiceId");

-- CreateIndex
CREATE INDEX "deposit_transactions_tenancyId_idx" ON "deposit_transactions"("tenancyId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "payment_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "tenancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Hand-written constraints ──

-- An M-Pesa code / slip / cheque number can't be entered twice on the same channel.
CREATE UNIQUE INDEX "payments_one_per_channel_reference" ON "payments"("channelId", "reference")
  WHERE "amount" > 0 AND "reference" IS NOT NULL;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_check" CHECK ("amount" <> 0),
  ADD CONSTRAINT "payments_unallocated_check"
    CHECK (("amount" > 0 AND "unallocated" BETWEEN 0 AND "amount") OR ("amount" < 0 AND "unallocated" = 0)),
  ADD CONSTRAINT "payments_channel_check" CHECK (("method" = 'DEPOSIT') = ("channelId" IS NULL));
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_amount_check" CHECK ("amount" <> 0);
