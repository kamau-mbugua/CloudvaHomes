-- Unit numbers sort the way people read them: A2 before A10 (ICU numeric collation).
-- Deterministic, so the (propertyId, number) unique index keeps exact-match semantics.
CREATE COLLATION IF NOT EXISTS "natural" (provider = icu, locale = 'en-u-kn-true');
ALTER TABLE "units" ALTER COLUMN "number" TYPE TEXT COLLATE "natural";
