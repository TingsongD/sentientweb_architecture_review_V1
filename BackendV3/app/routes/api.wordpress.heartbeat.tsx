import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import prisma from "~/db.server";
import { jsonResponse, handleOptions } from "~/lib/http.server";
import { authenticateManagedInstall } from "~/lib/site-install.server";
import {
  WordPressHeartbeatSchema,
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
    const payload = WordPressHeartbeatSchema.parse(await request.json());
    const install = await authenticateManagedInstall({
      installKey: payload.installKey,
      managementToken: payload.managementToken,
    });

    await prisma.siteInstall.update({
      where: { id: install.id },
      data: {
        status: "active",
        pluginVersion: payload.pluginVersion ?? install.pluginVersion,
        lastSeenAt: new Date(),
      },
    });

    return jsonResponse(request, { ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(request, error);
    }
    return jsonResponse(
      request,
      { error: error instanceof Error ? error.message : "Heartbeat failed" },
      { status: 401 },
    );
  }
}
