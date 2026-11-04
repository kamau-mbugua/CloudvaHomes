-- Phase 13 task C2: lease end dates and scheduled rent changes.
-- AlterTable
ALTER TABLE "tenancies" ADD COLUMN     "leaseEndDate" DATE;

-- CreateTable
CREATE TABLE "rent_changes" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "tenancyId" UUID NOT NULL,
    "effectivePeriod" TEXT NOT NULL,
    "newRent" BIGINT NOT NULL,
    "note" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rent_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rent_changes_orgId_appliedAt_idx" ON "rent_changes"("orgId", "appliedAt");

-- CreateIndex
CREATE UNIQUE INDEX "rent_changes_tenancyId_effectivePeriod_key" ON "rent_changes"("tenancyId", "effectivePeriod");

-- AddForeignKey
ALTER TABLE "rent_changes" ADD CONSTRAINT "rent_changes_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "tenancies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

