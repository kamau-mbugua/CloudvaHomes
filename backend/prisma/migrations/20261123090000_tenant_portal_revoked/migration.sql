-- Tenants sign in with the phone or email on their tenant record, without staff first granting
-- access. Staff can still take access away; that is now recorded, so signing in never links a
-- record staff cut off.
ALTER TABLE "tenants" ADD COLUMN "portalRevokedAt" TIMESTAMP(3);

-- Tenants whose access was taken away before this change: their latest grant/revoke is a revoke.
UPDATE "tenants" t
   SET "portalRevokedAt" = last."createdAt"
  FROM (
    SELECT DISTINCT ON ("entityId") "entityId", "action", "createdAt"
      FROM "audit_logs"
     WHERE "entity" = 'tenant'
       AND "action" IN ('tenant.portal_grant', 'tenant.portal_revoke')
     ORDER BY "entityId", "createdAt" DESC
  ) last
 WHERE last."entityId" = t."id"::text
   AND last."action" = 'tenant.portal_revoke'
   AND t."userId" IS NULL;
