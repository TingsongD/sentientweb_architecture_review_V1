import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import {
  jsonResponse,
  handleOptions,
  PUBLIC_API_SMALL_BODY_LIMIT_BYTES,
  readJsonBody,
} from "~/lib/http.server";
import { normalizeInstallOrigin } from "~/lib/site-install.server";
import {
  WordPressConnectSchema,
  validationErrorResponse,
} from "~/lib/validation.server";
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
    const payload = WordPressConnectSchema.parse(
      await readJsonBody(request, PUBLIC_API_SMALL_BODY_LIMIT_BYTES),
    );
    const { origin } = normalizeInstallOrigin(payload.origin);
    const returnUrl = new URL(payload.returnUrl);
    const connectUrl = new URL("/admin/installs", request.url);
    connectUrl.searchParams.set("platform", "wordpress");
    connectUrl.searchParams.set("origin", origin);
    connectUrl.searchParams.set("returnUrl", returnUrl.toString());
    if (payload.pluginVersion) {
      connectUrl.searchParams.set("pluginVersion", payload.pluginVersion);
    }

    return jsonResponse(
      request,
      {
        connectUrl: connectUrl.toString(),
      },
      {},
      true,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(request, error, true);
    }
    const knownErrorResponse = toKnownErrorResponse(request, error, true);
    if (knownErrorResponse) return knownErrorResponse;
    logger.error("Unexpected failure in WordPress connect route", error, {
      route: "/api/wordpress/connect",
    });
    return jsonResponse(
      request,
      { error: "Unable to create WordPress connect URL" },
      { status: 400 },
      true,
    );
  }
}
