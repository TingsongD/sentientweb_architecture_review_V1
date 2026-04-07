const SESSION_COOKIE = "sentient_admin_session";

function buildSessionCookieAttributes(maxAgeSeconds: number) {
  const attributes = [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (process.env.NODE_ENV === "production") {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function parseCookies(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, entry) => {
      const [key, ...rest] = entry.split("=");
      acc[key] = decodeURIComponent(rest.join("="));
      return acc;
    }, {});
}

export function getSessionCookie(request: Request) {
  return parseCookies(request)[SESSION_COOKIE] ?? null;
}

export function createSessionCookie(value: string, maxAgeSeconds = 60 * 60 * 24 * 14) {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; ${buildSessionCookieAttributes(maxAgeSeconds)}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; ${buildSessionCookieAttributes(0)}`;
}
