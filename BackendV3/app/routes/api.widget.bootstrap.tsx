import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { jsonResponse, handleOptions } from "~/lib/http.server";
import { issueVisitorSession, resolveBootstrapInstall } from "~/lib/site-install.server";
import {
  WidgetBootstrapSchema,
  validationErrorResponse,
} from "~/lib/validation.server";
import { buildWidgetClientConfig } from "~/lib/widget-config.server";

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") return handleOptions(request);
  return jsonResponse(
    request,
    { error: "Method not allowed" },
    { status: 405 },
  );
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") {
    return jsonResponse(
      request,
      { error: "Method not allowed" },
      { status: 405 },
    );
  }

  try {
    const payload = WidgetBootstrapSchema.parse(await request.json());
    const resolved = await resolveBootstrapInstall({
      request,
      installKey: payload.installKey,
      siteKey: payload.siteKey,
    });
    const visitor = await issueVisitorSession({
      install: resolved.install,
      tenantId: resolved.tenant.id,
      origin: resolved.origin,
      visitorToken: payload.visitorToken,
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse(
      request,
      buildWidgetClientConfig({
        tenant: resolved.tenant,
        install: resolved.install,
        visitor,
      }),
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(request, error);
    }
    if (error instanceof Response) return error;
    return jsonResponse(
      request,
      { error: "Unable to bootstrap widget" },
      { status: 500 },
    );
  }
}
