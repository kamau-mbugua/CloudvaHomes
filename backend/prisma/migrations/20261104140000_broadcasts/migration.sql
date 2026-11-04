-- Phase 13 task C4: broadcasts to tenants.
-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('QUEUED', 'SENDING', 'DONE');

-- AlterEnum
ALTER TYPE "MessageKind" ADD VALUE 'BROADCAST';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "broadcastId" UUID;

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "propertyIds" UUID[],
    "text" TEXT NOT NULL,
    "alsoEmail" BOOLEAN NOT NULL DEFAULT false,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'QUEUED',
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "emailed" INTEGER NOT NULL DEFAULT 0,
    "notified" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "broadcasts_orgId_createdAt_idx" ON "broadcasts"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "broadcasts_status_startedAt_idx" ON "broadcasts"("status", "startedAt");

-- CreateIndex
CREATE INDEX "messages_broadcastId_idx" ON "messages"("broadcastId");


-- Existing Manager roles get the new permission (Owner roles are computed in code).
UPDATE "roles" SET "permissions" = array_append("permissions", 'messages:send')
 WHERE "systemKey" = 'MANAGER' AND NOT ('messages:send' = ANY("permissions"));
