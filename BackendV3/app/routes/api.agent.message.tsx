import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import {
  AgentMessageSchema,
  validationErrorResponse,
} from "~/lib/validation.server";
import {
  jsonResponse,
  handleOptions,
  PUBLIC_API_LARGE_BODY_LIMIT_BYTES,
  readJsonBody,
} from "~/lib/http.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import { authenticateVisitorRequest } from "~/lib/site-install.server";
import {
  getOrCreateConversation,
  getTenantAiConfig,
  handleAgentMessage,
  handleAgentMessageStream,
  TenantAiConfigError,
} from "~/lib/agent.server";
import { toKnownErrorResponse } from "~/lib/errors.server";
import { getCorsHeaders } from "~/lib/origin.server";
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
    const payload = AgentMessageSchema.parse(
      await readJsonBody(request, PUBLIC_API_LARGE_BODY_LIMIT_BYTES),
    );
    const visitor = await authenticateVisitorRequest(request);
    if (payload.sessionId && payload.sessionId !== visitor.sessionId) {
      return jsonResponse(
        request,
        { error: "Visitor session mismatch", code: "SESSION_MISMATCH" },
        { status: 400 },
        true,
      );
    }
    const rate = await checkRateLimit(
      `agent:${visitor.install.id}:${visitor.sessionId}`,
      25,
      60,
    );

    if (!rate.allowed) {
      return jsonResponse(
        request,
        { error: "Rate limit exceeded" },
        { status: 429 },
        true,
      );
    }

    getTenantAiConfig(visitor.tenant);

    const conversation = await getOrCreateConversation({
      tenantId: visitor.tenant.id,
      sessionId: visitor.sessionId,
      conversationId: payload.conversationId,
      pageUrl: payload.pageUrl,
      visitorName: payload.visitorName,
      visitorEmail: payload.visitorEmail,
    });

    if (payload.stream) {
      const stream = await handleAgentMessageStream({
        tenant: visitor.tenant,
        conversation,
        sessionId: visitor.sessionId,
        message: payload.message,
        visitorName: payload.visitorName,
        visitorEmail: payload.visitorEmail,
      });

      const cors = getCorsHeaders(request.headers.get("origin"), true);
      const headers = new Headers(cors);
      headers.set("Content-Type", "text/event-stream");
      headers.set("Cache-Control", "no-cache");
      headers.set("Connection", "keep-alive");

      return new Response(stream, { headers });
    }

    const result = await handleAgentMessage({
      tenant: visitor.tenant,
      conversation,
      sessionId: visitor.sessionId,
      message: payload.message,
      visitorName: payload.visitorName,
      visitorEmail: payload.visitorEmail,
    });

    return jsonResponse(request, result, {}, true);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(request, error, true);
    }
    if (error instanceof TenantAiConfigError) {
      logger.error("Agent configuration is unavailable for public message route", error, {
        route: "/api/agent/message",
      });
      return jsonResponse(
        request,
        {
          error: "The agent is temporarily unavailable.",
          code: "AGENT_UNAVAILABLE",
        },
        { status: 503 },
        true,
      );
    }
    if (error instanceof Response) return error;
    const knownErrorResponse = toKnownErrorResponse(request, error, true);
    if (knownErrorResponse) return knownErrorResponse;
    logger.error("Unexpected failure in public agent message route", error, {
      route: "/api/agent/message",
    });
    return jsonResponse(
      request,
      { error: "Unable to process agent message" },
      { status: 500 },
      true,
    );
  }
}
