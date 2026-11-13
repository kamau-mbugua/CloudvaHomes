-- A balance the host gave up on (e.g. the guest left without paying): kept apart from payments,
-- so what was paid stays true and the booking can be checked out.
ALTER TABLE "bookings" ADD COLUMN "amountWrittenOff" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN "writtenOffAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "writeOffReason" TEXT;
ALTER TABLE "bookings" ADD COLUMN "writtenOffById" UUID;
