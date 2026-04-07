import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  buildSessionHeaders,
  consumeMagicLink,
  sanitizeRedirectTo,
} from "~/lib/auth.server";
import { getRequestClientIp, getRequestUserAgent } from "~/lib/http.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const redirectTo = sanitizeRedirectTo(url.searchParams.get("redirectTo"));
  if (!token) {
    throw redirect("/admin/login");
  }

  const session = await consumeMagicLink(token, {
    ip: getRequestClientIp(request),
    userAgent: getRequestUserAgent(request),
  });
  if (!session) {
    throw redirect("/admin/login");
  }

  throw redirect(redirectTo ?? "/admin", {
    headers: buildSessionHeaders(session.session)
  });
}
