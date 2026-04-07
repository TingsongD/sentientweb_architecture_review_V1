import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminSessionMock,
  enqueueKnowledgeCrawlMock,
  enqueueUploadedKnowledgeSourceMock,
  assertAllowedOutboundUrlMock,
  prismaMock,
} = vi.hoisted(() => ({
  requireAdminSessionMock: vi.fn(),
  enqueueKnowledgeCrawlMock: vi.fn(),
  enqueueUploadedKnowledgeSourceMock: vi.fn(),
  assertAllowedOutboundUrlMock: vi.fn(),
  prismaMock: {
    knowledgeSource: {
      findMany: vi.fn(),
    },
    tenant: {
      update: vi.fn(),
    },
  },
}));

vi.mock("~/db.server", () => ({
  default: prismaMock,
}));

vi.mock("~/lib/auth.server", () => ({
  requireAdminSession: requireAdminSessionMock,
}));

vi.mock("~/lib/knowledge-base.server", () => ({
  enqueueKnowledgeCrawl: enqueueKnowledgeCrawlMock,
  enqueueUploadedKnowledgeSource: enqueueUploadedKnowledgeSourceMock,
}));

vi.mock("~/lib/outbound-url.server", () => ({
  assertAllowedOutboundUrl: assertAllowedOutboundUrlMock,
}));

import { action, loader } from "~/routes/admin.settings";

const tenant = {
  id: "tenant_1",
  name: "Acme",
  aiProvider: "openai",
  aiModel: "gpt-4o-mini",
  aiCredentialMode: "managed",
  aiApiKeyEncrypted: "encrypted-ai-key",
  calendlyAccessTokenEncrypted: "encrypted-calendly-token",
  calendlyEventTypeUri: "https://calendly.com/acme/demo",
  crmWebhookUrl: "https://crm.acme.com/webhook",
  crmWebhookSecretEncrypted: "encrypted-crm-secret",
  handoffWebhookUrl: "https://handoff.acme.com/webhook",
  handoffWebhookSecretEncrypted: "encrypted-handoff-secret",
  allowedOrigins: ["https://app.acme.com"],
  qualificationPrompts: ["What problem are you solving?"],
  branding: null,
  triggerConfig: null,
  proactiveMode: "reactive_only",
};

function buildSettingsForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("intent", "save");
  form.set("agentName", "Sentient");
  form.set("launcherLabel", "Ask Sentient");
  form.set("accentColor", "#0d7a5f");
  form.set("aiProvider", "openai");
  form.set("aiModel", "gpt-4o-mini");
  form.set("aiCredentialMode", "managed");
  form.set("tone", "calm, clear, consultative");
  form.set("qualificationPrompts", "What problem are you solving?");
  form.set("allowedOrigins", "https://app.acme.com");
  form.set("pricingMessage", "Need help with pricing?");
  form.set("docsMessage", "Still comparing options?");
  form.set("calendlyEventTypeUri", "https://calendly.com/acme/demo");
  form.set("crmWebhookUrl", "");
  form.set("handoffWebhookUrl", "");

  for (const [key, value] of Object.entries(overrides)) {
    form.set(key, value);
  }

  return form;
}

describe("admin settings route", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockResolvedValue({ tenant });
    prismaMock.knowledgeSource.findMany.mockResolvedValue([]);
    prismaMock.tenant.update.mockResolvedValue({});
    assertAllowedOutboundUrlMock.mockResolvedValue(new URL("https://example.com"));
  });

  afterEach(() => {
    requireAdminSessionMock.mockReset();
    enqueueKnowledgeCrawlMock.mockReset();
    enqueueUploadedKnowledgeSourceMock.mockReset();
    assertAllowedOutboundUrlMock.mockReset();
    prismaMock.knowledgeSource.findMany.mockReset();
    prismaMock.tenant.update.mockReset();
  });

  it("returns configured flags instead of decrypted masked secrets", async () => {
    const result = await loader({
      request: new Request("http://localhost:3000/admin/settings"),
    } as never);

    expect(result).toMatchObject({
      configured: {
        aiApiKey: true,
        calendlyAccessToken: true,
        crmWebhookSecret: true,
        handoffWebhookSecret: true,
      },
    });
    expect(result).not.toHaveProperty("masked");
  });

  it("rejects invalid allowed origins before saving tenant settings", async () => {
    const result = await action({
      request: new Request("http://localhost:3000/admin/settings", {
        method: "POST",
        body: buildSettingsForm({
          allowedOrigins: "http://app.acme.com\nhttps://docs.acme.com/path",
        }),
      }),
    } as never);

    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("Allowed origins"),
    });
    expect(prismaMock.tenant.update).not.toHaveBeenCalled();
  });

  it("canonicalizes and dedupes allowed origins while preserving existing encrypted secrets on blank input", async () => {
    await action({
      request: new Request("http://localhost:3000/admin/settings", {
        method: "POST",
        body: buildSettingsForm({
          allowedOrigins:
            "https://App.Acme.com/\nhttps://app.acme.com\nhttps://Docs.Acme.com:8443/",
          aiApiKey: "",
          calendlyAccessToken: "",
          crmWebhookSecret: "",
          handoffWebhookSecret: "",
        }),
      }),
    } as never);

    expect(prismaMock.tenant.update).toHaveBeenCalledWith({
      where: { id: tenant.id },
      data: expect.objectContaining({
        allowedOrigins: [
          "https://app.acme.com",
          "https://docs.acme.com:8443",
        ],
        aiApiKeyEncrypted: tenant.aiApiKeyEncrypted,
        calendlyAccessTokenEncrypted: tenant.calendlyAccessTokenEncrypted,
        crmWebhookSecretEncrypted: tenant.crmWebhookSecretEncrypted,
        handoffWebhookSecretEncrypted: tenant.handoffWebhookSecretEncrypted,
      }),
    });
  });
});
