-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_orgId_idempotencyKey_key" ON "payments"("orgId", "idempotencyKey");

