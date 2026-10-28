-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('REMINDER_DUE', 'REMINDER_OVERDUE', 'REMINDER_MANUAL', 'PORTAL_ACCESS');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('SENT', 'FAILED');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "portalInvitedAt" TIMESTAMP(3),
ADD COLUMN     "remindersOff" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "tenantId" UUID,
    "kind" "MessageKind" NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'SMS',
    "to" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "error" TEXT,
    "day" DATE NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messages_orgId_tenantId_createdAt_idx" ON "messages"("orgId", "tenantId", "createdAt");


CREATE UNIQUE INDEX "messages_one_reminder_per_day" ON "messages"("tenantId", "kind", "day")
  WHERE "kind" IN ('REMINDER_DUE', 'REMINDER_OVERDUE');
