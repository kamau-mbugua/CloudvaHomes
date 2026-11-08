-- Host booking sites: theme (preset + optional brand colour) and the host's own legal texts.
-- Null legal text = the site shows the starter template (backend rules/legal.ts).
ALTER TABLE "host_sites"
  ADD COLUMN "themePreset" TEXT NOT NULL DEFAULT 'forest',
  ADD COLUMN "brandColor" TEXT,
  ADD COLUMN "termsText" TEXT,
  ADD COLUMN "termsOfUseText" TEXT,
  ADD COLUMN "privacyText" TEXT;
