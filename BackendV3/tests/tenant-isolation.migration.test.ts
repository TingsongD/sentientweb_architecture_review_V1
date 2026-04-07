import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260407213000_tenant_rls_isolation/migration.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");

describe("tenant isolation migration", () => {
  it("backfills Message.tenantId from Conversation before enforcing NOT NULL", () => {
    expect(migrationSql).toContain(
      'ALTER TABLE "Message"\nADD COLUMN "tenantId" TEXT;',
    );
    expect(migrationSql).toContain(
      'UPDATE "Message" AS "message"\nSET "tenantId" = "conversation"."tenantId"',
    );
    expect(migrationSql).toContain(
      'ALTER TABLE "Message"\nALTER COLUMN "tenantId" SET NOT NULL;',
    );
  });

  it("adds tenant-bound composite foreign keys for customer data relations", () => {
    expect(migrationSql).toContain(
      'FOREIGN KEY ("conversationId", "tenantId") REFERENCES "Conversation"("id", "tenantId")',
    );
    expect(migrationSql).toContain(
      'FOREIGN KEY ("leadId", "tenantId") REFERENCES "Lead"("id", "tenantId")',
    );
    expect(migrationSql).toContain(
      'FOREIGN KEY ("toolExecutionId", "tenantId") REFERENCES "ToolExecution"("id", "tenantId")',
    );
    expect(migrationSql).toContain(
      'FOREIGN KEY ("siteInstallId", "tenantId") REFERENCES "SiteInstall"("id", "tenantId")',
    );
    expect(migrationSql).toContain(
      'FOREIGN KEY ("sourceId", "tenantId") REFERENCES "KnowledgeSource"("id", "tenantId")',
    );
  });

  it("forces row level security across every tenant-owned table in scope", () => {
    const rlsTables = [
      "Tenant",
      "SiteInstall",
      "SiteInstallSession",
      "KnowledgeSource",
      "KnowledgeChunk",
      "Conversation",
      "Message",
      "BehaviorEvent",
      "Lead",
      "DemoBooking",
      "ToolExecution",
      "CrmSyncEvent",
    ];

    for (const table of rlsTables) {
      expect(migrationSql).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`,
      );
      expect(migrationSql).toContain(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`,
      );
      expect(migrationSql).toContain(
        `CREATE POLICY "${table}_tenant_isolation"`,
      );
    }
  });
});
