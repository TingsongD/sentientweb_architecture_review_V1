-- Enforce at most one active (usedAt IS NULL) login token per (tenantId, email).
--
-- Earlier code paths could leave multiple unused rows behind, including expired
-- tokens. Normalize the table first so the partial unique index can be created
-- safely on production data.
UPDATE "TenantAdminLoginToken"
SET "usedAt" = "expiresAt"
WHERE "usedAt" IS NULL
  AND "expiresAt" <= NOW();

WITH ranked_unused_tokens AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId", "email"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS row_num
  FROM "TenantAdminLoginToken"
  WHERE "usedAt" IS NULL
)
UPDATE "TenantAdminLoginToken" AS token
SET "usedAt" = TIMESTAMPTZ '2026-04-07 14:00:00+00'
FROM ranked_unused_tokens
WHERE token."id" = ranked_unused_tokens."id"
  AND ranked_unused_tokens.row_num > 1;

-- Prisma's schema.prisma DSL does not support partial unique indexes, so this
-- index is managed here in the migration only. The application layer wraps
-- updateMany + create in a transaction, but the DB constraint is the true
-- enforcement boundary — even under Read Committed isolation two concurrent
-- inserts cannot both succeed with usedAt IS NULL for the same admin.
CREATE UNIQUE INDEX "TenantAdminLoginToken_active_per_admin"
  ON "TenantAdminLoginToken" ("tenantId", "email")
  WHERE "usedAt" IS NULL;
