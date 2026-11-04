-- Phase 13 task C5: property use (residential/commercial) and the MRI rate.
-- CreateEnum
CREATE TYPE "PropertyUse" AS ENUM ('RESIDENTIAL', 'COMMERCIAL');

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "mriRateBps" INTEGER NOT NULL DEFAULT 750;

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "use" "PropertyUse" NOT NULL DEFAULT 'RESIDENTIAL';

