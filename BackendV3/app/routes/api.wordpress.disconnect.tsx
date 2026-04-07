import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import prisma from "~/db.server";
import {
  jsonResponse,
  handleOptions,
  PUBLIC_API_SMALL_BODY_LIMIT_BYTES,
  readJsonBody,
} from "~/lib/http.server";
import { authenticateManagedInstall } from "~/lib/site-install.server";
import {
  WordPressDisconnectSchema,
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
    const payload = WordPressDisconnectSchema.parse(
      await readJsonBody(request, PUBLIC_API_SMALL_BODY_LIMIT_BYTES),
    );
    const install = await authenticateManagedInstall({
      installKey: payload.installKey,
      managementToken: payload.managementToken,
    });

    await prisma.siteInstall.update({
      where: { id: install.id },
      data: {
        managementTokenHash: null,
        status: "disconnected",
        lastSeenAt: new Date(),
      },
    });

    return jsonResponse(request, { ok: true }, {}, true);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(request, error, true);
    }
    const knownErrorResponse = toKnownErrorResponse(request, error, true);
    if (knownErrorResponse) {
      logger.error("WordPress disconnect failed", error, {
        route: "/api/wordpress/disconnect",
      });
      return knownErrorResponse;
    }
    logger.error("Unexpected failure in WordPress disconnect route", error, {
      route: "/api/wordpress/disconnect",
    });
    return jsonResponse(
      request,
      { error: "Disconnect failed" },
      { status: 401 },
      true,
    );
  }
}
