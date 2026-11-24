-- Notice to vacate (phase 14): the organisation's minimum notice, and on each tenancy who gave
-- notice, its own minimum, the date rent runs to on short notice, and a forwarding number.
CREATE TYPE "NoticeSource" AS ENUM ('TENANT', 'STAFF');

ALTER TABLE "organizations" ADD COLUMN "noticeDays" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "tenancies"
  ADD COLUMN "noticeSource" "NoticeSource",
  ADD COLUMN "noticeDays" INTEGER,
  ADD COLUMN "noticeEndsOn" DATE,
  ADD COLUMN "forwardingPhone" TEXT;
