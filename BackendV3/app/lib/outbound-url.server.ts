import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { BlockedUrlError } from "./errors.server";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 5;

function isBlockedIpv4(address: string) {
  const octets = address.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) {
    return true;
  }

  const [a, b] = octets;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIpv6(address: string) {
  const normalized = address.toLowerCase();

  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("ff")) return true;

  if (normalized.startsWith("::ffff:")) {
    return isBlockedIpv4(normalized.slice("::ffff:".length));
  }

  return false;
}

function isBlockedAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}

function withTimeout(signal: AbortSignal | null | undefined, timeoutMs: number) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeoutSignal;
  return AbortSignal.any([signal, timeoutSignal]);
}

function isRedirect(status: number) {
  return status >= 300 && status < 400;
}

function shouldRewriteToGet(method: string, status: number) {
  const normalizedMethod = method.toUpperCase();
  if (status === 303) return true;
  if ((status === 301 || status === 302) && normalizedMethod !== "GET" && normalizedMethod !== "HEAD") {
    return true;
  }
  return false;
}

async function assertAllowedHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  const unwrapped = normalized.startsWith("[") && normalized.endsWith("]")
    ? normalized.slice(1, -1)
    : normalized;

  if (unwrapped === "localhost" || unwrapped.endsWith(".localhost")) {
    throw new BlockedUrlError("Localhost targets are not allowed.");
  }

  if (isIP(unwrapped)) {
    if (isBlockedAddress(unwrapped)) {
      throw new BlockedUrlError("Private or local IP targets are not allowed.");
    }
    return;
  }

  let resolved;
  try {
    resolved = await lookup(unwrapped, { all: true, verbatim: true });
  } catch {
    throw new BlockedUrlError("Unable to resolve the supplied host.");
  }

  if (resolved.length === 0) {
    throw new BlockedUrlError("Unable to resolve the supplied host.");
  }

  for (const record of resolved) {
    if (isBlockedAddress(record.address)) {
      throw new BlockedUrlError("The supplied host resolves to a private or local address.");
    }
  }
}

export async function assertAllowedOutboundUrl(
  rawUrl: string,
  options: { allowedOrigin?: string } = {},
) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError("The supplied URL is invalid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError("Only HTTP(S) URLs are allowed.");
  }

  if (url.username || url.password) {
    throw new BlockedUrlError("URLs with embedded credentials are not allowed.");
  }

  if (options.allowedOrigin && url.origin !== options.allowedOrigin) {
    throw new BlockedUrlError(
      `The supplied URL must remain on ${options.allowedOrigin}.`,
      url.toString(),
    );
  }

  await assertAllowedHost(url.hostname);
  return url;
}

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  options: { timeoutMs?: number; purpose?: string } = {},
) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    return await fetch(input, {
      ...init,
      signal: withTimeout(init.signal, timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`${options.purpose ?? "Request"} timed out after ${timeoutMs}ms`);
    }

    throw error;
  }
}

export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  options: {
    allowedOrigin?: string;
    timeoutMs?: number;
    maxRedirects?: number;
    purpose?: string;
  } = {},
) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let currentUrl = rawUrl;
  let method = init.method ?? "GET";
  let body = init.body;
  let headers = new Headers(init.headers);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const validated = await assertAllowedOutboundUrl(currentUrl, {
      allowedOrigin: options.allowedOrigin,
    });

    const response = await fetchWithTimeout(
      validated,
      {
        ...init,
        method,
        body,
        headers,
        redirect: "manual",
      },
      { timeoutMs, purpose: options.purpose },
    );

    if (!isRedirect(response.status)) {
      return response;
    }

    if (redirectCount === maxRedirects) {
      throw new Error(`${options.purpose ?? "Request"} exceeded ${maxRedirects} redirects`);
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`${options.purpose ?? "Request"} returned a redirect without a location`);
    }

    currentUrl = new URL(location, validated).toString();

    if (shouldRewriteToGet(method, response.status)) {
      method = "GET";
      body = undefined;
      headers = new Headers(headers);
      headers.delete("Content-Length");
      headers.delete("Content-Type");
    }
  }

  throw new Error(`${options.purpose ?? "Request"} exceeded redirect limits`);
}
