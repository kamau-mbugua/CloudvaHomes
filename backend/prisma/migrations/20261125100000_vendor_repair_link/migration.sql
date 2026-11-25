-- Vendor repair link and vendor completion report (phase 19).
ALTER TABLE "maintenance_requests"
  ADD COLUMN "vendorToken" TEXT,
  ADD COLUMN "vendorNote" TEXT,
  ADD COLUMN "vendorPhotoUploadIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  ADD COLUMN "vendorCompletedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "maintenance_requests_vendorToken_key" ON "maintenance_requests"("vendorToken");
