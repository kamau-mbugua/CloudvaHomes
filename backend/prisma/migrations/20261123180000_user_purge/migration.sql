-- Deleted accounts are erased 30 days after deletion by the account-purge job: the name, the
-- email and phone kept aside, and the reason. purgedAt records when, so each runs once.
ALTER TABLE "users" ADD COLUMN "purgedAt" TIMESTAMP(3);

-- The job looks for deleted, not yet purged accounts.
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt") WHERE "deletedAt" IS NOT NULL AND "purgedAt" IS NULL;
