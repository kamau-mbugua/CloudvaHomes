-- Vendor repair links: keep only a hash to look the link up and an encrypted copy so staff can
-- copy it again; a database copy alone no longer opens jobs.
DROP INDEX IF EXISTS "maintenance_requests_vendorToken_key";
ALTER TABLE "maintenance_requests"
  DROP COLUMN "vendorToken",
  ADD COLUMN "vendorTokenHash" TEXT,
  ADD COLUMN "vendorTokenEnc" BYTEA;

CREATE UNIQUE INDEX "maintenance_requests_vendorTokenHash_key" ON "maintenance_requests"("vendorTokenHash");
