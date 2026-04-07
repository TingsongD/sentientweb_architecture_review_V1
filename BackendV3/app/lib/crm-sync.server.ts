import { Prisma } from "@prisma/client";
import type { Worker } from "bullmq";
import prisma from "~/db.server";
import { decryptSecret } from "./crypto.server";
import { createCrmSyncWorker, getCrmSyncQueue } from "./queue.server";
import { pushCrmContactWebhook } from "./webhook-crm.server";
import { logger } from "~/utils";

const CRM_SYNC_MAX_ATTEMPTS = 4;

let crmSyncWorker: Worker | null = null;

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function enqueueCrmSyncEvent(input: {
  tenantId: string;
  conversationId?: string | null;
  leadId?: string | null;
  webhookUrl: string;
  payload: Record<string, unknown>;
  toolExecutionId?: string | null;
}) {
  const queue = getCrmSyncQueue();
  const crmSyncEvent = await prisma.crmSyncEvent.create({
    data: {
      tenantId: input.tenantId,
      conversationId: input.conversationId ?? null,
      leadId: input.leadId ?? null,
      toolExecutionId: input.toolExecutionId ?? null,
      webhookUrl: input.webhookUrl,
      payload: toPrismaJson(input.payload)
    }
  });

  await queue.add(
    "crm-sync",
    { crmSyncEventId: crmSyncEvent.id },
    {
      attempts: CRM_SYNC_MAX_ATTEMPTS,
      backoff: {
        type: "exponential",
        delay: 5000
      },
      removeOnComplete: 100,
      removeOnFail: 100
    }
  );

  return crmSyncEvent;
}

async function updateToolExecutionStatus(
  toolExecutionId: string | null | undefined,
  status: string,
  output: Record<string, unknown>
) {
  if (!toolExecutionId) return;

  await prisma.toolExecution.update({
    where: { id: toolExecutionId },
    data: {
      status,
      output: toPrismaJson(output)
    }
  });
}

export async function processCrmSyncEvent(crmSyncEventId: string, attemptNumber: number) {
  const crmSyncEvent = await prisma.crmSyncEvent.findUnique({
    where: { id: crmSyncEventId },
    include: {
      tenant: true,
      toolExecution: true
    }
  });

  if (!crmSyncEvent) return null;

  await prisma.crmSyncEvent.update({
    where: { id: crmSyncEvent.id },
    data: {
      status: "processing",
      attempts: attemptNumber,
      errorMessage: null
    }
  });

  try {
    const response = await pushCrmContactWebhook({
      webhookUrl: crmSyncEvent.webhookUrl,
      secret: crmSyncEvent.tenant.crmWebhookSecretEncrypted
        ? decryptSecret(crmSyncEvent.tenant.crmWebhookSecretEncrypted)
        : null,
      tenantName: crmSyncEvent.tenant.name,
      payload: crmSyncEvent.payload as Record<string, unknown>
    });

    const output = {
      ok: true,
      crmSyncEventId: crmSyncEvent.id,
      status: "success",
      responseStatus: response.status
    };

    await Promise.all([
      prisma.crmSyncEvent.update({
        where: { id: crmSyncEvent.id },
        data: {
          status: "success",
          responseStatus: response.status,
          processedAt: new Date(),
          errorMessage: null
        }
      }),
      updateToolExecutionStatus(crmSyncEvent.toolExecutionId, "success", output)
    ]);

    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown CRM sync failure";
    const finalAttempt = attemptNumber >= CRM_SYNC_MAX_ATTEMPTS;
    const status = finalAttempt ? "failed" : "retrying";

    await Promise.all([
      prisma.crmSyncEvent.update({
        where: { id: crmSyncEvent.id },
        data: {
          status,
          errorMessage: message,
          processedAt: finalAttempt ? new Date() : null
        }
      }),
      updateToolExecutionStatus(crmSyncEvent.toolExecutionId, finalAttempt ? "error" : "queued", {
        ok: false,
        crmSyncEventId: crmSyncEvent.id,
        status,
        error: message
      })
    ]);

    logger.error("CRM sync job failed", error, { crmSyncEventId, attemptNumber });
    throw error;
  }
}

export function startCrmSyncWorker() {
  if (crmSyncWorker) {
    return crmSyncWorker;
  }

  const worker = createCrmSyncWorker(async (job) => {
    const crmSyncEventId = String(job.data?.crmSyncEventId ?? "");
    if (!crmSyncEventId) return;
    await processCrmSyncEvent(crmSyncEventId, job.attemptsMade + 1);
  });

  if (!worker) {
    logger.warn("Sentient CRM sync worker could not start");
    return null;
  }

  crmSyncWorker = worker;
  logger.info("Sentient CRM sync worker started");
  return worker;
}

export async function stopCrmSyncWorker() {
  if (!crmSyncWorker) return;
  await crmSyncWorker.close();
  crmSyncWorker = null;
}
