import { afterEach, describe, expect, it, vi } from "vitest";
import { DependencyUnavailableError } from "~/lib/errors.server";

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
  resolveMagicLinkBaseUrl,
  sendAdminMagicLinkEmail,
} from "~/lib/magic-link-email.server";

describe("magic-link email delivery", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    loggerMock.info.mockReset();
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();
    loggerMock.debug.mockReset();
    vi.unstubAllEnvs();
  });

  it("falls back to localhost preview URLs outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.MAGIC_LINK_BASE_URL;
    delete process.env.APP_URL;

    expect(resolveMagicLinkBaseUrl().toString()).toBe("http://localhost:3000/");
  });

  it("rejects missing production magic-link base URLs", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.MAGIC_LINK_BASE_URL;
    delete process.env.APP_URL;

    expect(() => resolveMagicLinkBaseUrl()).toThrow(DependencyUnavailableError);
  });

  it("rejects localhost production magic-link base URLs", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAGIC_LINK_BASE_URL", "http://localhost:3000");

    expect(() => resolveMagicLinkBaseUrl()).toThrow(DependencyUnavailableError);
  });

  it("wraps fetch rejections as dependency failures", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("MAGIC_LINK_FROM_EMAIL", "ops@example.com");
    vi.stubEnv("MAGIC_LINK_BASE_URL", "https://app.example.com");
    global.fetch = vi.fn().mockRejectedValue(new TypeError("network down")) as typeof fetch;

    await expect(
      sendAdminMagicLinkEmail({
        toEmail: "owner@example.com",
        magicUrl: "https://app.example.com/admin/auth/magic?token=test",
        tenantName: "Acme",
      }),
    ).rejects.toMatchObject({
      name: "DependencyUnavailableError",
      dependency: "resend",
    });
    expect(loggerMock.error).toHaveBeenCalledWith(
      "Resend magic-link email request failed",
      expect.any(TypeError),
    );
  });

  it("wraps non-2xx Resend responses as dependency failures", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("MAGIC_LINK_FROM_EMAIL", "ops@example.com");
    vi.stubEnv("MAGIC_LINK_BASE_URL", "https://app.example.com");
    global.fetch = vi.fn().mockResolvedValue(
      new Response("upstream exploded", { status: 503 }),
    ) as typeof fetch;

    await expect(
      sendAdminMagicLinkEmail({
        toEmail: "owner@example.com",
        magicUrl: "https://app.example.com/admin/auth/magic?token=test",
        tenantName: "Acme",
      }),
    ).rejects.toMatchObject({
      name: "DependencyUnavailableError",
      dependency: "resend",
    });
    expect(loggerMock.error).toHaveBeenCalledWith(
      "Resend magic-link email request failed",
      undefined,
      expect.objectContaining({
        status: 503,
        bodySnippet: "upstream exploded",
      }),
    );
  });
});
