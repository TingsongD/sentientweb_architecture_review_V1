import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  authenticateVisitorRequestMock,
  checkRateLimitMock,
  getOrCreateConversationMock,
  getTenantAiConfigMock,
  handleAgentMessageMock,
  handleAgentMessageStreamMock,
  requireRedisMock,
  insertBehaviorEventsMock,
  evaluateTriggersMock,
  requireAdminSessionMock,
  enqueueKnowledgeCrawlMock,
  testGenericWebhookMock,
  prismaMock,
} = vi.hoisted(() => ({
  authenticateVisitorRequestMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getOrCreateConversationMock: vi.fn(),
  getTenantAiConfigMock: vi.fn(),
  handleAgentMessageMock: vi.fn(),
  handleAgentMessageStreamMock: vi.fn(),
  requireRedisMock: vi.fn(),
  insertBehaviorEventsMock: vi.fn(),
  evaluateTriggersMock: vi.fn(),
  requireAdminSessionMock: vi.fn(),
  enqueueKnowledgeCrawlMock: vi.fn(),
  testGenericWebhookMock: vi.fn(),
  prismaMock: {
    conversation: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("~/lib/site-install.server", () => ({
  authenticateVisitorRequest: authenticateVisitorRequestMock,
}));

vi.mock("~/lib/origin.server", () => ({
  getCorsHeaders: vi.fn(() => ({})),
}));

vi.mock("~/lib/rate-limit.server", () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("~/db.server", () => ({
  default: prismaMock,
}));

vi.mock("~/lib/agent.server", () => ({
  getOrCreateConversation: getOrCreateConversationMock,
  getTenantAiConfig: getTenantAiConfigMock,
  handleAgentMessage: handleAgentMessageMock,
  handleAgentMessageStream: handleAgentMessageStreamMock,
  TenantAiConfigError: class TenantAiConfigError extends Error {},
}));

vi.mock("~/lib/redis.server", () => ({
  requireRedis: requireRedisMock,
}));

vi.mock("~/lib/behavior-events.server", () => ({
  insertBehaviorEvents: insertBehaviorEventsMock,
}));

vi.mock("~/lib/triggers.server", () => ({
  evaluateTriggers: evaluateTriggersMock,
}));

vi.mock("~/lib/auth.server", () => ({
  requireAdminSession: requireAdminSessionMock,
}));

vi.mock("~/lib/knowledge-base.server", () => ({
  enqueueKnowledgeCrawl: enqueueKnowledgeCrawlMock,
}));

vi.mock("~/lib/webhook-crm.server", () => ({
  testGenericWebhook: testGenericWebhookMock,
}));

import { DependencyUnavailableError, BlockedUrlError, InvalidConversationError } from "~/lib/errors.server";
import { action as agentAction } from "~/routes/api.agent.message";
import { action as eventsAction } from "~/routes/api.events";
import { action as crawlAction } from "~/routes/api.onboarding.crawl";
import { action as crmWebhookTestAction } from "~/routes/api.admin.integrations.crm-webhook-test";

describe("public API hardening", () => {
  beforeEach(() => {
    authenticateVisitorRequestMock.mockResolvedValue({
      tenant: {
        id: "tenant_1",
        name: "Acme",
        proactiveMode: "reactive_only",
      },
      install: {
        id: "install_1",
        origin: "https://acme.com",
      },
      sessionId: "session_1",
    });
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      limit: 25,
      remaining: 24,
      resetAt: Date.now() + 60_000,
    });
    getTenantAiConfigMock.mockReturnValue({});
    getOrCreateConversationMock.mockResolvedValue({
      id: "conversation_1",
      lead: null,
    });
    handleAgentMessageMock.mockResolvedValue({
      conversationId: "conversation_1",
      reply: "Hello",
      leadId: null,
    });
    handleAgentMessageStreamMock.mockResolvedValue(new ReadableStream());
    requireRedisMock.mockReturnValue({
      smembers: vi.fn().mockResolvedValue([]),
      sadd: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
    });
    insertBehaviorEventsMock.mockResolvedValue(undefined);
    evaluateTriggersMock.mockReturnValue(null);
    requireAdminSessionMock.mockResolvedValue({
      tenant: { id: "tenant_1" },
    });
    enqueueKnowledgeCrawlMock.mockResolvedValue({ id: "source_1" });
    testGenericWebhookMock.mockResolvedValue({ ok: true });
    prismaMock.conversation.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    authenticateVisitorRequestMock.mockReset();
    checkRateLimitMock.mockReset();
    getOrCreateConversationMock.mockReset();
    getTenantAiConfigMock.mockReset();
    handleAgentMessageMock.mockReset();
    handleAgentMessageStreamMock.mockReset();
    requireRedisMock.mockReset();
    insertBehaviorEventsMock.mockReset();
    evaluateTriggersMock.mockReset();
    requireAdminSessionMock.mockReset();
    enqueueKnowledgeCrawlMock.mockReset();
    testGenericWebhookMock.mockReset();
    prismaMock.conversation.findMany.mockReset();
  });

  it("returns INVALID_CONVERSATION when the supplied conversation does not belong to the session", async () => {
    getOrCreateConversationMock.mockRejectedValue(new InvalidConversationError());

    const response = await agentAction({
      request: new Request("http://localhost:3000/api/agent/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://acme.com",
        },
        body: JSON.stringify({
          siteKey: "sw_pub_test",
          sessionId: "session_1",
          conversationId: "550e8400-e29b-41d4-a716-446655440000",
          message: "hello",
        }),
      }),
    } as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_CONVERSATION",
    });
  });

  it("returns DEPENDENCY_UNAVAILABLE from agent message when Redis-backed rate limiting is unavailable", async () => {
    checkRateLimitMock.mockRejectedValue(
      new DependencyUnavailableError("Redis is required for this operation.", "redis"),
    );

    const response = await agentAction({
      request: new Request("http://localhost:3000/api/agent/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://acme.com",
        },
        body: JSON.stringify({
          siteKey: "sw_pub_test",
          sessionId: "session_1",
          message: "hello",
        }),
      }),
    } as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
    });
  });

  it("returns DEPENDENCY_UNAVAILABLE from events when Redis is unavailable for trigger tracking", async () => {
    requireRedisMock.mockImplementation(() => {
      throw new DependencyUnavailableError("Redis is required for this operation.", "redis");
    });

    const response = await eventsAction({
      request: new Request("http://localhost:3000/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://acme.com",
        },
        body: JSON.stringify({
          siteKey: "sw_pub_test",
          events: [
            {
              sessionId: "session_1",
              eventType: "page_view",
              source: "widget",
            },
          ],
        }),
      }),
    } as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
    });
  });

  it("rejects mixed-session event batches", async () => {
    const response = await eventsAction({
      request: new Request("http://localhost:3000/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://acme.com",
        },
        body: JSON.stringify({
          siteKey: "sw_pub_test",
          events: [
            {
              sessionId: "session_1",
              eventType: "page_view",
              source: "widget",
            },
            {
              sessionId: "session_2",
              eventType: "widget_opened",
              source: "widget",
            },
          ],
        }),
      }),
    } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "SESSION_MISMATCH",
    });
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });

  it("rate-limits event batches using their shared sessionId", async () => {
    const response = await eventsAction({
      request: new Request("http://localhost:3000/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://acme.com",
        },
        body: JSON.stringify({
          siteKey: "sw_pub_test",
          events: [
            {
              sessionId: "session_1",
              eventType: "page_view",
              source: "widget",
            },
            {
              sessionId: "session_1",
              eventType: "widget_opened",
              source: "widget",
            },
          ],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "events:install_1:session_1",
      120,
      60,
    );
  });

  it("returns DEPENDENCY_UNAVAILABLE when crawl enqueueing cannot access its queue backend", async () => {
    enqueueKnowledgeCrawlMock.mockRejectedValue(
      new DependencyUnavailableError("Redis is required for this operation.", "redis"),
    );

    const response = await crawlAction({
      request: new Request("http://localhost:3000/api/onboarding/crawl", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rootUrl: "https://docs.acme.com",
        }),
      }),
    } as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
    });
  });

  it("returns BLOCKED_URL when an admin webhook test targets a blocked URL", async () => {
    testGenericWebhookMock.mockRejectedValue(
      new BlockedUrlError("Localhost targets are not allowed."),
    );

    const response = await crmWebhookTestAction({
      request: new Request("http://localhost:3000/api/admin/integrations/crm-webhook-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          webhookUrl: "http://localhost:3001/test",
        }),
      }),
    } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "BLOCKED_URL",
    });
  });
});
