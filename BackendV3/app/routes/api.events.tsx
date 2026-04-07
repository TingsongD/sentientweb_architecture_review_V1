import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import prisma from "~/db.server";
import { EventsBatchSchema, validationErrorResponse } from "~/lib/validation.server";
import {
  jsonResponse,
  handleOptions,
  PUBLIC_API_LARGE_BODY_LIMIT_BYTES,
  readJsonBody,
} from "~/lib/http.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import { insertBehaviorEvents } from "~/lib/behavior-events.server";
import { evaluateTriggers } from "~/lib/triggers.server";
import { toKnownErrorResponse } from "~/lib/errors.server";
import { requireRedis } from "~/lib/redis.server";
import { authenticateVisitorRequest } from "~/lib/site-install.server";
import { logger } from "~/utils";

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") return handleOptions(request, true);
  return jsonResponse(request, { error: "Method not allowed" }, { status: 405 }, true);
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") return handleOptions(request, true);
  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Method not allowed" }, { status: 405 }, true);
  }

  try {
    const payload = EventsBatchSchema.parse(
      await readJsonBody(request, PUBLIC_API_LARGE_BODY_LIMIT_BYTES),
    );
    const visitor = await authenticateVisitorRequest(request);
    const suppliedSessionIds = new Set(
      payload.events
        .map((event) => event.sessionId)
        .filter((value): value is string => !!value),
    );
    if (
      suppliedSessionIds.size > 1 ||
      (suppliedSessionIds.size === 1 &&
        !suppliedSessionIds.has(visitor.sessionId))
    ) {
      return jsonResponse(
        request,
        {
          error: "All events in a batch must match the authenticated visitor session.",
          code: "SESSION_MISMATCH",
        },
        { status: 400 },
        true,
      );
    }

    const rate = await checkRateLimit(
      `events:${visitor.install.id}:${visitor.sessionId}`,
      120,
      60,
    );
    if (!rate.allowed) {
      return jsonResponse(request, { error: "Rate limit exceeded" }, { status: 429 }, true);
    }

    const conversationIds = [
      ...new Set(
        payload.events
          .map((event) => event.conversationId)
          .filter((value): value is string => !!value),
      ),
    ];
    const ownedConversationIds =
      conversationIds.length === 0
        ? new Set<string>()
        : new Set(
            (
              await prisma.conversation.findMany({
                where: {
                  id: { in: conversationIds },
                  tenantId: visitor.tenant.id,
                  sessionId: visitor.sessionId,
                },
                select: { id: true },
              })
            ).map((conversation) => conversation.id),
          );

    if (conversationIds.length !== ownedConversationIds.size) {
      return jsonResponse(
        request,
        {
          error: "Conversation not found for this visitor session.",
          code: "INVALID_CONVERSATION",
        },
        { status: 404 },
        true,
      );
    }

    const redis = requireRedis();

    const triggerResponses = [];
    for (const event of payload.events) {
      const recentTriggers = new Set<string>();
      const stored = await redis.smembers(
        `triggered:${visitor.install.id}:${visitor.sessionId}`,
      );
      for (const value of stored) recentTriggers.add(value);

      const trigger = evaluateTriggers({
        tenant: visitor.tenant,
        sessionId: visitor.sessionId,
        event: {
          eventType: event.eventType,
          pageUrl: event.pageUrl,
          payload: event.payload
        },
        recentlyTriggered: recentTriggers
      });

      if (trigger) {
        triggerResponses.push({
          event,
          trigger
        });
      }
    }

    await insertBehaviorEvents(
      payload.events.map((event) => ({
        tenantId: visitor.tenant.id,
        sessionId: visitor.sessionId,
        eventType: event.eventType,
        source: event.source,
        pageUrl: event.pageUrl ?? null,
        conversationId:
          event.conversationId && ownedConversationIds.has(event.conversationId)
            ? event.conversationId
            : null,
        payload: event.payload,
        occurredAt: event.occurredAt ? new Date(event.occurredAt) : undefined
      }))
    );

    for (const item of triggerResponses) {
      await redis.sadd(
        `triggered:${visitor.install.id}:${visitor.sessionId}`,
        item.trigger.id,
      );
      await redis.expire(
        `triggered:${visitor.install.id}:${visitor.sessionId}`,
        item.trigger.cooldownSeconds,
      );
    }

    return jsonResponse(
      request,
      {
        success: true,
        trigger: triggerResponses[0]?.trigger ?? null,
      },
      {},
      true,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationErrorResponse(request, error, true);
    }
    if (error instanceof Response) return error;
    const knownErrorResponse = toKnownErrorResponse(request, error, true);
    if (knownErrorResponse) return knownErrorResponse;
    logger.error("Unexpected failure in public events route", error, {
      route: "/api/events",
    });
    return jsonResponse(request, { error: "Unable to record events" }, { status: 500 }, true);
  }
}
