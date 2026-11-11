-- Keep what each platform email said (encrypted), with its secret stored apart.
ALTER TABLE "platform_email_logs" ADD COLUMN "bodyEnc" BYTEA,
ADD COLUMN "secretEnc" BYTEA,
ADD COLUMN "secretLabel" TEXT;
