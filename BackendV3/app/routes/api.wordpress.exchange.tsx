import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import {
  jsonResponse,
  handleOptions,
  PUBLIC_API_SMALL_BODY_LIMIT_BYTES,
  readJsonBody,
} from "~/lib/http.server";
import { exchangeWordPressInstallLinkCode } from "~/lib/site-install.server";
import {
  WordPressExchangeSchema,
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
    const payload = WordPressExchangeSchema.parse(
      await readJsonBody(request, PUBLIC_API_SMALL_BODY_LIMIT_BYTES),
    );
    const result = await exchangeWordPressInstallLinkCode(payload);
    const baseUrl = new URL(request.url).origin;

    return jsonResponse(
      request,
      {
        installKey: result.install.publicInstallKey,
        origin: result.install.origin,
        platform: result.install.platform,
        agentScriptUrl: `${baseUrl}/agent.js`,
        backendOrigin: baseUrl,
        managementToken: result.managementToken,
        endpoints: {
          heartbeat: `${baseUrl}/api/wordpress/heartbeat`,
          disconnect: `${baseUrl}/api/wordpress/disconnect`,
        },
      },
      {},
      true,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(request, error, true);
    }
    const knownErrorResponse = toKnownErrorResponse(request, error, true);
    if (knownErrorResponse) {
      logger.error("WordPress exchange failed", error, {
        route: "/api/wordpress/exchange",
      });
      return knownErrorResponse;
    }
    logger.error("Unexpected failure in WordPress exchange route", error, {
      route: "/api/wordpress/exchange",
    });
    return jsonResponse(
      request,
      { error: "WordPress exchange failed" },
      { status: 400 },
      true,
    );
  }
}
