import { getCorsHeaders } from "./origin.server";
import { InvalidJsonBodyError, RequestTooLargeError } from "./errors.server";

export const PUBLIC_API_LARGE_BODY_LIMIT_BYTES = 64 * 1024;
export const PUBLIC_API_SMALL_BODY_LIMIT_BYTES = 16 * 1024;

function trustProxyHeaders() {
  return process.env.TRUST_PROXY_HEADERS === "true";
}

export function getRequestClientIp(request: Request) {
  if (!trustProxyHeaders()) {
    return "unknown";
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor
      .split(",")
      .map((value) => value.trim())
      .find(Boolean);
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;

  return "unknown";
}

export function getRequestUserAgent(request: Request) {
  return request.headers.get("user-agent")?.trim() || "unknown";
}

async function readRequestText(request: Request, maxBytes: number) {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new RequestTooLargeError(maxBytes);
    }

    chunks.push(value);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
}

export async function readJsonBody(request: Request, maxBytes: number) {
  const raw = await readRequestText(request, maxBytes);

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new InvalidJsonBodyError();
  }
}

export function jsonResponse(
  request: Request,
  data: unknown,
  init: ResponseInit = {},
  allowOrigin = false
) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  for (const [key, value] of Object.entries(getCorsHeaders(request.headers.get("origin"), allowOrigin))) {
    headers.set(key, value);
  }

  return new Response(JSON.stringify(data), {
    ...init,
    headers
  });
}

export function handleOptions(request: Request, allowOrigin = false) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request.headers.get("origin"), allowOrigin)
  });
}
