-- Calendar export (phase 20): a secret per listing for its iCal feed URL.
ALTER TABLE "listings" ADD COLUMN "icalToken" TEXT;
CREATE UNIQUE INDEX "listings_icalToken_key" ON "listings"("icalToken");
