-- Phase 13 task C1: late fees (owner decisions D1–D3, 2026-11-04).
-- CreateEnum
CREATE TYPE "LateFeeRecipient" AS ENUM ('LANDLORD', 'AGENCY');

-- AlterEnum
ALTER TYPE "InvoiceKind" ADD VALUE 'LATE_FEE';

-- AlterEnum
ALTER TYPE "LineKind" ADD VALUE 'LATE_FEE';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "lateFeeForId" UUID,
ADD COLUMN     "lateFeeKeptBy" "LateFeeRecipient";

-- AlterTable
ALTER TABLE "management_agreements" ADD COLUMN     "lateFeeRecipient" "LateFeeRecipient";

-- CreateIndex
CREATE UNIQUE INDEX "invoices_lateFeeForId_key" ON "invoices"("lateFeeForId");

