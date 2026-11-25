-- Unit readiness and task push de-duplication (phase 19, slice 5).
CREATE TYPE "UnitReadiness" AS ENUM ('READY', 'NEEDS_CLEANING', 'UNDER_REPAIR');

ALTER TABLE "units"
  ADD COLUMN "readiness" "UnitReadiness";

CREATE TABLE "task_pushes" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "refKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_pushes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_pushes_orgId_kind_refKey_key" ON "task_pushes"("orgId", "kind", "refKey");
