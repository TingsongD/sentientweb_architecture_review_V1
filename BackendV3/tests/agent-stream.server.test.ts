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

describe("agent SSE streaming", () => {
  afterEach(() => {
    loggerMock.info.mockReset();
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();
    loggerMock.debug.mockReset();
  });

  it("emits a terminal generic SSE error frame when the stream fails mid-flight", async () => {
    async function* failingGenerator(): AsyncGenerator<AgentStreamEvent> {
      yield { type: "delta", content: "Hello" };
      throw new Error("provider secret leaked");
    }

    const stream = createAgentMessageStream(failingGenerator(), {
      tenantId: "tenant_1",
      conversationId: "conversation_1",
      sessionId: "session_1",
    });
    const body = await new Response(stream).text();

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
