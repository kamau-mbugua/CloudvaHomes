-- Phase 13 task C6: move-in and move-out inspections.
-- CreateEnum
CREATE TYPE "InspectionKind" AS ENUM ('MOVE_IN', 'MOVE_OUT');

-- AlterEnum
ALTER TYPE "UploadPurpose" ADD VALUE 'INSPECTION_PHOTO';

-- CreateTable
CREATE TABLE "inspections" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "tenancyId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "kind" "InspectionKind" NOT NULL,
    "inspectedOn" DATE NOT NULL,
    "items" JSONB NOT NULL,
    "notes" TEXT,
    "inspectorName" TEXT,
    "photoUploadIds" UUID[],
    "tenantAcknowledgedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inspections_orgId_createdAt_idx" ON "inspections"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_tenancyId_kind_key" ON "inspections"("tenancyId", "kind");

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "tenancies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

