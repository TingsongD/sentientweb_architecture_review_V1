import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  InstallManagementAuthError,
  WordPressExchangeError,
} from "~/lib/errors.server";

const {
  prismaMock,
  authenticateManagedInstallMock,
  exchangeWordPressInstallLinkCodeMock,
} = vi.hoisted(() => ({
  prismaMock: {
    siteInstall: {
      update: vi.fn(),
    },
  },
  authenticateManagedInstallMock: vi.fn(),
  exchangeWordPressInstallLinkCodeMock: vi.fn(),
}));

vi.mock("~/db.server", () => ({
  default: prismaMock,
}));

vi.mock("~/lib/site-install.server", () => ({
  authenticateManagedInstall: authenticateManagedInstallMock,
  exchangeWordPressInstallLinkCode: exchangeWordPressInstallLinkCodeMock,
}));

import { action as exchangeAction } from "~/routes/api.wordpress.exchange";
import { action as disconnectAction } from "~/routes/api.wordpress.disconnect";
import { action as heartbeatAction } from "~/routes/api.wordpress.heartbeat";

describe("wordpress install routes", () => {
  beforeEach(() => {
    authenticateManagedInstallMock.mockResolvedValue({
      id: "install_1",
      pluginVersion: "0.1.0",
    });
    exchangeWordPressInstallLinkCodeMock.mockResolvedValue({
      install: {
        publicInstallKey: "sw_inst_test",
        origin: "https://acme.com",
        platform: "wordpress",
      },
      managementToken: "sw_mgmt_test",
    });
    prismaMock.siteInstall.update.mockResolvedValue({ id: "install_1" });
  });

  afterEach(() => {
    authenticateManagedInstallMock.mockReset();
    exchangeWordPressInstallLinkCodeMock.mockReset();
    prismaMock.siteInstall.update.mockReset();
  });

  it("revokes the management token on disconnect", async () => {
    const response = await disconnectAction({
      request: new Request("http://localhost:3000/api/wordpress/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          installKey: "sw_inst_test",
          managementToken: "sw_mgmt_test",
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(prismaMock.siteInstall.update).toHaveBeenCalledWith({
      where: { id: "install_1" },
      data: expect.objectContaining({
        managementTokenHash: null,
        status: "disconnected",
      }),
    });
  });

  it("returns a stable public error for WordPress exchange failures", async () => {
    exchangeWordPressInstallLinkCodeMock.mockRejectedValueOnce(
      new WordPressExchangeError("WordPress install code is invalid or expired."),
    );
    exchangeWordPressInstallLinkCodeMock.mockRejectedValueOnce(
      new WordPressExchangeError("WordPress install code origin mismatch."),
    );

    const invalidCodeResponse = await exchangeAction({
      request: new Request("http://localhost:3000/api/wordpress/exchange", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: "sw_link_test",
          origin: "https://acme.com",
        }),
      }),
    } as never);

    const originMismatchResponse = await exchangeAction({
      request: new Request("http://localhost:3000/api/wordpress/exchange", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: "sw_link_test",
          origin: "https://acme.com",
        }),
      }),
    } as never);

    expect(invalidCodeResponse.status).toBe(400);
    await expect(invalidCodeResponse.json()).resolves.toMatchObject({
      error: "WordPress install exchange failed.",
      code: "WORDPRESS_EXCHANGE_FAILED",
    });

    expect(originMismatchResponse.status).toBe(400);
    await expect(originMismatchResponse.json()).resolves.toMatchObject({
      error: "WordPress install exchange failed.",
      code: "WORDPRESS_EXCHANGE_FAILED",
    });
  });

  it("reflects CORS headers for WordPress public routes", async () => {
    const response = await exchangeAction({
      request: new Request("http://localhost:3000/api/wordpress/exchange", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://plugin.acme.com",
        },
        body: JSON.stringify({
          code: "sw_link_test",
          origin: "https://acme.com",
        }),
      }),
    } as never);

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://plugin.acme.com",
    );
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("rejects oversized WordPress exchange bodies before invoking the install exchange", async () => {
    const response = await exchangeAction({
      request: new Request("http://localhost:3000/api/wordpress/exchange", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: "x".repeat(20 * 1024),
          origin: "https://acme.com",
        }),
      }),
    } as never);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      code: "REQUEST_TOO_LARGE",
    });
    expect(exchangeWordPressInstallLinkCodeMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON in WordPress exchange requests", async () => {
    const response = await exchangeAction({
      request: new Request("http://localhost:3000/api/wordpress/exchange", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{invalid-json",
      }),
    } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_JSON",
    });
    expect(exchangeWordPressInstallLinkCodeMock).not.toHaveBeenCalled();
  });

  it("rejects heartbeat requests when the management token has been revoked", async () => {
    authenticateManagedInstallMock.mockRejectedValue(
      new InstallManagementAuthError(),
    );

    const response = await heartbeatAction({
      request: new Request("http://localhost:3000/api/wordpress/heartbeat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          installKey: "sw_inst_test",
          managementToken: "sw_mgmt_test",
        }),
      }),
    } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Install authentication failed.",
      code: "INSTALL_AUTH_FAILED",
    });
    expect(prismaMock.siteInstall.update).not.toHaveBeenCalled();
  });

  it("returns the same install auth response from disconnect when management credentials are invalid", async () => {
    authenticateManagedInstallMock.mockRejectedValue(
      new InstallManagementAuthError(),
    );

    const response = await disconnectAction({
      request: new Request("http://localhost:3000/api/wordpress/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          installKey: "sw_inst_test",
          managementToken: "sw_mgmt_test",
        }),
      }),
    } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Install authentication failed.",
      code: "INSTALL_AUTH_FAILED",
    });
    expect(prismaMock.siteInstall.update).not.toHaveBeenCalled();
  });
});
