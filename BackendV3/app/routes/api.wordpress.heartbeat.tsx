import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import {
  jsonResponse,
  handleOptions,
  PUBLIC_API_SMALL_BODY_LIMIT_BYTES,
  readJsonBody,
} from "~/lib/http.server";
import { authenticateManagedInstall } from "~/lib/site-install.server";
import {
  WordPressHeartbeatSchema,
  validationErrorResponse,
} from "~/lib/validation.server";
import { toKnownErrorResponse } from "~/lib/errors.server";
import { withTenantDb } from "~/lib/tenant-db.server";
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
    const payload = WordPressHeartbeatSchema.parse(
      await readJsonBody(request, PUBLIC_API_SMALL_BODY_LIMIT_BYTES),
    );
    const install = await authenticateManagedInstall({
      installKey: payload.installKey,
      managementToken: payload.managementToken,
    });

    await withTenantDb(install.tenantId, (db) =>
      db.siteInstall.update({
        where: { id: install.id },
        data: {
          status: "active",
          pluginVersion: payload.pluginVersion ?? install.pluginVersion,
          lastSeenAt: new Date(),
        },
      }),
    );

    return jsonResponse(request, { ok: true }, {}, true);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(request, error, true);
    }
    const knownErrorResponse = toKnownErrorResponse(request, error, true);
    if (knownErrorResponse) {
      logger.error("WordPress heartbeat failed", error, {
        route: "/api/wordpress/heartbeat",
      });
      return knownErrorResponse;
    }
    logger.error("Unexpected failure in WordPress heartbeat route", error, {
      route: "/api/wordpress/heartbeat",
    });
    return jsonResponse(
      request,
      { error: "Heartbeat failed" },
      { status: 401 },
      true,
    );
  }
}
