-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "LandlordKind" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- CreateEnum
CREATE TYPE "TenancyStatus" AS ENUM ('ACTIVE', 'NOTICE', 'ENDED');

-- CreateTable
CREATE TABLE "org_counters" (
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "org_counters_pkey" PRIMARY KEY ("orgId","name")
);

-- CreateTable
CREATE TABLE "landlords" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "LandlordKind" NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "kraPin" TEXT,
    "idNumberEnc" BYTEA,
    "idNumberIndex" TEXT,
    "idNumberHint" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landlords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "landlordId" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "location" TEXT,
    "county" TEXT,
    "floors" INTEGER NOT NULL DEFAULT 1,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_types" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_categories" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_features" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "unitTypeId" UUID,
    "categoryId" UUID,
    "number" TEXT NOT NULL,
    "floor" INTEGER NOT NULL DEFAULT 0,
    "sizeSqft" INTEGER,
    "rentAmount" BIGINT NOT NULL,
    "description" TEXT,
    "featureIds" UUID[],
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "userId" UUID,
    "code" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "kraPin" TEXT,
    "idNumberEnc" BYTEA,
    "idNumberIndex" TEXT,
    "idNumberHint" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "notes" TEXT,
    "creditBalance" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenancies" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "rentAmount" BIGINT NOT NULL,
    "billingDay" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "noticeGivenAt" TIMESTAMP(3),
    "depositHeld" BIGINT NOT NULL DEFAULT 0,
    "status" "TenancyStatus" NOT NULL DEFAULT 'ACTIVE',
    "moveOutReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenancies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "landlords_orgId_name_idx" ON "landlords"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "landlords_orgId_code_key" ON "landlords"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "landlords_orgId_idNumberIndex_key" ON "landlords"("orgId", "idNumberIndex");

-- CreateIndex
CREATE INDEX "properties_orgId_name_idx" ON "properties"("orgId", "name");

-- CreateIndex
CREATE INDEX "properties_landlordId_idx" ON "properties"("landlordId");

-- CreateIndex
CREATE UNIQUE INDEX "properties_orgId_code_key" ON "properties"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "unit_types_orgId_name_key" ON "unit_types"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "unit_categories_orgId_name_key" ON "unit_categories"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "unit_features_orgId_name_key" ON "unit_features"("orgId", "name");

-- CreateIndex
CREATE INDEX "units_orgId_propertyId_idx" ON "units"("orgId", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "units_propertyId_number_key" ON "units"("propertyId", "number");

-- CreateIndex
CREATE INDEX "tenants_orgId_lastName_firstName_idx" ON "tenants"("orgId", "lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_orgId_code_key" ON "tenants"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_orgId_phone_key" ON "tenants"("orgId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_orgId_idNumberIndex_key" ON "tenants"("orgId", "idNumberIndex");

-- CreateIndex
CREATE INDEX "tenancies_orgId_status_idx" ON "tenancies"("orgId", "status");

-- CreateIndex
CREATE INDEX "tenancies_unitId_idx" ON "tenancies"("unitId");

-- CreateIndex
CREATE INDEX "tenancies_tenantId_idx" ON "tenancies"("tenantId");

-- AddForeignKey
ALTER TABLE "landlords" ADD CONSTRAINT "landlords_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "landlords"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "unit_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "unit_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Hand-written constraints (not expressible in the Prisma schema) ──

-- At most one current (ACTIVE or NOTICE) tenancy per unit; concurrent move-ins race here.
CREATE UNIQUE INDEX "tenancies_one_current_per_unit" ON "tenancies"("unitId")
  WHERE "status" IN ('ACTIVE', 'NOTICE');

ALTER TABLE "tenancies"
  ADD CONSTRAINT "tenancies_billing_day_check" CHECK ("billingDay" BETWEEN 1 AND 28),
  ADD CONSTRAINT "tenancies_dates_check" CHECK ("endDate" IS NULL OR "endDate" >= "startDate"),
  ADD CONSTRAINT "tenancies_amounts_check" CHECK ("rentAmount" >= 0 AND "depositHeld" >= 0);

ALTER TABLE "units"
  ADD CONSTRAINT "units_rent_check" CHECK ("rentAmount" >= 0);
