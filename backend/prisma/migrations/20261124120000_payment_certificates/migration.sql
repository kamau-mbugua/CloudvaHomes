-- Payment history certificates (phase 23, the part with no partner).
CREATE TABLE "payment_certificates" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "summary" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_certificates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_certificates_code_key" ON "payment_certificates"("code");
CREATE INDEX "payment_certificates_tenantId_toDate_idx" ON "payment_certificates"("tenantId", "toDate");
