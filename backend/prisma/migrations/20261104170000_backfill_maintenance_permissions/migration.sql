-- Phase 12 added the maintenance permissions to the built-in role defaults but never gave
-- them to roles already stored for existing organisations. Add each role's default ones,
-- keeping whatever else the organisation has set. Safe to run more than once.
UPDATE "roles"
   SET "permissions" = ARRAY(
         SELECT DISTINCT p FROM unnest("permissions" || ARRAY['maintenance:view', 'maintenance:create', 'maintenance:update']) AS p ORDER BY p)
 WHERE "systemKey" IN ('MANAGER', 'CARETAKER')
   AND NOT (ARRAY['maintenance:view', 'maintenance:create', 'maintenance:update'] <@ "permissions");

UPDATE "roles"
   SET "permissions" = ARRAY(
         SELECT DISTINCT p FROM unnest("permissions" || ARRAY['maintenance:view']) AS p ORDER BY p)
 WHERE "systemKey" = 'ACCOUNTANT'
   AND NOT ('maintenance:view' = ANY("permissions"));
