-- Two-factor for organisations' staff (phase 26, first slice).
CREATE TYPE "StaffTwoFactor" AS ENUM ('OFF', 'MONEY_ROLES', 'ALL_STAFF');
ALTER TABLE "organizations" ADD COLUMN "staffTwoFactor" "StaffTwoFactor" NOT NULL DEFAULT 'OFF';
