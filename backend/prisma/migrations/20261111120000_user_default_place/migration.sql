-- Remember which kind of place and which home a person chose last.
CREATE TYPE "Place" AS ENUM ('STAFF', 'TENANT', 'OWNER', 'PLATFORM');

ALTER TABLE "users" ADD COLUMN "defaultPlace" "Place",
ADD COLUMN "defaultHomeId" UUID;
