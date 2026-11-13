-- Where a listing is, picked on a map by the host (Google Places): shown to guests with a map link.
ALTER TABLE "listings"
  ADD COLUMN "address" TEXT,
  ADD COLUMN "lat" DOUBLE PRECISION,
  ADD COLUMN "lng" DOUBLE PRECISION,
  ADD COLUMN "placeId" TEXT;

-- The Google Maps browser key (Maps JavaScript + Places), set by KodiHub admin. Not a secret:
-- browsers receive it; it is locked to KodiHub's domains in Google Cloud.
ALTER TABLE "platform_settings" ADD COLUMN "googleMapsKey" TEXT;
