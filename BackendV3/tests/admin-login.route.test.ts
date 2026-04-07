import { afterEach, describe, expect, it, vi } from "vitest";
import { DependencyUnavailableError } from "~/lib/errors.server";

const { prismaMock, createMagicLinkMock, checkRateLimitMock, loggerMock } = vi.hoisted(
  () => ({
    prismaMock: {
      tenant: {
        count: vi.fn(),
      },
    },
    createMagicLinkMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    loggerMock: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }),
);

vi.mock("~/db.server", () => ({
  default: prismaMock,
}));

vi.mock("~/lib/auth.server", () => ({
  createMagicLink: createMagicLinkMock,
}));

vi.mock("~/lib/rate-limit.server", () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("~/utils", () => ({
  logger: loggerMock,
}));

import {
  action,
  MAGIC_LINK_CONFIRMATION_MESSAGE,
} from "~/routes/admin.login";

describe("admin login route", () => {
  afterEach(() => {
    prismaMock.tenant.count.mockReset();
    createMagicLinkMock.mockReset();
    checkRateLimitMock.mockReset();
    loggerMock.info.mockReset();
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();
    vi.unstubAllEnvs();
  });

  it("returns the generic confirmation message when no link is issued", async () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      limit: 20,
      remaining: 19,
      resetAt: Date.now() + 60_000,
    });
    createMagicLinkMock.mockResolvedValue(null);

    const form = new FormData();
    form.set("email", "owner@example.com");

    const result = await action({
      request: new Request("http://localhost:3000/admin/login", {
        method: "POST",
        headers: {
          "x-forwarded-for": "203.0.113.10",
          "user-agent": "VitestBrowser/1.0",
        },
        body: form,
      }),
    } as never);

    expect(checkRateLimitMock).toHaveBeenNthCalledWith(
      1,
      "admin-login:ip:203.0.113.10",
      20,
      900,
    );
    expect(checkRateLimitMock).toHaveBeenNthCalledWith(
      2,
      "admin-login:ip-email:203.0.113.10:owner@example.com",
      5,
      900,
    );
    expect(createMagicLinkMock).toHaveBeenCalledWith("owner@example.com", null, {
      ip: "203.0.113.10",
      userAgent: "VitestBrowser/1.0",
    });
    expect(result).toMatchObject({
      ok: true,
      message: MAGIC_LINK_CONFIRMATION_MESSAGE,
      preview: null,
    });
  });

  it("preserves the dev preview only when a magic link is actually created", async () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      limit: 20,
      remaining: 19,
      resetAt: Date.now() + 60_000,
    });
    createMagicLinkMock.mockResolvedValue({
      email: "owner@example.com",
      tenantId: "tenant_1",
      url: "http://localhost:3000/admin/auth/magic?token=test",
      preview: "http://localhost:3000/admin/auth/magic?token=test",
    });

    const form = new FormData();
    form.set("email", "owner@example.com");

    const result = await action({
      request: new Request(
        "http://localhost:3000/admin/login?redirectTo=%2Fadmin%2Finstalls",
        {
          method: "POST",
          headers: {
            "x-forwarded-for": "203.0.113.11",
            "user-agent": "VitestBrowser/1.0",
          },
          body: form,
        },
      ),
    } as never);

    expect(createMagicLinkMock).toHaveBeenCalledWith(
      "owner@example.com",
      "/admin/installs",
      {
        ip: "203.0.113.11",
        userAgent: "VitestBrowser/1.0",
      },
    );
    expect(result).toMatchObject({
      ok: true,
      message: MAGIC_LINK_CONFIRMATION_MESSAGE,
      preview: "http://localhost:3000/admin/auth/magic?token=test",
    });
  });

  it("returns 429 when the IP+email limiter blocks the request", async () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    checkRateLimitMock
      .mockResolvedValueOnce({
        allowed: true,
        limit: 20,
        remaining: 19,
        resetAt: Date.now() + 60_000,
      })
      .mockResolvedValueOnce({
        allowed: false,
        limit: 5,
        remaining: 0,
        resetAt: Date.now() + 60_000,
      });

    const form = new FormData();
    form.set("email", "Owner@example.com");

    const result = await action({
      request: new Request("http://localhost:3000/admin/login", {
        method: "POST",
        headers: {
          "x-forwarded-for": "203.0.113.12",
        },
        body: form,
      }),
    } as never);

    expect(createMagicLinkMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      type: "DataWithResponseInit",
      data: {
        ok: false,
        error: "Too many sign-in attempts. Try again later.",
      },
      init: {
        status: 429,
      },
    });
  });

  it("returns 503 when Redis-backed rate limiting is unavailable", async () => {
    checkRateLimitMock.mockRejectedValue(
      new DependencyUnavailableError("Redis is required for this operation.", "redis"),
    );

    const form = new FormData();
    form.set("email", "owner@example.com");

    const result = await action({
      request: new Request("http://localhost:3000/admin/login", {
        method: "POST",
        body: form,
      }),
    } as never);

    expect(createMagicLinkMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      type: "DataWithResponseInit",
      data: {
        ok: false,
        error: "Sign-in is temporarily unavailable.",
      },
      init: {
        status: 503,
      },
    });
  });

  it("keeps the generic confirmation when the auth layer suppresses delivery failures", async () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      limit: 20,
      remaining: 19,
      resetAt: Date.now() + 60_000,
    });
    createMagicLinkMock.mockResolvedValue(null);

    const form = new FormData();
    form.set("email", "owner@example.com");

    const result = await action({
      request: new Request("http://localhost:3000/admin/login", {
        method: "POST",
        headers: {
          "x-forwarded-for": "203.0.113.13",
        },
        body: form,
      }),
    } as never);

    expect(result).toMatchObject({
      ok: true,
      message: MAGIC_LINK_CONFIRMATION_MESSAGE,
      preview: null,
    });
  });

  it("ignores forwarded headers unless proxy-header trust is explicitly enabled", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      limit: 5,
      remaining: 4,
      resetAt: Date.now() + 60_000,
    });
    createMagicLinkMock.mockResolvedValue(null);

    const form = new FormData();
    form.set("email", "owner@example.com");

    await action({
      request: new Request("http://localhost:3000/admin/login", {
        method: "POST",
        headers: {
          "x-forwarded-for": "203.0.113.10",
        },
        body: form,
      }),
    } as never);

    // When IP is "unknown" the IP-keyed check is skipped entirely to avoid
    // collapsing all users into a shared rate-limit bucket. Only the
    // per-email check runs.
    expect(checkRateLimitMock).toHaveBeenCalledTimes(1);
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "admin-login:ip-email:unknown:owner@example.com",
      5,
      900,
    );
    expect(checkRateLimitMock).not.toHaveBeenCalledWith(
      expect.stringContaining("admin-login:ip:"),
      expect.anything(),
      expect.anything(),
    );
  });
});
