-- Guest self check-in (phase 22, first slice): a house manual and an encrypted door code.
ALTER TABLE "listings"
  ADD COLUMN "houseManual" TEXT,
  ADD COLUMN "accessCodeEnc" BYTEA;
