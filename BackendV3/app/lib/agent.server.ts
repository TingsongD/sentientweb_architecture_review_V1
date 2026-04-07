import {
  Prisma,
  type Conversation,
  type Lead,
  type Tenant,
} from "@prisma/client";
import prisma from "~/db.server";
import { getProvider } from "./ai/registry";
import type { AIMessage, ToolDefinition, ToolCall } from "./ai/types";
import { buildSystemPrompt } from "./ai/prompt-builder";
import {
  createB2BWebsiteAdapter,
  getKnowledgeSummaryForQuestion,
} from "./b2b-adapter.server";
import { decryptSecret } from "./crypto.server";
import { InvalidConversationError } from "./errors.server";
import { logger } from "~/utils";

function toPrismaJson(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class TenantAiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantAiConfigError";
  }
}

export function getTenantAiConfig(tenant: Tenant) {
  const provider = tenant.aiProvider === "gemini" ? "gemini" : "openai";
  const managedApiKey =
    provider === "gemini"
      ? process.env.GEMINI_API_KEY || ""
      : process.env.OPENAI_API_KEY || "";
  const credentialMode =
    tenant.aiCredentialMode === "tenant_key" ? "tenant_key" : "managed";
  const apiKey =
    credentialMode === "tenant_key"
      ? tenant.aiApiKeyEncrypted
        ? decryptSecret(tenant.aiApiKeyEncrypted)
        : ""
      : managedApiKey;

  if (!apiKey) {
    throw new TenantAiConfigError(
      credentialMode === "tenant_key"
        ? "Tenant AI API key is required when AI credential mode is set to tenant_key."
        : `Managed ${provider} API key is not configured on the platform.`,
    );
  }

  return {
    provider,
    model: tenant.aiModel || process.env.DEFAULT_AI_MODEL || "gpt-4o-mini",
    apiKey,
    temperature: 0.2,
    maxTokens: 500,
  } as const;
}

export const READ_ONLY_TOOL_NAMES = new Set<string>([
  "search_knowledge_base",
  "get_visitor_context",
]);

export function isReadOnlyTool(name: string) {
  return READ_ONLY_TOOL_NAMES.has(name);
}

export function buildToolExecutionPlan(toolCalls: ToolCall[]) {
  const batches: ToolCall[][] = [];
  let readOnlyBatch: ToolCall[] = [];

  for (const call of toolCalls) {
    if (isReadOnlyTool(call.name)) {
      readOnlyBatch.push(call);
      continue;
    }

    if (readOnlyBatch.length > 0) {
      batches.push(readOnlyBatch);
      readOnlyBatch = [];
    }

    batches.push([call]);
  }

  if (readOnlyBatch.length > 0) {
    batches.push(readOnlyBatch);
  }

  return batches;
}

function buildVisitorContext(
  events: Array<{
    eventType: string;
    pageUrl: string | null;
    payload: unknown;
  }>,
) {
  if (events.length === 0) return "No visitor events stored for this session.";
  return events
    .slice(0, 5)
    .map(
      (event) =>
        `${event.eventType} on ${event.pageUrl ?? "unknown page"} ${JSON.stringify(event.payload)}`,
    )
    .join("\n");
}

export async function getOrCreateConversation(input: {
  tenantId: string;
  sessionId: string;
  conversationId?: string;
  pageUrl?: string;
  visitorName?: string;
  visitorEmail?: string;
}): Promise<Conversation & { lead: Lead | null }> {
  let conversation: (Conversation & { lead: Lead | null }) | null = null;

  if (input.conversationId) {
    conversation = await prisma.conversation.findFirst({
      where: {
        id: input.conversationId,
        tenantId: input.tenantId,
        sessionId: input.sessionId,
      },
      include: { lead: true },
    });

    if (!conversation) {
      throw new InvalidConversationError();
    }
  }

  if (!conversation && !input.conversationId) {
    conversation = await prisma.conversation.create({
      data: {
        tenantId: input.tenantId,
        sessionId: input.sessionId,
        currentPageUrl: input.pageUrl ?? null,
        visitorName: input.visitorName ?? null,
        visitorEmail: input.visitorEmail?.toLowerCase().trim() ?? null,
      },
      include: { lead: true },
    });
  }

  if (!conversation) {
    throw new InvalidConversationError();
  }

  return conversation;
}

