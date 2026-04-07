import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { jsonResponse, handleOptions } from "~/lib/http.server";
import { exchangeWordPressInstallLinkCode } from "~/lib/site-install.server";
import {
  WordPressExchangeSchema,
  validationErrorResponse,
} from "~/lib/validation.server";

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
    const payload = WordPressExchangeSchema.parse(await request.json());
    const result = await exchangeWordPressInstallLinkCode(payload);
    const baseUrl = new URL(request.url).origin;

    return jsonResponse(request, {
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
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(request, error);
    }
    return jsonResponse(
      request,
      { error: error instanceof Error ? error.message : "WordPress exchange failed" },
      { status: 400 },
    );
  }
}
