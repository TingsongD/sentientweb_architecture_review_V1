import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DependencyUnavailableError } from "~/lib/errors.server";

const {
  prismaMock,
  bootstrapTenantMock,
  createMagicLinkInTransactionMock,
  deliverMagicLinkMock,
  assertMagicLinkEmailDeliveryConfiguredMock,
} = vi.hoisted(
  () => ({
    prismaMock: {
      tenant: {
        count: vi.fn(),
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(),
      $queryRaw: vi.fn().mockResolvedValue([]),
    },
    bootstrapTenantMock: vi.fn(),
    createMagicLinkInTransactionMock: vi.fn(),
    deliverMagicLinkMock: vi.fn(),
    assertMagicLinkEmailDeliveryConfiguredMock: vi.fn(),
  }),
);

vi.mock("~/db.server", () => ({
  default: prismaMock,
}));

vi.mock("~/lib/tenants.server", () => ({
  bootstrapTenant: bootstrapTenantMock,
}));

vi.mock("~/lib/auth.server", () => ({
  createMagicLinkInTransaction: createMagicLinkInTransactionMock,
  deliverMagicLink: deliverMagicLinkMock,
}));

vi.mock("~/lib/magic-link-email.server", () => ({
  assertMagicLinkEmailDeliveryConfigured: assertMagicLinkEmailDeliveryConfiguredMock,
}));

import { action } from "~/routes/_index";

describe("bootstrap route hardening", () => {
  const validForm = () => {
    const form = new FormData();
    form.set("companyName", "Acme");
    form.set("primaryDomain", "acme.com");
    form.set("adminEmail", "owner@acme.com");
    return form;
  };

  beforeEach(() => {
    // Execute the transaction callback with the mock client by default.
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock),
    );
  });

  afterEach(() => {
    prismaMock.tenant.count.mockReset();
    prismaMock.tenant.findFirst.mockReset();
    prismaMock.$transaction.mockReset();
    prismaMock.$queryRaw.mockReset();
    bootstrapTenantMock.mockReset();
    createMagicLinkInTransactionMock.mockReset();
    deliverMagicLinkMock.mockReset();
    assertMagicLinkEmailDeliveryConfiguredMock.mockReset();
    vi.unstubAllEnvs();
  });

  it("redirects POST / to admin login after a tenant already exists", async () => {
    // The fast-path check is a direct prisma.tenant.findFirst() call
    // outside the transaction — keep secret validation bypassed (dev mode).
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.FIRST_TENANT_BOOTSTRAP_SECRET;
    prismaMock.tenant.findFirst.mockResolvedValue({ id: "tenant_existing" });

    await expect(
      action({
        request: new Request("http://localhost:3000/", {
          method: "POST",
          body: validForm(),
        }),
      } as never),
    ).rejects.toMatchObject({
      status: 302,
    });

    expect(bootstrapTenantMock).not.toHaveBeenCalled();
    expect(createMagicLinkInTransactionMock).not.toHaveBeenCalled();
  });

  it("rejects production bootstrap when the secret is omitted", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIRST_TENANT_BOOTSTRAP_SECRET", "bootstrap-secret");

    const response = await action({
      request: new Request("http://localhost:3000/", {
        method: "POST",
        body: validForm(),
      }),
    } as never);

    expect(response).toEqual({
      ok: false,
      error: "Bootstrap is unavailable.",
    });
    expect(bootstrapTenantMock).not.toHaveBeenCalled();
    expect(createMagicLinkInTransactionMock).not.toHaveBeenCalled();
  });

  it("rejects non-production bootstrap when secure bootstrap mode is enabled", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FIRST_TENANT_BOOTSTRAP_SECRET", "bootstrap-secret");

    const response = await action({
      request: new Request("http://localhost:3000/", {
        method: "POST",
        body: validForm(),
      }),
    } as never);

    expect(response).toEqual({
      ok: false,
      error: "Bootstrap is unavailable.",
    });
    expect(bootstrapTenantMock).not.toHaveBeenCalled();
    expect(createMagicLinkInTransactionMock).not.toHaveBeenCalled();
  });

  it("rejects production bootstrap when the secret is invalid", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIRST_TENANT_BOOTSTRAP_SECRET", "bootstrap-secret");

    const form = validForm();
    form.set("bootstrapSecret", "wrong-secret");

    const response = await action({
      request: new Request("http://localhost:3000/", {
        method: "POST",
        body: form,
      }),
    } as never);

    expect(response).toEqual({
      ok: false,
      error: "Bootstrap is unavailable.",
    });
    expect(bootstrapTenantMock).not.toHaveBeenCalled();
    expect(createMagicLinkInTransactionMock).not.toHaveBeenCalled();
  });

  it("allows production bootstrap when the secret matches", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIRST_TENANT_BOOTSTRAP_SECRET", "bootstrap-secret");
    prismaMock.tenant.findFirst.mockResolvedValue(null);
    bootstrapTenantMock.mockResolvedValue({
      id: "tenant_1",
      name: "Acme",
      admins: [{ id: "admin_1", email: "owner@acme.com" }],
    });
    createMagicLinkInTransactionMock.mockResolvedValue({
      tokenId: "token_1",
      email: "owner@acme.com",
      tenantId: "tenant_1",
      tenantName: "Acme",
      url: "http://localhost:3000/admin/auth/magic?token=test",
      preview: null,
    });

    const form = validForm();
    form.set("bootstrapSecret", "bootstrap-secret");

    let redirectResponse: Response | null = null;
    try {
      await action({
        request: new Request("http://localhost:3000/", {
          method: "POST",
          body: form,
        }),
      } as never);
    } catch (error) {
      redirectResponse = error as Response;
    }

    expect(bootstrapTenantMock).toHaveBeenCalledTimes(1);
    expect(redirectResponse?.status).toBe(302);
    expect(redirectResponse?.headers.get("Location")).toBe(
      "/admin/login?bootstrap=email-sent",
    );
    expect(createMagicLinkInTransactionMock).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        adminId: "admin_1",
        tenantId: "tenant_1",
        email: "owner@acme.com",
        tenantName: "Acme",
      }),
    );
    expect(assertMagicLinkEmailDeliveryConfiguredMock).toHaveBeenCalledTimes(1);
    expect(deliverMagicLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: "token_1",
        email: "owner@acme.com",
      }),
    );
  });

  it("allows non-production bootstrap when no bootstrap secret is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.FIRST_TENANT_BOOTSTRAP_SECRET;
    prismaMock.tenant.findFirst.mockResolvedValue(null);
    bootstrapTenantMock.mockResolvedValue({
      id: "tenant_1",
      name: "Acme",
      admins: [{ id: "admin_1", email: "owner@acme.com" }],
    });
    createMagicLinkInTransactionMock.mockResolvedValue({
      tokenId: "token_1",
      email: "owner@acme.com",
      tenantId: "tenant_1",
      tenantName: "Acme",
      url: "http://localhost:3000/admin/auth/magic?token=test",
      preview: "http://localhost:3000/admin/auth/magic?token=test",
    });

    const response = await action({
      request: new Request("http://localhost:3000/", {
        method: "POST",
        body: validForm(),
      }),
    } as never);

    expect(bootstrapTenantMock).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      ok: true,
      magicLink: "http://localhost:3000/admin/auth/magic?token=test",
    });
    expect(deliverMagicLinkMock).not.toHaveBeenCalled();
  });

  it("fails before tenant creation when production email delivery is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIRST_TENANT_BOOTSTRAP_SECRET", "bootstrap-secret");
    assertMagicLinkEmailDeliveryConfiguredMock.mockImplementation(() => {
      throw new Error("Magic-link email delivery is not configured.");
    });

    const form = validForm();
    form.set("bootstrapSecret", "bootstrap-secret");

    const response = await action({
      request: new Request("http://localhost:3000/", {
        method: "POST",
        body: form,
      }),
    } as never);

    expect(response).toEqual({
      ok: false,
      error: "Bootstrap is unavailable.",
    });
    expect(bootstrapTenantMock).not.toHaveBeenCalled();
    expect(createMagicLinkInTransactionMock).not.toHaveBeenCalled();
  });

  it("redirects to login with a delivery failure banner when bootstrap email send fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIRST_TENANT_BOOTSTRAP_SECRET", "bootstrap-secret");
    prismaMock.tenant.findFirst.mockResolvedValue(null);
    bootstrapTenantMock.mockResolvedValue({
      id: "tenant_1",
      name: "Acme",
      admins: [{ id: "admin_1", email: "owner@acme.com" }],
    });
    createMagicLinkInTransactionMock.mockResolvedValue({
      tokenId: "token_1",
      email: "owner@acme.com",
      tenantId: "tenant_1",
      tenantName: "Acme",
      url: "http://localhost:3000/admin/auth/magic?token=test",
      preview: null,
    });
    deliverMagicLinkMock.mockRejectedValue(new DependencyUnavailableError("email send failed"));

    const form = validForm();
    form.set("bootstrapSecret", "bootstrap-secret");

    let redirectResponse: Response | null = null;
    try {
      await action({
        request: new Request("http://localhost:3000/", {
          method: "POST",
          body: form,
        }),
      } as never);
    } catch (error) {
      redirectResponse = error as Response;
    }

    expect(redirectResponse?.status).toBe(302);
    expect(redirectResponse?.headers.get("Location")).toBe(
      "/admin/login?bootstrap=email-failed",
    );
  });
});
