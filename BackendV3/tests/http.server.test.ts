import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRequestClientIp,
  handleOptions,
  jsonResponse,
} from "~/lib/http.server";

describe("http helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores forwarded headers unless proxy trust is enabled", () => {
    const request = new Request("http://localhost:3000/admin/login", {
      headers: {
        "x-forwarded-for": "203.0.113.10, 198.51.100.20",
        "x-real-ip": "198.51.100.21",
        "cf-connecting-ip": "198.51.100.22",
      },
    });

    expect(getRequestClientIp(request)).toBe("unknown");
  });

  it("uses trusted proxy headers in the configured precedence order", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");

    const forwardedRequest = new Request("http://localhost:3000/admin/login", {
      headers: {
        "x-forwarded-for": "203.0.113.10, 198.51.100.20",
        "x-real-ip": "198.51.100.21",
        "cf-connecting-ip": "198.51.100.22",
      },
    });
    const realIpRequest = new Request("http://localhost:3000/admin/login", {
      headers: {
        "x-real-ip": "198.51.100.21",
      },
    });

    expect(getRequestClientIp(forwardedRequest)).toBe("203.0.113.10");
    expect(getRequestClientIp(realIpRequest)).toBe("198.51.100.21");
  });

  it("keeps reflected CORS opt-in at the helper level", () => {
    const request = new Request("http://localhost:3000/api/events", {
      headers: {
        Origin: "https://acme.com",
      },
    });

    const closedResponse = jsonResponse(request, { ok: true });
    const openResponse = jsonResponse(request, { ok: true }, {}, true);
    const closedOptions = handleOptions(request);
    const openOptions = handleOptions(request, true);

    expect(closedResponse.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(openResponse.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://acme.com",
    );
    expect(closedOptions.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(openOptions.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://acme.com",
    );
  });
});
