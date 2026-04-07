-- Add direct tenant ownership to Message so every customer-facing row is
-- tenant-scoped at the table level.
ALTER TABLE "Message"
ADD COLUMN "tenantId" TEXT;

UPDATE "Message" AS "message"
SET "tenantId" = "conversation"."tenantId"
FROM "Conversation" AS "conversation"
WHERE "message"."conversationId" = "conversation"."id";

ALTER TABLE "Message"
ALTER COLUMN "tenantId" SET NOT NULL;

-- Composite unique keys let child records prove they point at parents inside
-- the same tenant, not just the same row id.
CREATE UNIQUE INDEX "SiteInstall_id_tenantId_key"
  ON "SiteInstall" ("id", "tenantId");

CREATE UNIQUE INDEX "KnowledgeSource_id_tenantId_key"
  ON "KnowledgeSource" ("id", "tenantId");

CREATE UNIQUE INDEX "Conversation_id_tenantId_key"
  ON "Conversation" ("id", "tenantId");

CREATE UNIQUE INDEX "Lead_id_tenantId_key"
  ON "Lead" ("id", "tenantId");

CREATE UNIQUE INDEX "ToolExecution_id_tenantId_key"
  ON "ToolExecution" ("id", "tenantId");

DROP INDEX "Message_conversationId_createdAt_idx";

CREATE INDEX "Message_tenantId_conversationId_createdAt_idx"
  ON "Message" ("tenantId", "conversationId", "createdAt");

-- Replace single-column foreign keys with tenant-bound foreign keys.
ALTER TABLE "SiteInstallSession"
DROP CONSTRAINT "SiteInstallSession_siteInstallId_fkey";

ALTER TABLE "KnowledgeChunk"
DROP CONSTRAINT "KnowledgeChunk_sourceId_fkey";

ALTER TABLE "Conversation"
DROP CONSTRAINT "Conversation_leadId_fkey";

ALTER TABLE "Message"
DROP CONSTRAINT "Message_conversationId_fkey";

ALTER TABLE "BehaviorEvent"
DROP CONSTRAINT "BehaviorEvent_conversationId_fkey";

ALTER TABLE "DemoBooking"
DROP CONSTRAINT "DemoBooking_conversationId_fkey";

ALTER TABLE "DemoBooking"
DROP CONSTRAINT "DemoBooking_leadId_fkey";

ALTER TABLE "CrmSyncEvent"
DROP CONSTRAINT "CrmSyncEvent_conversationId_fkey";

ALTER TABLE "CrmSyncEvent"
DROP CONSTRAINT "CrmSyncEvent_leadId_fkey";

ALTER TABLE "CrmSyncEvent"
DROP CONSTRAINT "CrmSyncEvent_toolExecutionId_fkey";

ALTER TABLE "Message"
ADD CONSTRAINT "Message_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SiteInstallSession"
ADD CONSTRAINT "SiteInstallSession_siteInstallId_tenantId_fkey"
FOREIGN KEY ("siteInstallId", "tenantId") REFERENCES "SiteInstall"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeChunk"
ADD CONSTRAINT "KnowledgeChunk_sourceId_tenantId_fkey"
FOREIGN KEY ("sourceId", "tenantId") REFERENCES "KnowledgeSource"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_leadId_tenantId_fkey"
FOREIGN KEY ("leadId", "tenantId") REFERENCES "Lead"("id", "tenantId")
ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "Message"
ADD CONSTRAINT "Message_conversationId_tenantId_fkey"
FOREIGN KEY ("conversationId", "tenantId") REFERENCES "Conversation"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BehaviorEvent"
ADD CONSTRAINT "BehaviorEvent_conversationId_tenantId_fkey"
FOREIGN KEY ("conversationId", "tenantId") REFERENCES "Conversation"("id", "tenantId")
ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "DemoBooking"
ADD CONSTRAINT "DemoBooking_conversationId_tenantId_fkey"
FOREIGN KEY ("conversationId", "tenantId") REFERENCES "Conversation"("id", "tenantId")
ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "DemoBooking"
ADD CONSTRAINT "DemoBooking_leadId_tenantId_fkey"
FOREIGN KEY ("leadId", "tenantId") REFERENCES "Lead"("id", "tenantId")
ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "ToolExecution"
ADD CONSTRAINT "ToolExecution_conversationId_tenantId_fkey"
FOREIGN KEY ("conversationId", "tenantId") REFERENCES "Conversation"("id", "tenantId")
ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "CrmSyncEvent"
ADD CONSTRAINT "CrmSyncEvent_conversationId_tenantId_fkey"
FOREIGN KEY ("conversationId", "tenantId") REFERENCES "Conversation"("id", "tenantId")
ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "CrmSyncEvent"
ADD CONSTRAINT "CrmSyncEvent_leadId_tenantId_fkey"
FOREIGN KEY ("leadId", "tenantId") REFERENCES "Lead"("id", "tenantId")
ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "CrmSyncEvent"
ADD CONSTRAINT "CrmSyncEvent_toolExecutionId_tenantId_fkey"
FOREIGN KEY ("toolExecutionId", "tenantId") REFERENCES "ToolExecution"("id", "tenantId")
ON DELETE NO ACTION ON UPDATE CASCADE;

