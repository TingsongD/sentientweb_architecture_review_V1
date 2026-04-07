DO $$
DECLARE
  conflicting_email TEXT;
BEGIN
  SELECT LOWER(BTRIM("email"))
    INTO conflicting_email
  FROM "TenantAdmin"
  GROUP BY LOWER(BTRIM("email"))
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF conflicting_email IS NOT NULL THEN
    RAISE EXCEPTION 'TenantAdmin email normalization produced duplicate email "%". Resolve duplicates before applying this migration.', conflicting_email;
  END IF;
END
$$;

UPDATE "TenantAdmin"
SET "email" = LOWER(BTRIM("email"))
WHERE "email" <> LOWER(BTRIM("email"));

UPDATE "TenantAdminLoginToken"
SET "email" = LOWER(BTRIM("email"))
WHERE "email" <> LOWER(BTRIM("email"));

DROP INDEX IF EXISTS "TenantAdmin_tenantId_email_key";
DROP INDEX IF EXISTS "TenantAdmin_email_idx";

CREATE UNIQUE INDEX "TenantAdmin_email_key" ON "TenantAdmin"("email");
