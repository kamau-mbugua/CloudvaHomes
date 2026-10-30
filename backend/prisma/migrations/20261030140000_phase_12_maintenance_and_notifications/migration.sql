-- Add MAINTENANCE_PHOTO to UploadPurpose
ALTER TYPE "UploadPurpose" ADD VALUE IF NOT EXISTS 'MAINTENANCE_PHOTO';

-- Maintenance enums
CREATE TYPE "MaintenanceCategory" AS ENUM (
  'PLUMBING',
  'ELECTRICAL',
  'APPLIANCE',
  'CARPENTRY',
  'PAINTING',
  'PEST_CONTROL',
  'STRUCTURAL',
  'OTHER'
);

CREATE TYPE "MaintenancePriority" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT'
);

CREATE TYPE "MaintenanceStatus" AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CANCELLED'
);

-- Maintenance requests table
CREATE TABLE "maintenance_requests" (
  "id" UUID NOT NULL,
  "orgId" UUID NOT NULL,
  "propertyId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "tenancyId" UUID,
  "tenantId" UUID,
  "number" TEXT NOT NULL,
  "category" "MaintenanceCategory" NOT NULL DEFAULT 'OTHER',
  "priority" "MaintenancePriority" NOT NULL DEFAULT 'MEDIUM',
  "status" "MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "photoUploadIds" UUID[] DEFAULT ARRAY[]::UUID[],
  "resolutionNote" TEXT,
  "expenseId" UUID,
  "createdById" UUID,
  "resolvedById" UUID,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "maintenance_requests_expenseId_key" ON "maintenance_requests"("expenseId");
CREATE UNIQUE INDEX "maintenance_requests_orgId_number_key" ON "maintenance_requests"("orgId", "number");
CREATE INDEX "maintenance_requests_orgId_status_createdAt_idx" ON "maintenance_requests"("orgId", "status", "createdAt");
CREATE INDEX "maintenance_requests_orgId_propertyId_createdAt_idx" ON "maintenance_requests"("orgId", "propertyId", "createdAt");
CREATE INDEX "maintenance_requests_tenantId_createdAt_idx" ON "maintenance_requests"("tenantId", "createdAt");

ALTER TABLE "maintenance_requests"
  ADD CONSTRAINT "maintenance_requests_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "maintenance_requests"
  ADD CONSTRAINT "maintenance_requests_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "maintenance_requests"
  ADD CONSTRAINT "maintenance_requests_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "maintenance_requests"
  ADD CONSTRAINT "maintenance_requests_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- In-app user notifications
CREATE TABLE "user_notifications" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "orgId" UUID,
  "tenantId" UUID,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "actionUrl" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_notifications_userId_readAt_createdAt_idx" ON "user_notifications"("userId", "readAt", "createdAt");
CREATE INDEX "user_notifications_userId_createdAt_idx" ON "user_notifications"("userId", "createdAt");

-- Push notification device tokens
CREATE TABLE "device_tokens" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "token" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'ANDROID',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");
CREATE INDEX "device_tokens_userId_idx" ON "device_tokens"("userId");
