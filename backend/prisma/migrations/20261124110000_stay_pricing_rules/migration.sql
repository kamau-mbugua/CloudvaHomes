-- Stay pricing (phase 21, first slice): a 28+ nights discount and a fee per extra guest.
ALTER TABLE "listings"
  ADD COLUMN "monthlyDiscountBps" INTEGER,
  ADD COLUMN "extraGuestFee" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "guestsIncluded" INTEGER;
