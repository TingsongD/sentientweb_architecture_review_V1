import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { jsonResponse, handleOptions } from "~/lib/http.server";
import { normalizeInstallOrigin } from "~/lib/site-install.server";
import {
  WordPressConnectSchema,
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
    const payload = WordPressConnectSchema.parse(await request.json());
    const { origin } = normalizeInstallOrigin(payload.origin);
    const returnUrl = new URL(payload.returnUrl);
    const connectUrl = new URL("/admin/installs", request.url);
    connectUrl.searchParams.set("platform", "wordpress");
    connectUrl.searchParams.set("origin", origin);
    connectUrl.searchParams.set("returnUrl", returnUrl.toString());
    if (payload.pluginVersion) {
      connectUrl.searchParams.set("pluginVersion", payload.pluginVersion);
    }

    return jsonResponse(request, {
      connectUrl: connectUrl.toString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(request, error);
    }
    return jsonResponse(
      request,
      { error: "Unable to create WordPress connect URL" },
      { status: 400 },
    );
  }
}
