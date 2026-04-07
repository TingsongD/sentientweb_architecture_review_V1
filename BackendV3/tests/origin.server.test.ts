import { afterEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    tenant: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("~/db.server", () => ({
  default: prismaMock,
}));

import { authenticateSiteRequest } from "~/lib/origin.server";

describe("site request authentication", () => {
  afterEach(() => {
    prismaMock.tenant.findUnique.mockReset();
  });

  it("uses fresh database state for origin allowlist checks on every request", async () => {
    prismaMock.tenant.findUnique
      .mockResolvedValueOnce({
        id: "tenant_1",
        publicSiteKey: "sw_pub_test",
        allowedOrigins: ["https://acme.com"],
        domains: ["acme.com"],
      })
      .mockResolvedValueOnce({
        id: "tenant_1",
        publicSiteKey: "sw_pub_test",
        allowedOrigins: ["https://docs.acme.com"],
        domains: ["acme.com"],
      });

    await expect(
      authenticateSiteRequest(
        new Request("http://localhost:3000/api/widget-config?siteKey=sw_pub_test", {
          headers: {
            Origin: "https://acme.com",
          },
        }),
        "sw_pub_test",
      ),
    ).resolves.toMatchObject({ id: "tenant_1" });

    await expect(
      authenticateSiteRequest(
        new Request("http://localhost:3000/api/widget-config?siteKey=sw_pub_test", {
          headers: {
            Origin: "https://acme.com",
          },
        }),
        "sw_pub_test",
      ),
    ).rejects.toMatchObject({ status: 403 });

    expect(prismaMock.tenant.findUnique).toHaveBeenCalledTimes(2);
    expect(prismaMock.tenant.findUnique).toHaveBeenNthCalledWith(1, {
      where: { publicSiteKey: "sw_pub_test" },
    });
    expect(prismaMock.tenant.findUnique).toHaveBeenNthCalledWith(2, {
      where: { publicSiteKey: "sw_pub_test" },
    });
  });
});
