-- CreateEnum
CREATE TYPE "UploadPurpose" AS ENUM ('EXPENSE_RECEIPT', 'METER_PHOTO');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('REPAIRS', 'UTILITIES', 'SECURITY', 'CLEANING', 'SALARIES', 'TAXES', 'INSURANCE', 'MANAGEMENT', 'OTHER');

-- AlterTable
ALTER TABLE "meter_readings" ADD COLUMN     "photoUploadId" UUID;

-- CreateTable
CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "purpose" "UploadPurpose" NOT NULL,
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" UUID NOT NULL,
    "attachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_expenses" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "payee" TEXT,
    "amount" BIGINT NOT NULL,
    "everyMonths" INTEGER NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "nextDue" DATE NOT NULL,
    "endDate" DATE,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "recurringExpenseId" UUID,
    "category" "ExpenseCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "payee" TEXT,
    "reference" TEXT,
    "amount" BIGINT NOT NULL,
    "incurredOn" DATE NOT NULL,
    "receiptUploadId" UUID,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uploads_key_key" ON "uploads"("key");

-- CreateIndex
CREATE INDEX "uploads_attachedAt_createdAt_idx" ON "uploads"("attachedAt", "createdAt");

-- CreateIndex
CREATE INDEX "recurring_expenses_status_nextDue_idx" ON "recurring_expenses"("status", "nextDue");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_receiptUploadId_key" ON "expenses"("receiptUploadId");

-- CreateIndex
CREATE INDEX "expenses_orgId_propertyId_incurredOn_idx" ON "expenses"("orgId", "propertyId", "incurredOn");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_recurringExpenseId_incurredOn_key" ON "expenses"("recurringExpenseId", "incurredOn");

-- CreateIndex
CREATE UNIQUE INDEX "meter_readings_photoUploadId_key" ON "meter_readings"("photoUploadId");

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "recurring_expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_check" CHECK ("amount" > 0);
ALTER TABLE "recurring_expenses"
  ADD CONSTRAINT "recurring_expenses_amount_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "recurring_expenses_every_check" CHECK ("everyMonths" BETWEEN 1 AND 12),
  ADD CONSTRAINT "recurring_expenses_day_check" CHECK ("dayOfMonth" BETWEEN 1 AND 28);
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_size_check" CHECK ("size" > 0);
