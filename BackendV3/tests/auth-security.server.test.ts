import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, loggerMock, mailerMock } = vi.hoisted(() => ({
  prismaMock: {
    tenantAdmin: {
      findMany: vi.fn(),
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
  mailerMock: {
    assertMagicLinkEmailDeliveryConfigured: vi.fn(),
    resolveMagicLinkBaseUrl: vi.fn(),
    sendAdminMagicLinkEmail: vi.fn(),
  },
}));

vi.mock("~/db.server", () => ({
  default: prismaMock,
}));

vi.mock("~/utils", () => ({
  logger: loggerMock,
}));

vi.mock("~/lib/magic-link-email.server", () => mailerMock);

import { createSessionCookie } from "~/lib/cookies.server";
import { signAdminSession } from "~/lib/crypto.server";
import { DependencyUnavailableError } from "~/lib/errors.server";
import { consumeMagicLink, createMagicLink, requireAdminSession } from "~/lib/auth.server";

describe("auth hardening", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSessionSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock),
    );
    mailerMock.resolveMagicLinkBaseUrl.mockReturnValue(new URL("http://localhost:3000"));
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }

    prismaMock.tenantAdmin.findMany.mockReset();
    prismaMock.tenantAdmin.findUnique.mockReset();
    prismaMock.tenantAdminLoginToken.create.mockReset();
    prismaMock.tenantAdminLoginToken.findUnique.mockReset();
    prismaMock.tenantAdminLoginToken.updateMany.mockReset();
    prismaMock.$transaction.mockReset();
    loggerMock.info.mockReset();
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();
    loggerMock.debug.mockReset();
    mailerMock.assertMagicLinkEmailDeliveryConfigured.mockReset();
    mailerMock.resolveMagicLinkBaseUrl.mockReset();
    mailerMock.sendAdminMagicLinkEmail.mockReset();
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

    const first = await consumeMagicLink("raw-token", {
      ip: "203.0.113.20",
      userAgent: "VitestBrowser/1.0",
    });
    const second = await consumeMagicLink("raw-token", {
      ip: "203.0.113.20",
      userAgent: "VitestBrowser/1.0",
    });

    expect(first).toMatchObject({
      tenantId: "tenant_1",
      adminId: "admin_1",
      email: "owner@example.com",
    });
    expect(first?.session).toBeTruthy();
    expect(second).toBeNull();
    expect(loggerMock.info).toHaveBeenCalledWith(
      "Magic link consumed",
      expect.objectContaining({
        emailHash: expect.any(String),
        ip: "203.0.113.20",
        userAgent: "VitestBrowser/1.0",
      }),
    );
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Magic link consumption rejected",
      expect.objectContaining({
        reason: "claim_conflict",
        ip: "203.0.113.20",
        userAgent: "VitestBrowser/1.0",
      }),
    );
  });

  it("normalizes unique admin emails and does not log the full magic link URL", async () => {
    prismaMock.tenantAdmin.findMany.mockResolvedValue([
      {
        id: "admin_1",
        tenantId: "tenant_1",
        tenant: { id: "tenant_1" },
      },
    ]);
    prismaMock.tenantAdminLoginToken.create.mockResolvedValue({ id: "token_1" });

    const magic = await createMagicLink(" Owner@Example.com ", null, {
      ip: "203.0.113.10",
      userAgent: "VitestBrowser/1.0",
    });

    expect(magic?.email).toBe("owner@example.com");
    expect(prismaMock.tenantAdmin.findMany).toHaveBeenCalledWith({
      where: { email: "owner@example.com" },
      include: { tenant: true },
      take: 2,
    });
    expect(prismaMock.tenantAdminLoginToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "owner@example.com",
      }),
    });

    expect(loggerMock.info).toHaveBeenCalledWith(
      "Magic link generated",
      expect.objectContaining({
        emailHash: expect.any(String),
        ip: "203.0.113.10",
        userAgent: "VitestBrowser/1.0",
      }),
    );
    // Neither the raw email nor the redeemable token URL must appear in logs.
    expect(loggerMock.info).toHaveBeenCalledWith(
      "Magic link generated",
      expect.not.objectContaining({
        email: expect.anything(),
        url: expect.anything(),
      }),
    );
    expect(mailerMock.sendAdminMagicLinkEmail).not.toHaveBeenCalled();
  });

  it("returns null for unknown admin emails without issuing a token", async () => {
    prismaMock.tenantAdmin.findMany.mockResolvedValue([]);

    const magic = await createMagicLink("missing@example.com");

    expect(magic).toBeNull();
    expect(prismaMock.tenantAdminLoginToken.create).not.toHaveBeenCalled();
    expect(loggerMock.info).not.toHaveBeenCalled();
  });

  // NOTE: The TenantAdmin_email_key DB constraint (see migration
  // 20260406213000_global_admin_email_unique) enforces global email uniqueness,
  // making the "two admins, same email, different tenants" scenario impossible
  // in normal operation. The duplicate-email guard inside createMagicLink is
  // belt-and-suspenders defensive code. We intentionally do not test it via a
  // mock here because that test would validate a code path that can never be
  // reached with a real database, giving false confidence.

  it("invalidates every unused token and creates the new token inside a single transaction", async () => {
    prismaMock.tenantAdmin.findMany.mockResolvedValue([
      {
        id: "admin_1",
        tenantId: "tenant_1",
        tenant: { id: "tenant_1", name: "Acme" },
      },
    ]);
    prismaMock.tenantAdminLoginToken.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.tenantAdminLoginToken.create.mockResolvedValue({ id: "token_1" });

    await createMagicLink("owner@example.com", null, {
      ip: "203.0.113.11",
      userAgent: "VitestBrowser/1.0",
    });

    // Both operations must run inside a single $transaction call so the DB
    // partial unique index can enforce at-most-one-active-token atomically.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const invalidationCall = prismaMock.tenantAdminLoginToken.updateMany.mock.calls[0]?.[0];
    expect(invalidationCall).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant_1",
          email: "owner@example.com",
          usedAt: null,
        }),
        data: expect.objectContaining({ usedAt: expect.any(Date) }),
      }),
    );
    expect(invalidationCall?.where).not.toHaveProperty("expiresAt");
    expect(prismaMock.tenantAdminLoginToken.create).toHaveBeenCalledTimes(1);
  });

  it("returns null in production when magic-link email delivery is not configured", async () => {
    process.env.NODE_ENV = "production";
    prismaMock.tenantAdmin.findMany.mockResolvedValue([
      {
        id: "admin_1",
        tenantId: "tenant_1",
        tenant: { id: "tenant_1", name: "Acme" },
      },
    ]);
    mailerMock.assertMagicLinkEmailDeliveryConfigured.mockImplementation(() => {
      throw new DependencyUnavailableError(
        "Magic-link email delivery is not configured.",
        "resend",
      );
    });

    await expect(createMagicLink("owner@example.com")).resolves.toBeNull();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Magic link request could not be delivered",
      expect.objectContaining({
        emailHash: expect.any(String),
        dependency: "resend",
        reason: "delivery_not_ready",
      }),
    );
  });

  it("returns null in production when the magic-link base URL is invalid", async () => {
    process.env.NODE_ENV = "production";
    prismaMock.tenantAdmin.findMany.mockResolvedValue([
      {
        id: "admin_1",
        tenantId: "tenant_1",
        tenant: { id: "tenant_1", name: "Acme" },
      },
    ]);
    mailerMock.assertMagicLinkEmailDeliveryConfigured.mockImplementation(() => {
      throw new DependencyUnavailableError(
        "Magic-link base URL is invalid.",
        "magic_link_base_url",
      );
    });

    await expect(createMagicLink("owner@example.com")).resolves.toBeNull();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Magic link request could not be delivered",
      expect.objectContaining({
        emailHash: expect.any(String),
        dependency: "magic_link_base_url",
        reason: "delivery_not_ready",
      }),
    );
  });

  it("returns null in production when magic-link delivery fails after token creation", async () => {
    process.env.NODE_ENV = "production";
    prismaMock.tenantAdmin.findMany.mockResolvedValue([
      {
        id: "admin_1",
        tenantId: "tenant_1",
        tenant: { id: "tenant_1", name: "Acme" },
      },
    ]);
    prismaMock.tenantAdminLoginToken.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    prismaMock.tenantAdminLoginToken.create.mockResolvedValue({ id: "token_1" });
    mailerMock.sendAdminMagicLinkEmail.mockRejectedValue(
      new DependencyUnavailableError("Resend outage", "resend"),
    );

    await expect(createMagicLink("owner@example.com")).resolves.toBeNull();

    expect(mailerMock.sendAdminMagicLinkEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: "owner@example.com",
        tenantName: "Acme",
      }),
    );
    expect(prismaMock.tenantAdminLoginToken.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: "token_1",
          usedAt: null,
        },
        data: expect.objectContaining({ usedAt: expect.any(Date) }),
      }),
    );
    expect(loggerMock.info).not.toHaveBeenCalledWith(
      "Magic link generated",
      expect.anything(),
    );
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Magic link request could not be delivered",
      expect.objectContaining({
        emailHash: expect.any(String),
        dependency: "resend",
        reason: "delivery_failed",
      }),
    );
  });

  it("logs invalid or expired magic-link consumption with request metadata", async () => {
    prismaMock.tenantAdminLoginToken.findUnique.mockResolvedValue(null);

    const result = await consumeMagicLink("raw-token", {
      ip: "203.0.113.21",
      userAgent: "VitestBrowser/1.0",
    });

    expect(result).toBeNull();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Magic link consumption rejected",
      expect.objectContaining({
        reason: "not_found",
        ip: "203.0.113.21",
        userAgent: "VitestBrowser/1.0",
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
