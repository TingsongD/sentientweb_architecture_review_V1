import { getCorsHeaders } from "./origin.server";

export function jsonResponse(
  request: Request,
  data: unknown,
  init: ResponseInit = {},
  allowOrigin = true
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

export function handleOptions(request: Request, allowOrigin = true) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request.headers.get("origin"), allowOrigin)
  });
}
