-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "emailTemplates" JSONB NOT NULL DEFAULT '{}';