async function persistToolExecution(input: {
  tenantId: string;
  conversationId: string;
  toolName: string;
  status: string;
  input: Record<string, unknown>;
  output?: unknown;
  latencyMs?: number;
}) {
  return prisma.toolExecution.create({
    data: {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      toolName: input.toolName,
      status: input.status,
      input: toPrismaJson(input.input),
      output: toPrismaJson(input.output),
      latencyMs: input.latencyMs ?? null,
    },
  });
}

function getToolDefinitions(activeLead: Lead | null): ToolDefinition[] {
  const toolDefinitions: ToolDefinition[] = [
    {
      name: "search_knowledge_base",
      description:
        "Search the tenant knowledge base for relevant product or documentation details.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          topK: { type: "number" },
        },
        required: ["query"],
      },
    },
    {
      name: "qualify_lead",
      description:
        "Capture or update lead qualification details gathered in the conversation and compute booking eligibility.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string" },
          name: { type: "string" },
          company: { type: "string" },
          companyDomain: { type: "string" },
          role: { type: "string" },
          authorityConfirmed: { type: "boolean" },
          useCase: { type: "string" },
          icpFit: {
            type: "string",
            enum: ["match", "no_match", "unknown"],
          },
          timeline: { type: "string" },
          notes: { type: "string" },
          qualificationStatus: { type: "string" },
        },
      },
    },
    {
      name: "route_to_human",
      description:
        "Escalate to a human when the lead asks for a live follow-up or the answer is uncertain.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" },
          summary: { type: "string" },
        },
        required: ["reason", "summary"],
      },
    },
    {
      name: "get_visitor_context",
      description:
        "Review the latest behavior events for this visitor session.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  ];

  if (activeLead?.bookingEligible) {
    toolDefinitions.push(
      {
        name: "check_calendar_availability",
        description: "Check Calendly availability for demo slots.",
        parameters: {
          type: "object",
          properties: {
            startDate: { type: "string" },
            endDate: { type: "string" },
          },
          required: ["startDate", "endDate"],
        },
      },
      {
        name: "book_demo",
        description: "Book a demo for the visitor once a slot is confirmed.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            startTime: { type: "string" },
            notes: { type: "string" },
          },
          required: ["name", "email", "startTime"],
        },
      },
      {
        name: "create_crm_contact",
        description:
          "Queue the qualified lead for CRM sync without blocking the visitor response.",
        parameters: {
          type: "object",
          properties: {
            email: { type: "string" },
            name: { type: "string" },
            company: { type: "string" },
            companyDomain: { type: "string" },
            role: { type: "string" },
            notes: { type: "string" },
          },
        },
      },
    );
  }

  return toolDefinitions;
}

export type AgentStreamEvent =
  | { type: "delta"; content: string }
  | { type: "tool_start"; toolName: string; input: any }
  | { type: "tool_end"; toolName: string; output: any }
  | { type: "error"; message: string }
  | {
      type: "done";
      conversationId: string;
      reply: string;
      leadId: string | null;
    };

type ToolExecutionOutcome =
  | {
      call: ToolCall;
      ok: true;
      result: unknown;
      latencyMs: number;
      toolExecutionId?: string | null;
    }
  | {
      call: ToolCall;
      ok: false;
      errorMessage: string;
      latencyMs: number;
      toolExecutionId?: string | null;
    };

