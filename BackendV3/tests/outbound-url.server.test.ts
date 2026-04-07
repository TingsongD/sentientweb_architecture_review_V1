import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lookupMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: lookupMock,
}));

import { BlockedUrlError } from "~/lib/errors.server";
import { assertAllowedOutboundUrl, safeFetch } from "~/lib/outbound-url.server";

describe("outbound URL validation", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    global.fetch = vi.fn();
  });

  afterEach(() => {
    lookupMock.mockReset();
    global.fetch = originalFetch;
  });

  it("allows normal public HTTPS targets", async () => {
    await expect(assertAllowedOutboundUrl("https://example.com/docs")).resolves.toBeInstanceOf(URL);
  });

  it("blocks localhost and loopback targets", async () => {
    await expect(assertAllowedOutboundUrl("http://localhost:3000")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(assertAllowedOutboundUrl("http://127.0.0.1:3000")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(assertAllowedOutboundUrl("http://[::1]:3000")).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("blocks domains that resolve to private addresses", async () => {
    lookupMock.mockResolvedValue([{ address: "10.0.0.8", family: 4 }]);

    await expect(assertAllowedOutboundUrl("https://internal.example.com")).rejects.toBeInstanceOf(
      BlockedUrlError,
    );
  });

  it("rejects redirect chains that land on blocked targets", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            Location: "http://127.0.0.1/internal",
          },
        }),
      );

    await expect(
      safeFetch("https://public.example.com/webhook", {}, { purpose: "Webhook request" }),
    ).rejects.toBeInstanceOf(BlockedUrlError);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
