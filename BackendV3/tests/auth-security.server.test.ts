import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, loggerMock } = vi.hoisted(() => ({
  prismaMock: {
    tenantAdmin: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    tenantAdminLoginToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
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

vi.mock("~/utils", () => ({
  logger: loggerMock,
}));

import { createSessionCookie } from "~/lib/cookies.server";
import { signAdminSession } from "~/lib/crypto.server";
import { consumeMagicLink, createMagicLink, requireAdminSession } from "~/lib/auth.server";

describe("auth hardening", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSessionSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock),
    );
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }

    prismaMock.tenantAdmin.findFirst.mockReset();
    prismaMock.tenantAdmin.findUnique.mockReset();
    prismaMock.tenantAdminLoginToken.create.mockReset();
    prismaMock.tenantAdminLoginToken.findUnique.mockReset();
    prismaMock.tenantAdminLoginToken.updateMany.mockReset();
    prismaMock.$transaction.mockReset();
    loggerMock.info.mockReset();
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();
    loggerMock.debug.mockReset();
  });

  it("adds the Secure flag to session cookies in production", () => {
    process.env.NODE_ENV = "production";

    const cookie = createSessionCookie("session-token");

    expect(cookie).toContain("Secure");
  });

  it("rejects missing SESSION_SECRET in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.SESSION_SECRET;

    expect(() =>
      signAdminSession({
        tenantId: "tenant_1",
        adminId: "admin_1",
        email: "owner@example.com",
        expiresAt: Date.now() + 60_000,
      }),
    ).toThrow("SESSION_SECRET must be configured in production");
  });

  it("claims magic links once and rejects a second concurrent claim", async () => {
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-secret";

    const tokenRecord = {
      id: "token_1",
      tenantId: "tenant_1",
      email: "owner@example.com",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      admin: {
        id: "admin_1",
      },
      tenant: {
        id: "tenant_1",
      },
    };

    prismaMock.tenantAdminLoginToken.findUnique.mockResolvedValue(tokenRecord);
    prismaMock.tenantAdminLoginToken.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const first = await consumeMagicLink("raw-token");
    const second = await consumeMagicLink("raw-token");

    expect(first).toMatchObject({
      tenantId: "tenant_1",
      adminId: "admin_1",
      email: "owner@example.com",
    });
    expect(first?.session).toBeTruthy();
    expect(second).toBeNull();
  });

  it("does not log the full magic link URL", async () => {
    prismaMock.tenantAdmin.findFirst.mockResolvedValue({
      id: "admin_1",
      tenantId: "tenant_1",
      tenant: { id: "tenant_1" },
    });
    prismaMock.tenantAdminLoginToken.create.mockResolvedValue({ id: "token_1" });

    await createMagicLink("owner@example.com");

    expect(loggerMock.info).toHaveBeenCalledWith(
      "Magic link generated",
      expect.not.objectContaining({
        url: expect.anything(),
      }),
    );
  });

  it("treats malformed admin session cookies as unauthenticated instead of throwing", async () => {
    const request = new Request("http://localhost:3000/admin", {
      headers: {
        cookie: createSessionCookie("not-a-valid-session"),
      },
    });

    await expect(requireAdminSession(request)).rejects.toMatchObject({
      status: 302,
    });

    expect(prismaMock.tenantAdmin.findUnique).not.toHaveBeenCalled();
  });
});
