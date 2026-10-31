-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "defaultOrgId" UUID,
  ADD COLUMN "defaultPropertyId" UUID,
  ADD COLUMN "defaultTenantId" UUID,
  ADD COLUMN "defaultLandlordId" UUID;

-- AlterTable
ALTER TABLE "refresh_tokens"
  ADD COLUMN "propertyId" UUID,
  ADD COLUMN "tenantId" UUID,
  ADD COLUMN "landlordId" UUID;