-- Force tenant isolation at the database layer.
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant_tenant_isolation" ON "Tenant";
CREATE POLICY "Tenant_tenant_isolation" ON "Tenant"
USING (
  current_setting('app.bypass_rls', true) = 'on'
  OR "id" = NULLIF(current_setting('app.tenant_id', true), '')
)
WITH CHECK (
  current_setting('app.bypass_rls', true) = 'on'
  OR "id" = NULLIF(current_setting('app.tenant_id', true), '')
);

ALTER TABLE "SiteInstall" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteInstall" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SiteInstall_tenant_isolation" ON "SiteInstall";
CREATE POLICY "SiteInstall_tenant_isolation" ON "SiteInstall"
USING (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
)
WITH CHECK (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
);

ALTER TABLE "SiteInstallSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteInstallSession" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SiteInstallSession_tenant_isolation" ON "SiteInstallSession";
CREATE POLICY "SiteInstallSession_tenant_isolation" ON "SiteInstallSession"
USING (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
)
WITH CHECK (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
);

ALTER TABLE "KnowledgeSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeSource" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "KnowledgeSource_tenant_isolation" ON "KnowledgeSource";
CREATE POLICY "KnowledgeSource_tenant_isolation" ON "KnowledgeSource"
USING (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
)
WITH CHECK (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
);

ALTER TABLE "KnowledgeChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeChunk" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "KnowledgeChunk_tenant_isolation" ON "KnowledgeChunk";
CREATE POLICY "KnowledgeChunk_tenant_isolation" ON "KnowledgeChunk"
USING (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
)
WITH CHECK (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
);

ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Conversation_tenant_isolation" ON "Conversation";
CREATE POLICY "Conversation_tenant_isolation" ON "Conversation"
USING (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
)
WITH CHECK (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
);

ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Message_tenant_isolation" ON "Message";
CREATE POLICY "Message_tenant_isolation" ON "Message"
USING (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
)
WITH CHECK (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
);

ALTER TABLE "BehaviorEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BehaviorEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "BehaviorEvent_tenant_isolation" ON "BehaviorEvent";
CREATE POLICY "BehaviorEvent_tenant_isolation" ON "BehaviorEvent"
USING (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
)
WITH CHECK (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
);

ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lead" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lead_tenant_isolation" ON "Lead";
CREATE POLICY "Lead_tenant_isolation" ON "Lead"
USING (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
)
WITH CHECK (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
);

ALTER TABLE "DemoBooking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DemoBooking" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "DemoBooking_tenant_isolation" ON "DemoBooking";
CREATE POLICY "DemoBooking_tenant_isolation" ON "DemoBooking"
USING (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
)
WITH CHECK (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
);

ALTER TABLE "ToolExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ToolExecution" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ToolExecution_tenant_isolation" ON "ToolExecution";
CREATE POLICY "ToolExecution_tenant_isolation" ON "ToolExecution"
USING (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
)
WITH CHECK (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
);

ALTER TABLE "CrmSyncEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CrmSyncEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CrmSyncEvent_tenant_isolation" ON "CrmSyncEvent";
CREATE POLICY "CrmSyncEvent_tenant_isolation" ON "CrmSyncEvent"
USING (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
)
WITH CHECK (
  current_setting('app.bypass_rls', true) = 'on'
  OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
);
