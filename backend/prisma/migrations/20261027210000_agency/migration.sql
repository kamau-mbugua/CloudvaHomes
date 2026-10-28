-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('BANK', 'MPESA', 'CHEQUE');

-- CreateEnum
CREATE TYPE "CommissionBasis" AS ENUM ('PERCENT_OF_COLLECTED', 'PERCENT_OF_INVOICED', 'FIXED_MONTHLY');

-- CreateEnum
CREATE TYPE "CollectionMode" AS ENUM ('AGENCY_COLLECTS', 'LANDLORD_COLLECTS');

-- CreateEnum
CREATE TYPE "LedgerBucket" AS ENUM ('PAYABLE', 'DEPOSIT_HELD');

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('COLLECTION', 'COMMISSION', 'EXPENSE', 'DEPOSIT', 'REMITTANCE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RemittanceDirection" AS ENUM ('TO_LANDLORD', 'FROM_LANDLORD');

-- CreateEnum
CREATE TYPE "RemittanceStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "landlords" ADD COLUMN     "payoutEnc" BYTEA,
ADD COLUMN     "payoutHint" TEXT,
ADD COLUMN     "payoutMethod" "PayoutMethod",
ADD COLUMN     "payoutUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "portalInvitedAt" TIMESTAMP(3),
ADD COLUMN     "userId" UUID;

-- CreateTable
CREATE TABLE "management_agreements" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "landlordId" UUID NOT NULL,
    "propertyIds" UUID[],
    "commissionBasis" "CommissionBasis" NOT NULL,
    "commissionBps" INTEGER,
    "fixedAmount" BIGINT,
    "commissionableLines" "LineKind"[] DEFAULT ARRAY['RENT']::"LineKind"[],
    "collection" "CollectionMode" NOT NULL DEFAULT 'AGENCY_COLLECTS',
    "remittanceDay" INTEGER NOT NULL,
    "deductExpenses" BOOLEAN NOT NULL DEFAULT true,
    "holdDeposits" BOOLEAN NOT NULL DEFAULT true,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "management_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landlord_ledger_entries" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "landlordId" UUID NOT NULL,
    "propertyId" UUID,
    "bucket" "LedgerBucket" NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "amount" BIGINT NOT NULL,
    "agreementId" UUID,
    "paymentId" UUID,
    "allocationId" UUID,
    "invoiceId" UUID,
    "expenseId" UUID,
    "remittanceId" UUID,
    "tenancyId" UUID,
    "occurredAt" DATE NOT NULL,
    "memo" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "landlord_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remittances" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "landlordId" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "direction" "RemittanceDirection" NOT NULL,
    "collections" BIGINT NOT NULL,
    "commission" BIGINT NOT NULL,
    "expenses" BIGINT NOT NULL,
    "adjustments" BIGINT NOT NULL,
    "net" BIGINT NOT NULL,
    "cutoff" TIMESTAMP(3) NOT NULL,
    "status" "RemittanceStatus" NOT NULL DEFAULT 'DRAFT',
    "draftedById" UUID,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "paidById" UUID,
    "paidAt" TIMESTAMP(3),
    "method" "PayoutMethod",
    "reference" TEXT,
    "payoutMasked" TEXT,
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remittances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "management_agreements_orgId_landlordId_idx" ON "management_agreements"("orgId", "landlordId");

-- CreateIndex
CREATE INDEX "landlord_ledger_entries_landlordId_bucket_createdAt_idx" ON "landlord_ledger_entries"("landlordId", "bucket", "createdAt");

-- CreateIndex
CREATE INDEX "landlord_ledger_entries_landlordId_occurredAt_idx" ON "landlord_ledger_entries"("landlordId", "occurredAt");

-- CreateIndex
CREATE INDEX "remittances_orgId_status_idx" ON "remittances"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "remittances_orgId_number_key" ON "remittances"("orgId", "number");

-- AddForeignKey
ALTER TABLE "management_agreements" ADD CONSTRAINT "management_agreements_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "landlords"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landlord_ledger_entries" ADD CONSTRAINT "landlord_ledger_entries_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "landlords"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remittances" ADD CONSTRAINT "remittances_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "landlords"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE UNIQUE INDEX "remittances_one_live_per_period" ON "remittances"("landlordId", "period")
  WHERE "status" <> 'CANCELLED';
ALTER TABLE "management_agreements"
  ADD CONSTRAINT "agreements_day_check" CHECK ("remittanceDay" BETWEEN 1 AND 28),
  ADD CONSTRAINT "agreements_dates_check" CHECK ("endDate" IS NULL OR "endDate" >= "startDate"),
  ADD CONSTRAINT "agreements_terms_check" CHECK (
    ("commissionBasis" = 'FIXED_MONTHLY' AND "fixedAmount" IS NOT NULL AND "fixedAmount" >= 0)
    OR ("commissionBasis" <> 'FIXED_MONTHLY' AND "commissionBps" BETWEEN 0 AND 10000));
ALTER TABLE "remittances" ADD CONSTRAINT "remittances_net_check" CHECK ("net" >= 0);
