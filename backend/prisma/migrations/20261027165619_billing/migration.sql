-- CreateEnum
CREATE TYPE "ChargeKind" AS ENUM ('FIXED', 'VARIABLE', 'METERED');

-- CreateEnum
CREATE TYPE "MoveInKind" AS ENUM ('DEPOSIT', 'FEE');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('MONTHLY', 'MOVE_IN', 'ADHOC');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "LineKind" AS ENUM ('RENT', 'CHARGE', 'MOVE_IN', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "invoiceDueDays" INTEGER NOT NULL DEFAULT 7;

-- CreateTable
CREATE TABLE "charge_types" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ChargeKind" NOT NULL,
    "amount" BIGINT,
    "unitRate" BIGINT,
    "unitLabel" TEXT,
    "unitIds" UUID[],
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "charge_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "move_in_charges" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "MoveInKind" NOT NULL,
    "amount" BIGINT,
    "rentMonths" INTEGER,
    "refundable" BOOLEAN NOT NULL DEFAULT false,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "move_in_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charge_entries" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "chargeTypeId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "invoiceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "charge_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meters" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "chargeTypeId" UUID NOT NULL,
    "serialNo" TEXT NOT NULL,
    "initialReading" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meter_readings" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "meterId" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "previous" DECIMAL(14,3) NOT NULL,
    "current" DECIMAL(14,3) NOT NULL,
    "note" TEXT,
    "readById" UUID NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "tenancyId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "total" BIGINT NOT NULL,
    "amountPaid" BIGINT NOT NULL DEFAULT 0,
    "creditedAmount" BIGINT NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "LineKind" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "unitAmount" BIGINT NOT NULL,
    "amount" BIGINT NOT NULL,
    "refundable" BOOLEAN NOT NULL DEFAULT false,
    "chargeTypeId" UUID,
    "moveInChargeId" UUID,
    "meterReadingId" UUID,
    "chargeEntryId" UUID,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "charge_types_orgId_propertyId_idx" ON "charge_types"("orgId", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "charge_types_propertyId_name_key" ON "charge_types"("propertyId", "name");

-- CreateIndex
CREATE INDEX "move_in_charges_orgId_propertyId_idx" ON "move_in_charges"("orgId", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "move_in_charges_propertyId_name_key" ON "move_in_charges"("propertyId", "name");

-- CreateIndex
CREATE INDEX "charge_entries_orgId_period_idx" ON "charge_entries"("orgId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "charge_entries_chargeTypeId_unitId_period_key" ON "charge_entries"("chargeTypeId", "unitId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "meters_orgId_serialNo_key" ON "meters"("orgId", "serialNo");

-- CreateIndex
CREATE UNIQUE INDEX "meters_unitId_chargeTypeId_key" ON "meters"("unitId", "chargeTypeId");

-- CreateIndex
CREATE INDEX "meter_readings_orgId_period_idx" ON "meter_readings"("orgId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "meter_readings_meterId_period_key" ON "meter_readings"("meterId", "period");

-- CreateIndex
CREATE INDEX "invoices_orgId_status_dueDate_idx" ON "invoices"("orgId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "invoices_tenantId_idx" ON "invoices"("tenantId");

-- CreateIndex
CREATE INDEX "invoices_orgId_propertyId_period_idx" ON "invoices"("orgId", "propertyId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_orgId_number_key" ON "invoices"("orgId", "number");

-- CreateIndex
CREATE INDEX "invoice_lines_invoiceId_idx" ON "invoice_lines"("invoiceId");

-- CreateIndex
CREATE INDEX "invoice_lines_chargeTypeId_idx" ON "invoice_lines"("chargeTypeId");

-- CreateIndex
CREATE INDEX "invoice_lines_moveInChargeId_idx" ON "invoice_lines"("moveInChargeId");

-- CreateIndex
CREATE INDEX "credit_notes_invoiceId_idx" ON "credit_notes"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_orgId_number_key" ON "credit_notes"("orgId", "number");

-- AddForeignKey
ALTER TABLE "charge_types" ADD CONSTRAINT "charge_types_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "move_in_charges" ADD CONSTRAINT "move_in_charges_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_entries" ADD CONSTRAINT "charge_entries_chargeTypeId_fkey" FOREIGN KEY ("chargeTypeId") REFERENCES "charge_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meters" ADD CONSTRAINT "meters_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meters" ADD CONSTRAINT "meters_chargeTypeId_fkey" FOREIGN KEY ("chargeTypeId") REFERENCES "charge_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "meters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "tenancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Hand-written constraints ──

-- The invoice run can't double-bill: one live MONTHLY and one live MOVE_IN invoice per tenancy
-- per period. Voided invoices and ad-hoc ones don't count.
CREATE UNIQUE INDEX "invoices_one_live_per_tenancy_period" ON "invoices"("tenancyId", "period", "kind")
  WHERE "kind" <> 'ADHOC' AND "status" <> 'VOID';

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_due_days_check" CHECK ("invoiceDueDays" BETWEEN 0 AND 60);
ALTER TABLE "charge_types"
  ADD CONSTRAINT "charge_types_amounts_check" CHECK (coalesce("amount", 0) >= 0 AND coalesce("unitRate", 0) >= 0);
ALTER TABLE "move_in_charges"
  ADD CONSTRAINT "move_in_charges_amount_check"
  CHECK (("amount" IS NULL) <> ("rentMonths" IS NULL) AND coalesce("amount", 0) >= 0 AND coalesce("rentMonths", 1) BETWEEN 1 AND 24);
ALTER TABLE "charge_entries" ADD CONSTRAINT "charge_entries_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_order_check" CHECK ("current" >= "previous");
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_amounts_check"
  CHECK ("total" >= 0 AND "amountPaid" >= 0 AND "creditedAmount" >= 0 AND "creditedAmount" + "amountPaid" <= "total");
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_amount_check" CHECK ("amount" > 0);
