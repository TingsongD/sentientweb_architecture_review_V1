import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, bootstrapTenantMock, createMagicLinkInTransactionMock } = vi.hoisted(
  () => ({
    prismaMock: {
      tenant: {
        count: vi.fn(),
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(),
    },
    bootstrapTenantMock: vi.fn(),
    createMagicLinkInTransactionMock: vi.fn(),
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
    bootstrapTenantMock.mockReset();
    createMagicLinkInTransactionMock.mockReset();
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
      admins: [{ id: "admin_1", email: "owner@acme.com" }],
    });
    createMagicLinkInTransactionMock.mockResolvedValue(
      "http://localhost:3000/admin/auth/magic?token=test",
    );

    const form = validForm();
    form.set("bootstrapSecret", "bootstrap-secret");

    const response = await action({
      request: new Request("http://localhost:3000/", {
        method: "POST",
        body: form,
      }),
    } as never);

    expect(bootstrapTenantMock).toHaveBeenCalledTimes(1);
    expect(createMagicLinkInTransactionMock).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        adminId: "admin_1",
        tenantId: "tenant_1",
        email: "owner@acme.com",
      }),
    );
    expect(response).toEqual({
      ok: true,
      magicLink: "http://localhost:3000/admin/auth/magic?token=test",
    });
  });

  it("allows non-production bootstrap when no bootstrap secret is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.FIRST_TENANT_BOOTSTRAP_SECRET;
    prismaMock.tenant.findFirst.mockResolvedValue(null);
    bootstrapTenantMock.mockResolvedValue({
      id: "tenant_1",
      admins: [{ id: "admin_1", email: "owner@acme.com" }],
    });
    createMagicLinkInTransactionMock.mockResolvedValue(
      "http://localhost:3000/admin/auth/magic?token=test",
    );

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
  });
});
