import type { Tenant } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildToolExecutionPlan,
  getTenantAiConfig,
  isReadOnlyTool,
  normalizeToolSearchTopK,
  TenantAiConfigError,
} from "~/lib/agent.server";

function createTenant(overrides: Partial<Tenant> = {}) {
  return {
    id: "tenant_1",
    name: "Acme",
    primaryDomain: "acme.com",
    domains: ["acme.com"],
    allowedOrigins: ["https://acme.com"],
    publicSiteKey: "sw_pub_test",
    branding: {},
    aiProvider: "openai",
    aiModel: "gpt-4o-mini",
    aiCredentialMode: "managed",
    aiApiKeyEncrypted: null,
    qualificationPrompts: [],
    triggerConfig: {},
    proactiveMode: "reactive_only",
    calendlyAccessTokenEncrypted: null,
    calendlyEventTypeUri: null,
    crmWebhookUrl: null,
    crmWebhookSecretEncrypted: null,
    handoffWebhookUrl: null,
    handoffWebhookSecretEncrypted: null,
    operatorNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Tenant;
}

describe("agent server safety helpers", () => {
  const previousOpenAiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (previousOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAiKey;
    }
    vi.restoreAllMocks();
  });

  it("uses the managed platform key only when credential mode is managed", () => {
    process.env.OPENAI_API_KEY = "platform-key";

    const config = getTenantAiConfig(
      createTenant({ aiCredentialMode: "managed" }),
    );

    expect(config.apiKey).toBe("platform-key");
  });

  it("rejects tenant_key mode when the tenant key is missing", () => {
    process.env.OPENAI_API_KEY = "platform-key";

    expect(() =>
      getTenantAiConfig(createTenant({ aiCredentialMode: "tenant_key" })),
    ).toThrow(TenantAiConfigError);
  });

  it("groups read-only tool calls into parallel-safe batches", () => {
    const plan = buildToolExecutionPlan([
      { id: "1", name: "search_knowledge_base", arguments: {} },
      { id: "2", name: "get_visitor_context", arguments: {} },
      { id: "3", name: "qualify_lead", arguments: {} },
      { id: "4", name: "search_knowledge_base", arguments: {} },
    ]);

    expect(isReadOnlyTool("search_knowledge_base")).toBe(true);
    expect(isReadOnlyTool("qualify_lead")).toBe(false);
    expect(plan.map((batch) => batch.map((call) => call.name))).toEqual([
      ["search_knowledge_base", "get_visitor_context"],
      ["qualify_lead"],
      ["search_knowledge_base"],
    ]);
  });

  it("falls back to the default knowledge topK for invalid tool arguments", () => {
    expect(normalizeToolSearchTopK("abc")).toBe(5);
    expect(normalizeToolSearchTopK(-1)).toBe(5);
    expect(normalizeToolSearchTopK(0)).toBe(5);
    expect(normalizeToolSearchTopK(99)).toBe(5);
    expect(normalizeToolSearchTopK(7.8)).toBe(7);
  });
});
