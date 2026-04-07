import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  getCrmSyncQueueMock,
  createCrmSyncWorkerMock,
  getCrawlQueueMock,
  createCrawlWorkerMock,
  assertAllowedOutboundUrlMock,
  embedTextMock,
  embedTextBatchMock,
  loggerMock,
} = vi.hoisted(() => ({
  prismaMock: {
    crmSyncEvent: {
      create: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    knowledgeSource: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    knowledgeChunk: {
      deleteMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
  getCrmSyncQueueMock: vi.fn(),
  createCrmSyncWorkerMock: vi.fn(),
  getCrawlQueueMock: vi.fn(),
  createCrawlWorkerMock: vi.fn(),
  assertAllowedOutboundUrlMock: vi.fn(),
  embedTextMock: vi.fn(),
  embedTextBatchMock: vi.fn(),
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
  getCrawlQueue: getCrawlQueueMock,
  createCrawlWorker: createCrawlWorkerMock,
}));

vi.mock("~/lib/outbound-url.server", () => ({
  assertAllowedOutboundUrl: assertAllowedOutboundUrlMock,
}));

vi.mock("~/lib/embeddings.server", () => ({
  embedText: embedTextMock,
  embedTextBatch: embedTextBatchMock,
}));

vi.mock("~/utils", () => ({
  logger: loggerMock,
}));

import { DependencyUnavailableError } from "~/lib/errors.server";
import { enqueueCrmSyncEvent } from "~/lib/crm-sync.server";
import {
  DEFAULT_KNOWLEDGE_TOP_K,
  enqueueKnowledgeCrawl,
  enqueueUploadedKnowledgeSource,
  buildKnowledgeContext,
  MAX_KNOWLEDGE_TOP_K,
  MIN_KNOWLEDGE_TOP_K,
  normalizeKnowledgeTopK,
  processKnowledgeSource,
  searchKnowledge,
} from "~/lib/knowledge-base.server";

describe("queue and knowledge fail-closed behavior", () => {
  beforeEach(() => {
    assertAllowedOutboundUrlMock.mockResolvedValue(new URL("https://docs.acme.com"));
    prismaMock.tenant.findUnique.mockResolvedValue({
      aiProvider: "openai",
      aiCredentialMode: "managed",
      aiApiKeyEncrypted: null,
    });
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.$executeRaw.mockResolvedValue(undefined);
    prismaMock.knowledgeSource.update.mockResolvedValue({});
    prismaMock.knowledgeChunk.deleteMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    prismaMock.crmSyncEvent.create.mockReset();
    prismaMock.tenant.findUnique.mockReset();
    prismaMock.knowledgeSource.create.mockReset();
    prismaMock.knowledgeSource.findUnique.mockReset();
    prismaMock.knowledgeSource.update.mockReset();
    prismaMock.knowledgeChunk.deleteMany.mockReset();
    prismaMock.$queryRaw.mockReset();
    prismaMock.$executeRaw.mockReset();
    getCrmSyncQueueMock.mockReset();
    createCrmSyncWorkerMock.mockReset();
    getCrawlQueueMock.mockReset();
    createCrawlWorkerMock.mockReset();
    assertAllowedOutboundUrlMock.mockReset();
    embedTextMock.mockReset();
    embedTextBatchMock.mockReset();
    loggerMock.info.mockReset();
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();
    loggerMock.debug.mockReset();
  });

  it("fails CRM enqueue before creating audit records when the queue backend is unavailable", async () => {
    getCrmSyncQueueMock.mockImplementation(() => {
      throw new DependencyUnavailableError("Redis is required for this operation.", "redis");
    });

    await expect(
      enqueueCrmSyncEvent({
        tenantId: "tenant_1",
        conversationId: "conversation_1",
        webhookUrl: "https://crm.example.com/webhook",
        payload: { email: "buyer@acme.com" },
      }),
    ).rejects.toBeInstanceOf(DependencyUnavailableError);

    expect(prismaMock.crmSyncEvent.create).not.toHaveBeenCalled();
  });

  it("fails crawl enqueue before creating a knowledge source when the queue backend is unavailable", async () => {
    getCrawlQueueMock.mockImplementation(() => {
      throw new DependencyUnavailableError("Redis is required for this operation.", "redis");
    });

    await expect(
      enqueueKnowledgeCrawl({
        tenantId: "tenant_1",
        rootUrl: "https://docs.acme.com",
      }),
    ).rejects.toBeInstanceOf(DependencyUnavailableError);

    expect(prismaMock.knowledgeSource.create).not.toHaveBeenCalled();
  });

  it("fails upload enqueue before creating a knowledge source when the queue backend is unavailable", async () => {
    getCrawlQueueMock.mockImplementation(() => {
      throw new DependencyUnavailableError("Redis is required for this operation.", "redis");
    });

    await expect(
      enqueueUploadedKnowledgeSource({
        tenantId: "tenant_1",
        rawText: "Hello world",
      }),
    ).rejects.toBeInstanceOf(DependencyUnavailableError);

    expect(prismaMock.knowledgeSource.create).not.toHaveBeenCalled();
  });

  it("passes tenant-managed OpenAI credentials into knowledge ingestion embeddings", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({
      id: "source_1",
      tenantId: "tenant_1",
      kind: "upload",
      status: "pending",
      rootUrl: null,
      sourceUrl: null,
      title: "Pricing doc",
      uploadName: "pricing.txt",
      rawText: "Pricing starts at enterprise tier.",
      tenant: {
        aiProvider: "openai",
        aiCredentialMode: "tenant_key",
        aiApiKeyEncrypted: "encrypted-openai-key",
      },
    });
    embedTextBatchMock.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await processKnowledgeSource("source_1");

    expect(embedTextBatchMock).toHaveBeenCalledWith(
      expect.any(Array),
      {
        aiProvider: "openai",
        aiCredentialMode: "tenant_key",
        aiApiKeyEncrypted: "encrypted-openai-key",
      },
    );
  });

  it("does not query pgvector when embeddings are unavailable", async () => {
    embedTextMock.mockRejectedValue(
      new DependencyUnavailableError("Knowledge embeddings are temporarily unavailable.", "embeddings"),
    );

    await expect(searchKnowledge("tenant_1", "pricing")).rejects.toBeInstanceOf(
      DependencyUnavailableError,
    );

    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it("passes tenant-managed OpenAI credentials into knowledge search embeddings", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      aiProvider: "openai",
      aiCredentialMode: "tenant_key",
      aiApiKeyEncrypted: "encrypted-openai-key",
    });
    embedTextMock.mockResolvedValue([0.1, 0.2, 0.3]);

    await searchKnowledge("tenant_1", "pricing");

    expect(embedTextMock).toHaveBeenCalledWith("pricing", {
      aiProvider: "openai",
      aiCredentialMode: "tenant_key",
      aiApiKeyEncrypted: "encrypted-openai-key",
    });
  });

  it("clamps direct knowledge-search topK values into the supported range", () => {
    expect(normalizeKnowledgeTopK("abc")).toBe(DEFAULT_KNOWLEDGE_TOP_K);
    expect(normalizeKnowledgeTopK(-1)).toBe(MIN_KNOWLEDGE_TOP_K);
    expect(normalizeKnowledgeTopK(0)).toBe(MIN_KNOWLEDGE_TOP_K);
    expect(normalizeKnowledgeTopK(42)).toBe(MAX_KNOWLEDGE_TOP_K);
    expect(normalizeKnowledgeTopK(6.8)).toBe(6);
  });

  it("returns an empty knowledge context when embeddings are unavailable", async () => {
    embedTextMock.mockRejectedValue(
      new DependencyUnavailableError("Knowledge embeddings are temporarily unavailable.", "embeddings"),
    );

    await expect(buildKnowledgeContext("tenant_1", "pricing")).resolves.toBe("");
  });
});
