-- Add LEASE_DOCUMENT to UploadPurpose
ALTER TYPE "UploadPurpose" ADD VALUE IF NOT EXISTS 'LEASE_DOCUMENT';

-- Add leaseUploadId to tenancies
ALTER TABLE "tenancies" ADD COLUMN "leaseUploadId" UUID;
CREATE UNIQUE INDEX "tenancies_leaseUploadId_key" ON "tenancies"("leaseUploadId");
