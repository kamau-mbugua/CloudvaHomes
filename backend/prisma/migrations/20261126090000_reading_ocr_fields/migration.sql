-- OCR flags on meter readings (phase 19, slice 2).
ALTER TABLE "meter_readings"
  ADD COLUMN "ocrUsed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ocrEdited" BOOLEAN NOT NULL DEFAULT false;
