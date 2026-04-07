import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { requireAdminSession } from "~/lib/auth.server";
import { toKnownErrorResponse } from "~/lib/errors.server";
import { jsonResponse } from "~/lib/http.server";
import { CrmWebhookTestSchema, validationErrorResponse } from "~/lib/validation.server";
import { testGenericWebhook } from "~/lib/webhook-crm.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    await requireAdminSession(request);
    const payload = CrmWebhookTestSchema.parse(await request.json());
    const result = await testGenericWebhook({
      webhookUrl: payload.webhookUrl,
      secret: payload.secret ?? null
    });
    return jsonResponse(request, result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(request, error);
    }
    if (error instanceof Response) return error;
    const knownErrorResponse = toKnownErrorResponse(request, error);
    if (knownErrorResponse) return knownErrorResponse;
    return jsonResponse(request, { error: "Webhook test failed" }, { status: 500 });
  }
}