export async function* handleAgentMessageGenerator(input: {
  tenant: Tenant;
  conversation: Conversation & { lead: Lead | null };
  sessionId: string;
  message: string;
  visitorName?: string;
  visitorEmail?: string;
}): AsyncGenerator<AgentStreamEvent> {
  const adapter = createB2BWebsiteAdapter({
    tenant: {
      id: input.tenant.id,
      name: input.tenant.name,
      calendlyAccessTokenEncrypted: input.tenant.calendlyAccessTokenEncrypted,
      calendlyEventTypeUri: input.tenant.calendlyEventTypeUri,
      crmWebhookUrl: input.tenant.crmWebhookUrl,
      crmWebhookSecretEncrypted: input.tenant.crmWebhookSecretEncrypted,
      handoffWebhookUrl: input.tenant.handoffWebhookUrl,
      handoffWebhookSecretEncrypted: input.tenant.handoffWebhookSecretEncrypted,
    },
    conversationId: input.conversation.id,
  });

  const [existingMessages, visitorEvents, knowledgeContext] = await Promise.all(
    [
      prisma.message.findMany({
        where: { conversationId: input.conversation.id },
        orderBy: { createdAt: "asc" },
        take: 30,
      }),
      adapter.getVisitorContext(input.sessionId),
      getKnowledgeSummaryForQuestion(input.tenant.id, input.message),
    ],
  );

  const systemPrompt = buildSystemPrompt({
    tenant: input.tenant,
    knowledgeContext,
    visitorContext: buildVisitorContext(visitorEvents),
  });

  const aiMessages: AIMessage[] = existingMessages.map((message) => ({
    role:
      message.role === "assistant"
        ? "assistant"
        : message.role === "tool"
          ? "tool"
          : "user",
    content: message.content,
    toolCallId:
      message.role === "tool"
        ? String(
            (message.metadata as { toolCallId?: string } | null)?.toolCallId ??
              "",
          )
        : undefined,
  }));

  aiMessages.push({
    role: "user",
    content: input.message,
  });

  await prisma.message.create({
    data: {
      conversationId: input.conversation.id,
      role: "user",
      content: input.message,
      modality: "text",
      metadata: {
        visitorName: input.visitorName ?? null,
        visitorEmail: input.visitorEmail ?? null,
      },
    },
  });

  const providerConfig = getTenantAiConfig(input.tenant);
  logger.info("Resolved tenant AI configuration", {
    tenantId: input.tenant.id,
    provider: providerConfig.provider,
    credentialMode:
      input.tenant.aiCredentialMode === "tenant_key" ? "tenant_key" : "managed",
  });
  const provider = getProvider(providerConfig.provider);

  let finalContent: string | null = null;
  let workingMessages = [...aiMessages];
  let loopCount = 0;
  let activeLead = input.conversation.lead;

  const executeToolCall = async (
    call: ToolCall,
  ): Promise<ToolExecutionOutcome> => {
    const start = Date.now();
    let toolExecutionId: string | null = null;

    try {
      let result: unknown;

      switch (call.name) {
        case "search_knowledge_base":
          result = await adapter.searchKnowledgeBase(
            String(call.arguments.query ?? input.message),
            Number(call.arguments.topK ?? 5),
          );
          break;
        case "qualify_lead": {
          const qualificationResult = await adapter.qualifyLead({
            conversationId: input.conversation.id,
            leadId: activeLead?.id,
            email:
              (call.arguments.email as string | undefined) ??
              input.visitorEmail,
            name:
              (call.arguments.name as string | undefined) ?? input.visitorName,
            company: call.arguments.company as string | undefined,
            companyDomain: call.arguments.companyDomain as string | undefined,
            role: call.arguments.role as string | undefined,
            authorityConfirmed:
              typeof call.arguments.authorityConfirmed === "boolean"
                ? (call.arguments.authorityConfirmed as boolean)
                : undefined,
            useCase: call.arguments.useCase as string | undefined,
            icpFit: call.arguments.icpFit as string | undefined,
            timeline: call.arguments.timeline as string | undefined,
            notes: call.arguments.notes as string | undefined,
            qualificationStatus: call.arguments.qualificationStatus as
              | string
              | undefined,
          });
          activeLead = qualificationResult.lead;
          result = qualificationResult;
          break;
        }
        case "check_calendar_availability":
          if (!activeLead?.bookingEligible) {
            result = {
              ok: false,
              message:
                "Qualification is incomplete. Capture company domain, use case, ICP match, and authority before checking availability.",
            };
            break;
          }
          result = await adapter.checkCalendarAvailability({
            startDate: String(
              call.arguments.startDate ?? new Date().toISOString(),
            ),
            endDate: String(
              call.arguments.endDate ??
                new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
            ),
          });
          break;
        case "book_demo":
          if (!activeLead?.bookingEligible) {
            result = {
              ok: false,
              message:
                "Booking is blocked until the visitor has company domain, use case, ICP match, and authority confirmed.",
              missingFields: [
                ...(activeLead?.companyDomain ? [] : ["companyDomain"]),
                ...(activeLead?.useCase ? [] : ["useCase"]),
                ...(activeLead?.icpFit === "match" ? [] : ["icpMatch"]),
                ...(activeLead?.authorityConfirmed ? [] : ["authority"]),
              ],
            };
            break;
          }
          result = await adapter.bookDemo({
            conversationId: input.conversation.id,
            leadId: activeLead?.id,
            name: String(
              call.arguments.name ?? input.visitorName ?? "Website visitor",
            ),
            email: String(call.arguments.email ?? input.visitorEmail ?? ""),
            startTime: String(call.arguments.startTime ?? ""),
            notes: String(call.arguments.notes ?? input.message),
          });
          break;
        case "create_crm_contact":
          if (!activeLead?.bookingEligible) {
            result = {
              ok: false,
              message: "CRM sync is only available for qualified leads.",
            };
            break;
          }
          const toolExecution = await persistToolExecution({
            tenantId: input.tenant.id,
            conversationId: input.conversation.id,
            toolName: call.name,
            status: "queued",
            input: call.arguments,
            output: {
              ok: true,
              status: "queued",
            },
            latencyMs: Date.now() - start,
          });
          toolExecutionId = toolExecution.id;
          result = await adapter.createCrmContact({
            leadId: activeLead?.id,
            conversationId: input.conversation.id,
            email: String(
              call.arguments.email ??
                activeLead?.email ??
                input.visitorEmail ??
                "",
            ),
            name: String(
              call.arguments.name ??
                activeLead?.name ??
                input.visitorName ??
                "",
            ),
            company: String(
              call.arguments.company ?? activeLead?.company ?? "",
            ),
            companyDomain: String(
              call.arguments.companyDomain ?? activeLead?.companyDomain ?? "",
            ),
            role: String(call.arguments.role ?? activeLead?.role ?? ""),
            notes: String(call.arguments.notes ?? input.message),
            toolExecutionId,
          });
          await prisma.toolExecution.update({
            where: { id: toolExecutionId },
            data: {
              output: toPrismaJson(result),
            },
          });
          break;
        case "route_to_human":
          result = await adapter.routeToHuman({
            conversationId: input.conversation.id,
            reason: String(call.arguments.reason ?? "manual escalation"),
            summary: String(call.arguments.summary ?? input.message),
          });
          break;
        case "get_visitor_context":
          result = await adapter.getVisitorContext(input.sessionId);
          break;
        default:
          result = { ok: false, message: `Unknown tool: ${call.name}` };
          break;
      }

      return {
        call,
        ok: true,
        result,
        latencyMs: Date.now() - start,
        toolExecutionId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      if (toolExecutionId) {
        await prisma.toolExecution.update({
          where: { id: toolExecutionId },
          data: {
            status: "error",
            output: toPrismaJson({
              ok: false,
              error: errorMessage,
            }),
          },
        });
      }

      logger.error("Tool execution failed", error, { toolName: call.name });
      return {
        call,
        ok: false,
        errorMessage,
        latencyMs: Date.now() - start,
        toolExecutionId,
      };
    }
  };

  while (loopCount < 5) {
    let accumulatedContent = "";
    let toolCalls: ToolCall[] = [];
    const toolDefinitions = getToolDefinitions(activeLead);

    const stream = provider.generateReplyStream(
      workingMessages,
      providerConfig,
      systemPrompt,
      { tools: toolDefinitions, toolChoice: "auto" },
    );

    for await (const chunk of stream) {
      if (chunk.type === "text") {
        accumulatedContent += chunk.content;
        yield { type: "delta", content: chunk.content };
      } else if (chunk.type === "tool_call") {
        toolCalls.push(chunk.call);
      }
    }

    if (toolCalls.length === 0) {
      finalContent =
        accumulatedContent ||
        "I’m not fully sure yet. I can connect you with the team.";
      break;
    }

    workingMessages.push({
      role: "assistant",
      content: accumulatedContent || null,
      toolCalls: toolCalls,
    });

    await prisma.message.create({
      data: {
        conversationId: input.conversation.id,
        role: "assistant",
        content: accumulatedContent || "",
        metadata: toPrismaJson({ toolCalls }) as Prisma.InputJsonValue,
      },
    });

    for (const batch of buildToolExecutionPlan(toolCalls)) {
      for (const call of batch) {
        yield {
          type: "tool_start",
          toolName: call.name,
          input: call.arguments,
        };
      }

      const outcomes = await Promise.all(
        batch.map((call) => executeToolCall(call)),
      );

      for (const outcome of outcomes) {
        if (outcome.ok) {
          yield {
            type: "tool_end",
            toolName: outcome.call.name,
            output: outcome.result,
          };

          if (outcome.call.name !== "create_crm_contact") {
            await persistToolExecution({
              tenantId: input.tenant.id,
              conversationId: input.conversation.id,
              toolName: outcome.call.name,
              status: "success",
              input: outcome.call.arguments,
              output: outcome.result,
              latencyMs: outcome.latencyMs,
            });
          }

          const toolPayload = JSON.stringify(outcome.result);
          workingMessages.push({
            role: "tool",
            toolCallId: outcome.call.id,
            content: toolPayload,
          });

          await prisma.message.create({
            data: {
              conversationId: input.conversation.id,
              role: "tool",
              content: toolPayload,
              metadata: {
                toolName: outcome.call.name,
                toolCallId: outcome.call.id,
              },
            },
          });

          continue;
        }

        yield { type: "error", message: outcome.errorMessage };

        if (
          outcome.call.name !== "create_crm_contact" ||
          !outcome.toolExecutionId
        ) {
          await persistToolExecution({
            tenantId: input.tenant.id,
            conversationId: input.conversation.id,
            toolName: outcome.call.name,
            status: "error",
            input: outcome.call.arguments,
            output: {
              error: outcome.errorMessage,
            },
            latencyMs: outcome.latencyMs,
          });
        }

        workingMessages.push({
          role: "tool",
          toolCallId: outcome.call.id,
          content: JSON.stringify({
            ok: false,
            error: outcome.errorMessage,
          }),
        });
      }
    }

    loopCount += 1;
  }

  const reply =
    finalContent ??
    "I have the context I need. I can help with next steps or connect you with the team.";

  await prisma.message.create({
    data: {
      conversationId: input.conversation.id,
      role: "assistant",
      content: reply,
      modality: "text",
    },
  });

  await prisma.conversation.update({
    where: { id: input.conversation.id },
    data: {
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    },
  });

  yield {
    type: "done",
    conversationId: input.conversation.id,
    reply,
    leadId: activeLead?.id ?? null,
  };
}

export async function handleAgentMessage(input: {
  tenant: Tenant;
  conversation: Conversation & { lead: Lead | null };
  sessionId: string;
  message: string;
  visitorName?: string;
  visitorEmail?: string;
}) {
  const gen = handleAgentMessageGenerator(input);
  let lastEvent: any = null;

  for await (const event of gen) {
    if (event.type === "done") {
      lastEvent = event;
    }
  }

  if (!lastEvent) {
    throw new Error("Agent message processing failed to complete");
  }

  return {
    conversationId: lastEvent.conversationId,
    reply: lastEvent.reply,
    leadId: lastEvent.leadId,
  };
}

export async function handleAgentMessageStream(input: {
  tenant: Tenant;
  conversation: Conversation & { lead: Lead | null };
  sessionId: string;
  message: string;
  visitorName?: string;
  visitorEmail?: string;
}) {
  const encoder = new TextEncoder();
  const gen = handleAgentMessageGenerator(input);

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of gen) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
