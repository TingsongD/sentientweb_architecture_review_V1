import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { requireAdminSession } from "~/lib/auth.server";
import { toKnownErrorResponse } from "~/lib/errors.server";
import { enqueueKnowledgeCrawl } from "~/lib/knowledge-base.server";
import { CrawlRequestSchema, validationErrorResponse } from "~/lib/validation.server";
import { jsonResponse } from "~/lib/http.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { tenant } = await requireAdminSession(request);
    const payload = CrawlRequestSchema.parse(await request.json());
    const source = await enqueueKnowledgeCrawl({
      tenantId: tenant.id,
      rootUrl: payload.rootUrl,
      title: payload.title
    });
    return jsonResponse(request, { success: true, sourceId: source.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(request, error);
    }
    if (error instanceof Response) return error;
    const knownErrorResponse = toKnownErrorResponse(request, error);
    if (knownErrorResponse) return knownErrorResponse;
    return jsonResponse(request, { error: "Unable to start crawl" }, { status: 500 });
  }
}
