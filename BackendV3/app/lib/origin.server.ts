import prisma from "~/db.server";

export interface TenantSiteContext {
  tenantId: string;
  publicSiteKey: string;
}

export class InvalidAllowedOriginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAllowedOriginError";
  }
}

export function normalizeOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`;
  } catch {
    return origin;
  }
}

function parseAllowedOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidAllowedOriginError(`Invalid origin: ${value}`);
  }

  if (url.protocol !== "https:") {
    throw new InvalidAllowedOriginError(
      `Allowed origins must use HTTPS: ${value}`,
    );
  }

  if (url.username || url.password) {
    throw new InvalidAllowedOriginError(
      `Allowed origins must not include credentials: ${value}`,
    );
  }

  if (url.search || url.hash) {
    throw new InvalidAllowedOriginError(
      `Allowed origins must not include query strings or fragments: ${value}`,
    );
  }

  if (url.pathname !== "/" && url.pathname !== "") {
    throw new InvalidAllowedOriginError(
      `Allowed origins must be bare origins without paths: ${value}`,
    );
  }

  return `https://${url.host.toLowerCase()}`;
}

export function parseConfiguredAllowedOrigins(input: string) {
  const uniqueOrigins = new Set<string>();

  for (const rawValue of input.split("\n")) {
    const trimmed = rawValue.trim();
    if (!trimmed) continue;
    uniqueOrigins.add(parseAllowedOrigin(trimmed));
  }

  if (uniqueOrigins.size > 10) {
    throw new InvalidAllowedOriginError(
      "Allowed origins are limited to 10 entries.",
    );
  }

  return Array.from(uniqueOrigins);
}

export function getCorsHeaders(origin: string | null, allowOrigin = false) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Site-Key"
  };

  if (!origin || !allowOrigin) {
    return headers;
  }

  headers["Access-Control-Allow-Origin"] = origin;
  headers["Access-Control-Allow-Credentials"] = "true";
  headers.Vary = "Origin";
  return headers;
}

export async function authenticateSiteRequest(
  request: Request,
  siteKey: string | null
) {
  if (!siteKey) {
    throw new Response(JSON.stringify({ error: "Missing site key" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { publicSiteKey: siteKey }
  });

  if (!tenant) {
    throw new Response(JSON.stringify({ error: "Invalid site key" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    throw new Response(JSON.stringify({ error: "Origin header is required" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const normalized = normalizeOrigin(origin);
  const allowlist = tenant.allowedOrigins.length > 0 ? tenant.allowedOrigins : tenant.domains.map((domain: string) => `https://${domain}`);
  if (!allowlist.includes(normalized)) {
    throw new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(origin, false)
      }
    });
  }

  return tenant;
}
