-- KodiHub's own short links for SMS (go.kodihub.co.ke/<code>). The code and the target are
-- never stored readable: a database copy alone can't open anyone's booking.
CREATE TABLE "short_links" (
  "id" UUID NOT NULL,
  "codeHash" TEXT NOT NULL,
  "targetHash" TEXT NOT NULL,
  "targetEnc" BYTEA NOT NULL,
  "kind" TEXT NOT NULL,
  "orgId" UUID,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "lastClickedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "short_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "short_links_codeHash_key" ON "short_links"("codeHash");
CREATE INDEX "short_links_targetHash_idx" ON "short_links"("targetHash");
