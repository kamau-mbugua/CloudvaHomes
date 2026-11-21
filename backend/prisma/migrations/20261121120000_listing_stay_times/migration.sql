-- Listings: the longest stay a guest can book, and when guests can arrive and must leave
-- ("HH:MM", Nairobi time). All optional: existing listings keep no limit and no times.
ALTER TABLE "listings" ADD COLUMN "maxNights" INTEGER;
ALTER TABLE "listings" ADD COLUMN "checkInFrom" TEXT;
ALTER TABLE "listings" ADD COLUMN "checkOutBy" TEXT;
