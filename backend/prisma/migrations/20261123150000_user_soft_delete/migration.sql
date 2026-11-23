-- People can delete their own account (Google Play requires it). Soft delete: the row stays for
-- the records it signed; sign-in details move to deletedEmail / deletedPhone.
ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletionReason" TEXT,
ADD COLUMN "deletedEmail" TEXT,
ADD COLUMN "deletedPhone" TEXT;
