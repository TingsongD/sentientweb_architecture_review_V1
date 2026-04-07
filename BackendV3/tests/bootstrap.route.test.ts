import { describe, expect, it, vi } from "vitest";

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
  it("redirects POST / to admin login after a tenant already exists", async () => {
    prismaMock.tenant.count.mockResolvedValue(1);

    const form = new FormData();
    form.set("companyName", "Acme");
    form.set("primaryDomain", "acme.com");
    form.set("adminEmail", "owner@acme.com");

    await expect(
      action({
        request: new Request("http://localhost:3000/", {
          method: "POST",
          body: form,
        }),
      } as never),
    ).rejects.toMatchObject({
      status: 302,
    });

    expect(bootstrapTenantMock).not.toHaveBeenCalled();
    expect(createMagicLinkMock).not.toHaveBeenCalled();
  });
});
