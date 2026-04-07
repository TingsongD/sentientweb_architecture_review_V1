import { afterEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  queueMock,
  getCrmSyncQueueMock,
  createCrmSyncWorkerMock,
  pushCrmContactWebhookMock,
  decryptSecretMock,
  loggerMock,
} = vi.hoisted(() => ({
  prismaMock: {
    crmSyncEvent: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    toolExecution: {
      update: vi.fn(),
    },
  },
  queueMock: {
    add: vi.fn(),
  },
  getCrmSyncQueueMock: vi.fn(),
  createCrmSyncWorkerMock: vi.fn(),
  pushCrmContactWebhookMock: vi.fn(),
  decryptSecretMock: vi.fn((value: string) => value),
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("~/db.server", () => ({
  default: prismaMock,
}));

vi.mock("~/lib/queue.server", () => ({
  getCrmSyncQueue: getCrmSyncQueueMock,
  createCrmSyncWorker: createCrmSyncWorkerMock,
}));

vi.mock("~/lib/webhook-crm.server", () => ({
  pushCrmContactWebhook: pushCrmContactWebhookMock,
}));

vi.mock("~/lib/crypto.server", () => ({
  decryptSecret: decryptSecretMock,
}));

vi.mock("~/utils", () => ({
  logger: loggerMock,
}));

import {
  enqueueCrmSyncEvent,
  processCrmSyncEvent,
} from "~/lib/crm-sync.server";

describe("CRM sync lifecycle", () => {
  afterEach(() => {
    prismaMock.crmSyncEvent.create.mockReset();
    prismaMock.crmSyncEvent.findUnique.mockReset();
    prismaMock.crmSyncEvent.update.mockReset();
    prismaMock.toolExecution.update.mockReset();
    queueMock.add.mockReset();
    getCrmSyncQueueMock.mockReset();
    createCrmSyncWorkerMock.mockReset();
    pushCrmContactWebhookMock.mockReset();
    decryptSecretMock.mockClear();
    loggerMock.info.mockReset();
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();
    loggerMock.debug.mockReset();
  });

  it("queues CRM sync jobs instead of blocking the request path", async () => {
    prismaMock.crmSyncEvent.create.mockResolvedValue({ id: "crm_1" });
    getCrmSyncQueueMock.mockReturnValue(queueMock);

    const event = await enqueueCrmSyncEvent({
      tenantId: "tenant_1",
      conversationId: "conversation_1",
      leadId: "lead_1",
      webhookUrl: "https://crm.example.com/webhook",
      payload: { email: "buyer@acme.com" },
      toolExecutionId: "tool_1",
    });

    expect(event.id).toBe("crm_1");
    expect(queueMock.add).toHaveBeenCalledWith(
      "crm-sync",
      { crmSyncEventId: "crm_1", tenantId: "tenant_1" },
      expect.objectContaining({
        attempts: 4,
      }),
    );
  });

  it("marks CRM sync jobs successful after the worker posts the webhook", async () => {
    prismaMock.crmSyncEvent.findUnique.mockResolvedValue({
      id: "crm_1",
      webhookUrl: "https://crm.example.com/webhook",
      payload: { email: "buyer@acme.com" },
      toolExecutionId: "tool_1",
      tenant: {
        name: "Acme",
        crmWebhookSecretEncrypted: "secret",
      },
    });
    prismaMock.crmSyncEvent.update.mockResolvedValue({});
    prismaMock.toolExecution.update.mockResolvedValue({});
    pushCrmContactWebhookMock.mockResolvedValue({ status: 202 });

    const result = await processCrmSyncEvent("crm_1", 1);

    expect(result).toEqual({
      ok: true,
      crmSyncEventId: "crm_1",
      status: "success",
      responseStatus: 202,
    });
    expect(prismaMock.crmSyncEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "crm_1" },
        data: expect.objectContaining({
          status: "success",
          responseStatus: 202,
        }),
      }),
    );
    expect(prismaMock.toolExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tool_1" },
        data: expect.objectContaining({
          status: "success",
        }),
      }),
    );
  });

  it("marks final-attempt CRM sync failures as failed", async () => {
    prismaMock.crmSyncEvent.findUnique.mockResolvedValue({
      id: "crm_1",
      webhookUrl: "https://crm.example.com/webhook",
      payload: { email: "buyer@acme.com" },
      toolExecutionId: "tool_1",
      tenant: {
        name: "Acme",
        crmWebhookSecretEncrypted: null,
      },
    });
    prismaMock.crmSyncEvent.update.mockResolvedValue({});
    prismaMock.toolExecution.update.mockResolvedValue({});
    pushCrmContactWebhookMock.mockRejectedValue(new Error("Webhook timeout"));

    await expect(processCrmSyncEvent("crm_1", 4)).rejects.toThrow(
      "Webhook timeout",
    );

    expect(prismaMock.crmSyncEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "crm_1" },
        data: expect.objectContaining({
          status: "failed",
          errorMessage: "Webhook timeout",
        }),
      }),
    );
    expect(prismaMock.toolExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tool_1" },
        data: expect.objectContaining({
          status: "error",
        }),
      }),
    );
  });
});
