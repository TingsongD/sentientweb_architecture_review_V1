import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { requireAdminSession } from "~/lib/auth.server";
import { jsonResponse } from "~/lib/http.server";
import { CalendlyTestSchema, validationErrorResponse } from "~/lib/validation.server";
import { testCalendlyConfig } from "~/lib/calendly.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    await requireAdminSession(request);
    const payload = CalendlyTestSchema.parse(await request.json());
    const result = await testCalendlyConfig(payload.accessToken, payload.eventTypeUri);
    return jsonResponse(request, result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(request, error);
    }
    if (error instanceof Response) return error;
    return jsonResponse(request, { error: "Calendly test failed" }, { status: 500 });
  }
}
