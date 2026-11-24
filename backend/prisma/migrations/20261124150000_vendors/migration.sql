-- Vendors and assigning maintenance jobs (phase 18, first step).
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "trades" "MaintenanceCategory"[],
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vendors_orgId_phone_key" ON "vendors"("orgId", "phone");
CREATE INDEX "vendors_orgId_active_idx" ON "vendors"("orgId", "active");

ALTER TABLE "maintenance_requests"
  ADD COLUMN "vendorId" UUID,
  ADD COLUMN "assignedAt" TIMESTAMP(3);
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
