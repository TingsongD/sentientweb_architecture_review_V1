import { afterEach, describe, expect, it, vi } from "vitest";

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("~/utils", () => ({
  logger: loggerMock,
}));

import {
  AGENT_STREAM_FAILED_CODE,
  AGENT_STREAM_FAILED_MESSAGE,
  createAgentMessageStream,
  type AgentStreamEvent,
} from "~/lib/agent.server";

const TEST_CONTEXT = {
  tenantId: "tenant_1",
  conversationId: "conversation_1",
  sessionId: "session_1",
};

describe("agent SSE streaming", () => {
  afterEach(() => {
    loggerMock.info.mockReset();
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();
    loggerMock.debug.mockReset();
  });

  it("emits conversation_start as the first SSE frame before any content", async () => {
    async function* gen(): AsyncGenerator<AgentStreamEvent> {
      yield { type: "delta", content: "Hello" };
      yield {
        type: "done",
        conversationId: "conversation_1",
        reply: "Hello",
        leadId: null,
      };
    }

    const stream = createAgentMessageStream(gen(), TEST_CONTEXT);
    const body = await new Response(stream).text();
    const frames = body
      .split("\n\n")
      .filter((f) => f.startsWith("data: "))
      .map((f) => JSON.parse(f.slice(6)));

    expect(frames[0]).toEqual({
      type: "conversation_start",
      conversationId: "conversation_1",
    });
    expect(frames.some((f) => f.type === "delta")).toBe(true);
    expect(frames.some((f) => f.type === "done")).toBe(true);
  });

  it("emits conversation_start as the first frame even when the stream fails mid-flight", async () => {
    async function* failingGenerator(): AsyncGenerator<AgentStreamEvent> {
      yield { type: "delta", content: "Hello" };
      throw new Error("provider secret leaked");
    }

    const stream = createAgentMessageStream(failingGenerator(), TEST_CONTEXT);
    const body = await new Response(stream).text();
    const frames = body
      .split("\n\n")
      .filter((f) => f.startsWith("data: "))
      .map((f) => JSON.parse(f.slice(6)));

    // conversation_start must be first so the client retains the conversationId
    expect(frames[0]).toEqual({
      type: "conversation_start",
      conversationId: "conversation_1",
    });
    expect(body).toContain('"type":"delta"');
    expect(body).toContain(`"code":"${AGENT_STREAM_FAILED_CODE}"`);
    expect(body).toContain(`"message":"${AGENT_STREAM_FAILED_MESSAGE}"`);
    expect(body).not.toContain("provider secret leaked");
    expect(loggerMock.error).toHaveBeenCalledWith(
      "Agent message streaming failed",
      expect.any(Error),
      expect.objectContaining({
        tenantId: "tenant_1",
        conversationId: "conversation_1",
        sessionId: "session_1",
      }),
    );
  });
});
