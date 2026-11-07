-- Hosts and short stays: HOST org kind, listings, bookings with no-overlap exclusion constraint,
-- stay payments, guests, cleaning tasks, and per-unit expenses.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- AlterEnum
ALTER TYPE "OrgKind" ADD VALUE 'HOST';
ALTER TYPE "OtpPurpose" ADD VALUE 'GUEST_BOOKING';
ALTER TYPE "UploadPurpose" ADD VALUE 'LISTING_PHOTO';
ALTER TYPE "UploadPurpose" ADD VALUE 'SITE_LOGO';
ALTER TYPE "ExpenseCategory" ADD VALUE 'RENT';

-- CreateEnum
CREATE TYPE "BookingKind" AS ENUM ('STAY', 'BLOCK');
CREATE TYPE "BookingStatus" AS ENUM ('HELD', 'REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'EXPIRED', 'DECLINED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "BookingSource" AS ENUM ('SITE', 'HOST');
CREATE TYPE "StayPaymentKind" AS ENUM ('PAYMENT', 'REFUND');
CREATE TYPE "CleaningStatus" AS ENUM ('OPEN', 'DONE');

-- AlterTable: inbound_transactions
ALTER TABLE "inbound_transactions"
  ADD COLUMN "bookingId" UUID,
  ADD COLUMN "stayPaymentId" UUID;

-- AlterTable: stk_requests
ALTER TABLE "stk_requests"
  ALTER COLUMN "tenantId" DROP NOT NULL,
  ADD COLUMN "bookingId" UUID;

CREATE INDEX "stk_requests_bookingId_createdAt_idx" ON "stk_requests"("bookingId", "createdAt");

ALTER TABLE "stk_requests" ADD CONSTRAINT "stk_requests_one_payer"
  CHECK (("tenantId" IS NULL) <> ("bookingId" IS NULL));

-- AlterTable: expenses
ALTER TABLE "expenses"
  ADD COLUMN "unitId" UUID;

CREATE INDEX "expenses_orgId_unitId_incurredOn_idx" ON "expenses"("orgId", "unitId", "incurredOn");

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: host_sites
CREATE TABLE "host_sites" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "slug" TEXT,
    "previousSlug" TEXT,
    "previousSlugUntil" TIMESTAMP(3),
    "published" BOOLEAN NOT NULL DEFAULT false,
    "businessName" TEXT NOT NULL,
    "about" TEXT,
    "logoUploadId" UUID,
    "contactPhone" TEXT,
    "whatsappPhone" TEXT,
    "rules" JSONB NOT NULL,
    "houseRules" TEXT,
    "checkInTime" TEXT NOT NULL DEFAULT '14:00',
    "checkOutTime" TEXT NOT NULL DEFAULT '10:00',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "host_sites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "host_sites_orgId_key" ON "host_sites"("orgId");
CREATE UNIQUE INDEX "host_sites_slug_key" ON "host_sites"("slug");
CREATE UNIQUE INDEX "host_sites_previousSlug_key" ON "host_sites"("previousSlug");
CREATE UNIQUE INDEX "host_sites_logoUploadId_key" ON "host_sites"("logoUploadId");

ALTER TABLE "host_sites" ADD CONSTRAINT "host_sites_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: listings
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxGuests" INTEGER NOT NULL,
    "bedrooms" INTEGER NOT NULL DEFAULT 1,
    "bathrooms" INTEGER NOT NULL DEFAULT 1,
    "nightlyPrice" BIGINT NOT NULL,
    "weekendPrice" BIGINT,
    "weeklyDiscountBps" INTEGER,
    "cleaningFee" BIGINT NOT NULL DEFAULT 0,
    "minNights" INTEGER NOT NULL DEFAULT 1,
    "checkInInstructions" TEXT,
    "area" TEXT,
    "rulesOverride" JSONB,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "listings_unitId_key" ON "listings"("unitId");
CREATE INDEX "listings_orgId_propertyId_idx" ON "listings"("orgId", "propertyId");

ALTER TABLE "listings" ADD CONSTRAINT "listings_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listings" ADD CONSTRAINT "listings_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: listing_photos
CREATE TABLE "listing_photos" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "uploadId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "caption" TEXT,

    CONSTRAINT "listing_photos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "listing_photos_uploadId_key" ON "listing_photos"("uploadId");
CREATE INDEX "listing_photos_listingId_position_idx" ON "listing_photos"("listingId", "position");

ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: special_prices
CREATE TABLE "special_prices" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "nightlyPrice" BIGINT NOT NULL,
    "label" TEXT,

    CONSTRAINT "special_prices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "special_prices_listingId_fromDate_idx" ON "special_prices"("listingId", "fromDate");

ALTER TABLE "special_prices" ADD CONSTRAINT "special_prices_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: guests
CREATE TABLE "guests" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "idNumberEnc" BYTEA,
    "idNumberHint" TEXT,
    "notes" TEXT,
    "doNotAccept" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guests_orgId_phone_key" ON "guests"("orgId", "phone");

-- CreateTable: bookings
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "BookingKind" NOT NULL DEFAULT 'STAY',
    "unitId" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "guestId" UUID,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "guests" INTEGER NOT NULL DEFAULT 1,
    "status" "BookingStatus" NOT NULL,
    "source" "BookingSource" NOT NULL,
    "holdExpiresAt" TIMESTAMP(3),
    "requestExpiresAt" TIMESTAMP(3),
    "total" BIGINT NOT NULL DEFAULT 0,
    "dueNow" BIGINT NOT NULL DEFAULT 0,
    "balanceDueOn" DATE,
    "amountPaid" BIGINT NOT NULL DEFAULT 0,
    "amountRefunded" BIGINT NOT NULL DEFAULT 0,
    "lines" JSONB NOT NULL,
    "rules" JSONB NOT NULL,
    "guestNote" TEXT,
    "hostNote" TEXT,
    "accessTokenHash" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelReason" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "infoSentAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bookings_orgId_code_key" ON "bookings"("orgId", "code");
CREATE UNIQUE INDEX "bookings_accessTokenHash_key" ON "bookings"("accessTokenHash");
CREATE INDEX "bookings_orgId_status_idx" ON "bookings"("orgId", "status");
CREATE INDEX "bookings_unitId_checkIn_idx" ON "bookings"("unitId", "checkIn");
CREATE INDEX "bookings_guestId_idx" ON "bookings"("guestId");

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap" EXCLUDE USING gist (
  "unitId" WITH =, daterange("checkIn", "checkOut", '[)') WITH &&
) WHERE ("status" IN ('HELD','REQUESTED','CONFIRMED','CHECKED_IN'));

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_dates" CHECK ("checkOut" > "checkIn");

