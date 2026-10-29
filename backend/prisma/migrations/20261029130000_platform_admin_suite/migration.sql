-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPERADMIN', 'SALESPERSON');

-- AlterEnum
ALTER TYPE "OtpPurpose" ADD VALUE 'ADMIN_2FA';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "platformRole" "PlatformRole";

-- Backfill existing platform admins as SUPERADMIN
UPDATE "users" SET "platformRole" = 'SUPERADMIN' WHERE "isPlatformAdmin" = true;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "onboardedById" UUID;

-- AlterTable
ALTER TABLE "platform_settings"
ADD COLUMN "requireAdminTwoFactor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "adminTwoFactorChannel" "MessageChannel" NOT NULL DEFAULT 'EMAIL',
ADD COLUMN "smtpHost" TEXT,
ADD COLUMN "smtpPort" INTEGER DEFAULT 587,
ADD COLUMN "smtpUser" TEXT,
ADD COLUMN "smtpEncryption" TEXT DEFAULT 'tls',
ADD COLUMN "smtpPassEnc" BYTEA,
ADD COLUMN "smtpFromEmail" TEXT,
ADD COLUMN "smtpFromName" TEXT,
ADD COLUMN "smtpAllowlist" TEXT,
ADD COLUMN "atUsername" TEXT,
ADD COLUMN "atSenderId" TEXT,
ADD COLUMN "atApiKeyEnc" BYTEA,
ADD COLUMN "allowPublicSignup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "minAppVersionCode" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "minAppVersionName" TEXT DEFAULT '1.0.0',
ADD COLUMN "appUpdateMessage" TEXT,
ADD COLUMN "appStoreUrl" TEXT,
ADD COLUMN "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "maintenanceMessage" TEXT;

-- CreateTable
CREATE TABLE "platform_email_logs" (
    "id" UUID NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "status" "MessageStatus" NOT NULL,
    "error" TEXT,
    "triggeredById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organizations_onboardedById_idx" ON "organizations"("onboardedById");

-- CreateIndex
CREATE INDEX "platform_email_logs_createdAt_idx" ON "platform_email_logs"("createdAt");

-- CreateIndex
CREATE INDEX "platform_email_logs_status_createdAt_idx" ON "platform_email_logs"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_onboardedById_fkey" FOREIGN KEY ("onboardedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
