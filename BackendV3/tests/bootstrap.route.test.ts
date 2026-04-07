import { afterEach, describe, expect, it, vi } from "vitest";

const { prismaMock, bootstrapTenantMock, createMagicLinkMock } = vi.hoisted(() => ({
  prismaMock: {
    tenant: {
      count: vi.fn(),
    },
  },
  bootstrapTenantMock: vi.fn(),
  createMagicLinkMock: vi.fn(),
}));

vi.mock("~/db.server", () => ({
  default: prismaMock,
}));

vi.mock("~/lib/tenants.server", () => ({
  bootstrapTenant: bootstrapTenantMock,
}));

vi.mock("~/lib/auth.server", () => ({
  createMagicLink: createMagicLinkMock,
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

  afterEach(() => {
    prismaMock.tenant.count.mockReset();
    bootstrapTenantMock.mockReset();
    createMagicLinkMock.mockReset();
    vi.unstubAllEnvs();
  });

  it("redirects POST / to admin login after a tenant already exists", async () => {
    prismaMock.tenant.count.mockResolvedValue(1);

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
    expect(createMagicLinkMock).not.toHaveBeenCalled();
  });

  it("rejects production bootstrap when the secret is omitted", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIRST_TENANT_BOOTSTRAP_SECRET", "bootstrap-secret");
    prismaMock.tenant.count.mockResolvedValue(0);

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
    expect(createMagicLinkMock).not.toHaveBeenCalled();
  });

  it("rejects non-production bootstrap when secure bootstrap mode is enabled", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FIRST_TENANT_BOOTSTRAP_SECRET", "bootstrap-secret");
    prismaMock.tenant.count.mockResolvedValue(0);

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
    expect(createMagicLinkMock).not.toHaveBeenCalled();
  });

  it("rejects production bootstrap when the secret is invalid", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIRST_TENANT_BOOTSTRAP_SECRET", "bootstrap-secret");
    prismaMock.tenant.count.mockResolvedValue(0);

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
    expect(createMagicLinkMock).not.toHaveBeenCalled();
  });

  it("allows production bootstrap when the secret matches", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIRST_TENANT_BOOTSTRAP_SECRET", "bootstrap-secret");
    prismaMock.tenant.count.mockResolvedValue(0);
    bootstrapTenantMock.mockResolvedValue(undefined);
    createMagicLinkMock.mockResolvedValue({
      preview: "http://localhost:3000/admin/auth/magic?token=test",
    });

    const form = validForm();
    form.set("bootstrapSecret", "bootstrap-secret");

    const response = await action({
      request: new Request("http://localhost:3000/", {
        method: "POST",
        body: form,
      }),
    } as never);

    expect(bootstrapTenantMock).toHaveBeenCalledTimes(1);
    expect(createMagicLinkMock).toHaveBeenCalledWith(
      "owner@acme.com",
      null,
      {
        ip: "unknown",
        userAgent: "unknown",
      },
    );
    expect(response).toEqual({
      ok: true,
      magicLink: "http://localhost:3000/admin/auth/magic?token=test",
    });
  });

  it("allows non-production bootstrap when no bootstrap secret is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.FIRST_TENANT_BOOTSTRAP_SECRET;
    prismaMock.tenant.count.mockResolvedValue(0);
    bootstrapTenantMock.mockResolvedValue(undefined);
    createMagicLinkMock.mockResolvedValue({
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
  });
});
