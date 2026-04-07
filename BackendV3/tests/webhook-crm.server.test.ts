import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetchMock, loggerMock } = vi.hoisted(() => ({
  safeFetchMock: vi.fn(),
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("~/lib/outbound-url.server", () => ({
  safeFetch: safeFetchMock,
}));

vi.mock("~/utils", () => ({
  logger: loggerMock,
}));

import {
  pushCrmContactWebhook,
  routeToHumanWebhook,
} from "~/lib/webhook-crm.server";

describe("webhook logging hygiene", () => {
  beforeEach(() => {
    safeFetchMock.mockResolvedValue({
      ok: true,
      status: 202,
    });
  });

  afterEach(() => {
    safeFetchMock.mockReset();
    loggerMock.info.mockReset();
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();
    loggerMock.debug.mockReset();
  });

  it("redacts CRM webhook URLs from logs", async () => {
    await pushCrmContactWebhook({
      webhookUrl: "https://crm.example.com/webhook?token=secret",
      tenantName: "Acme",
      payload: { email: "buyer@acme.com" },
    });

    expect(loggerMock.info).toHaveBeenCalledWith(
      "Posting CRM webhook",
      expect.objectContaining({
        eventType: "crm.contact.upsert",
        tenantName: "Acme",
        webhookUrlFingerprint: expect.stringMatching(/^[a-f0-9]{12}$/),
      }),
    );
    expect(loggerMock.info.mock.calls[0]?.[1]).not.toHaveProperty("webhookUrl");
  });

  it("redacts handoff webhook URLs from logs", async () => {
    await routeToHumanWebhook({
      webhookUrl: "https://handoff.example.com/notify?token=secret",
      payload: { leadId: "lead_1" },
    });

    expect(loggerMock.info).toHaveBeenCalledWith(
      "Posting handoff webhook",
      expect.objectContaining({
        eventType: "handoff.requested",
        webhookUrlFingerprint: expect.stringMatching(/^[a-f0-9]{12}$/),
      }),
    );
    expect(loggerMock.info.mock.calls[0]?.[1]).not.toHaveProperty("webhookUrl");
  });
});
