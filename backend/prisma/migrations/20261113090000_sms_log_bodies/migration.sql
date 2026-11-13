-- Keep what each SMS said (encrypted), with its code or link stored apart, and list all SMS by time.
ALTER TABLE "sms_logs" ADD COLUMN "bodyEnc" BYTEA,
ADD COLUMN "secretEnc" BYTEA,
ADD COLUMN "secretLabel" TEXT;

CREATE INDEX "sms_logs_createdAt_idx" ON "sms_logs"("createdAt");
