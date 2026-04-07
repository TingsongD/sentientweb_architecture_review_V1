ALTER TABLE "Tenant"
ADD COLUMN "aiCredentialMode" TEXT NOT NULL DEFAULT 'managed';

ALTER TABLE "DemoBooking"
ADD COLUMN "errorMessage" TEXT,
ADD COLUMN "externalRequestKey" TEXT;

CREATE INDEX "DemoBooking_externalRequestKey_idx" ON "DemoBooking"("externalRequestKey");

UPDATE "Lead"
SET "email" = NULL
WHERE "email" IS NOT NULL
  AND BTRIM("email") = '';

UPDATE "Lead"
SET "email" = LOWER(BTRIM("email"))
WHERE "email" IS NOT NULL;

WITH ranked AS (
  SELECT
    "id",
    "tenantId",
    "email",
    FIRST_VALUE("id") OVER (
      PARTITION BY "tenantId", "email"
      ORDER BY "updatedAt" DESC, "createdAt" ASC, "id" ASC
    ) AS canonical_id,
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId", "email"
      ORDER BY "updatedAt" DESC, "createdAt" ASC, "id" ASC
    ) AS duplicate_rank
  FROM "Lead"
  WHERE "email" IS NOT NULL
)
UPDATE "Conversation" AS conversation
SET "leadId" = ranked.canonical_id
FROM ranked
WHERE conversation."leadId" = ranked."id"
  AND ranked.duplicate_rank > 1
  AND conversation."leadId" <> ranked.canonical_id;

WITH ranked AS (
  SELECT
    "id",
    "tenantId",
    "email",
    FIRST_VALUE("id") OVER (
      PARTITION BY "tenantId", "email"
      ORDER BY "updatedAt" DESC, "createdAt" ASC, "id" ASC
    ) AS canonical_id,
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId", "email"
      ORDER BY "updatedAt" DESC, "createdAt" ASC, "id" ASC
    ) AS duplicate_rank
  FROM "Lead"
  WHERE "email" IS NOT NULL
)
UPDATE "DemoBooking" AS booking
SET "leadId" = ranked.canonical_id
FROM ranked
WHERE booking."leadId" = ranked."id"
  AND ranked.duplicate_rank > 1
  AND booking."leadId" <> ranked.canonical_id;

WITH ranked AS (
  SELECT
    "id",
    "tenantId",
    "email",
    FIRST_VALUE("id") OVER (
      PARTITION BY "tenantId", "email"
      ORDER BY "updatedAt" DESC, "createdAt" ASC, "id" ASC
    ) AS canonical_id,
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId", "email"
      ORDER BY "updatedAt" DESC, "createdAt" ASC, "id" ASC
    ) AS duplicate_rank
  FROM "Lead"
  WHERE "email" IS NOT NULL
)
UPDATE "CrmSyncEvent" AS crm_event
SET "leadId" = ranked.canonical_id
FROM ranked
WHERE crm_event."leadId" = ranked."id"
  AND ranked.duplicate_rank > 1
  AND crm_event."leadId" <> ranked.canonical_id;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId", "email"
      ORDER BY "updatedAt" DESC, "createdAt" ASC, "id" ASC
    ) AS duplicate_rank
  FROM "Lead"
  WHERE "email" IS NOT NULL
)
DELETE FROM "Lead"
USING ranked
WHERE "Lead"."id" = ranked."id"
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX "Lead_tenantId_email_key" ON "Lead"("tenantId", "email");