-- CreateTable: stay_payments
CREATE TABLE "stay_payments" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "StayPaymentKind" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "channelId" UUID,
    "amount" BIGINT NOT NULL,
    "reference" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "inboundId" UUID,
    "recordedById" UUID,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stay_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stay_payments_orgId_number_key" ON "stay_payments"("orgId", "number");
CREATE UNIQUE INDEX "stay_payments_inboundId_key" ON "stay_payments"("inboundId");
CREATE INDEX "stay_payments_bookingId_idx" ON "stay_payments"("bookingId");
CREATE INDEX "stay_payments_orgId_receivedAt_idx" ON "stay_payments"("orgId", "receivedAt");

ALTER TABLE "stay_payments" ADD CONSTRAINT "stay_payments_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stay_payments" ADD CONSTRAINT "stay_payments_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "payment_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: cleaning_tasks
CREATE TABLE "cleaning_tasks" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "bookingId" UUID,
    "status" "CleaningStatus" NOT NULL DEFAULT 'OPEN',
    "doneAt" TIMESTAMP(3),
    "doneById" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cleaning_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cleaning_tasks_bookingId_key" ON "cleaning_tasks"("bookingId");
CREATE INDEX "cleaning_tasks_orgId_status_idx" ON "cleaning_tasks"("orgId", "status");

ALTER TABLE "cleaning_tasks" ADD CONSTRAINT "cleaning_tasks_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cleaning_tasks" ADD CONSTRAINT "cleaning_tasks_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
