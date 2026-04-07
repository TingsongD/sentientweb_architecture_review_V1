import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import {
  jsonResponse,
  handleOptions,
  PUBLIC_API_SMALL_BODY_LIMIT_BYTES,
  readJsonBody,
} from "~/lib/http.server";
import { issueVisitorSession, resolveBootstrapInstall } from "~/lib/site-install.server";
import {
  WidgetBootstrapSchema,
  validationErrorResponse,
} from "~/lib/validation.server";
import { buildWidgetClientConfig } from "~/lib/widget-config.server";
import { toKnownErrorResponse } from "~/lib/errors.server";
import { logger } from "~/utils";

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") return handleOptions(request, true);
  return jsonResponse(
    request,
    { error: "Method not allowed" },
    { status: 405 },
    true,
  );
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") return handleOptions(request, true);
  if (request.method !== "POST") {
    return jsonResponse(
      request,
      { error: "Method not allowed" },
      { status: 405 },
      true,
    );
  }

  try {
    const payload = WidgetBootstrapSchema.parse(
      await readJsonBody(request, PUBLIC_API_SMALL_BODY_LIMIT_BYTES),
    );
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
      {},
      true,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(request, error, true);
    }
    if (error instanceof Response) return error;
    const knownErrorResponse = toKnownErrorResponse(request, error, true);
    if (knownErrorResponse) return knownErrorResponse;
    logger.error("Unexpected failure in widget bootstrap route", error, {
      route: "/api/widget/bootstrap",
    });
    return jsonResponse(
      request,
      { error: "Unable to bootstrap widget" },
      { status: 500 },
      true,
    );
  }
}
