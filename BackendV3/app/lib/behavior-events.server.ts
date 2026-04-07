import type { Prisma } from "@prisma/client";
import { withTenantDb } from "./tenant-db.server";

export interface BehaviorEventInsert {
  tenantId: string;
  sessionId: string;
  eventType: string;
  source: string;
  pageUrl?: string | null;
  conversationId?: string | null;
  payload: Prisma.InputJsonValue;
  occurredAt?: Date;
}

export async function insertBehaviorEvents(rows: BehaviorEventInsert[]) {
  if (rows.length === 0) return;
  const tenantId = rows[0].tenantId;
  if (rows.some((row) => row.tenantId !== tenantId)) {
    throw new Error("Behavior event batches must belong to one tenant.");
  }

  await withTenantDb(tenantId, (db) =>
    db.behaviorEvent.createMany({
      data: rows.map((row) => ({
        tenantId: row.tenantId,
        sessionId: row.sessionId,
        eventType: row.eventType,
        source: row.source,
        pageUrl: row.pageUrl ?? null,
        conversationId: row.conversationId ?? null,
        payload: row.payload,
        occurredAt: row.occurredAt ?? new Date(),
      })),
    }),
  );
}
