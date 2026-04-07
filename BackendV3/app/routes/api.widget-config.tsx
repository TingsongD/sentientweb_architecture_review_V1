import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { buildWidgetClientConfig } from "~/lib/widget-config.server";
import { resolveBootstrapInstall } from "~/lib/site-install.server";
import { WidgetConfigQuerySchema, validationErrorResponse } from "~/lib/validation.server";
import { jsonResponse, handleOptions } from "~/lib/http.server";

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") return handleOptions(request, true);

  const url = new URL(request.url);
  try {
    const { siteKey, installKey } = WidgetConfigQuerySchema.parse(
      Object.fromEntries(url.searchParams),
    );
    const resolved = await resolveBootstrapInstall({
      request,
      siteKey,
      installKey,
    });

    return jsonResponse(
      request,
      buildWidgetClientConfig({
        tenant: resolved.tenant,
        install: resolved.install,
      }),
      {},
      true,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(request, error, true);
    }
    if (error instanceof Response) return error;
    return jsonResponse(
      request,
      { error: "Unable to load widget config" },
      { status: 500 },
      true,
    );
  }
}
