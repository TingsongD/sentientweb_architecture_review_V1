import { z } from "zod";
import { getCorsHeaders } from "./origin.server";

const EVENT_PAYLOAD_MAX_BYTES = 4 * 1024;

function serializedSizeInBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export const WidgetConfigQuerySchema = z.object({
  siteKey: z.string().min(8).max(64).optional(),
  installKey: z.string().min(8).max(96).optional(),
}).superRefine((value, ctx) => {
  if (!value.siteKey && !value.installKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either siteKey or installKey is required.",
      path: ["siteKey"],
    });
  }
});

const WidgetIdentitySchema = z
  .object({
    siteKey: z.string().min(8).max(64).optional(),
    installKey: z.string().min(8).max(96).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.siteKey && !value.installKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either siteKey or installKey is required.",
        path: ["siteKey"],
      });
    }
  });

export const EventItemSchema = z.object({
  sessionId: z.string().min(1).max(120),
  eventType: z.enum([
    "page_view",
    "intent_snapshot",
    "widget_opened",
    "message_sent",
    "proactive_dismissed"
  ]),
  source: z.enum(["observer", "widget", "server"]),
  pageUrl: z.string().url().optional(),
  conversationId: z.string().uuid().optional(),
  payload: z
    .record(z.string(), z.any())
    .default({})
    .superRefine((value, ctx) => {
      if (serializedSizeInBytes(value) > EVENT_PAYLOAD_MAX_BYTES) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Event payload must not exceed ${EVENT_PAYLOAD_MAX_BYTES} bytes when serialized.`,
        });
      }
    }),
  occurredAt: z.number().int().positive().optional()
});

export const EventsBatchSchema = WidgetIdentitySchema.extend({
  events: z.array(EventItemSchema).min(1).max(25)
});

export const AgentMessageSchema = WidgetIdentitySchema.extend({
  sessionId: z.string().min(1).max(120).optional(),
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(1200).trim(),
  pageUrl: z.string().url().optional(),
  visitorName: z.string().max(120).optional(),
  visitorEmail: z.string().email().max(255).optional(),
  stream: z.boolean().optional()
});

export const WidgetBootstrapSchema = WidgetIdentitySchema.extend({
  visitorToken: z.string().max(4096).optional(),
  pageUrl: z.string().url().optional(),
  platform: z.enum(["script", "wordpress"]).optional(),
  pluginVersion: z.string().max(40).optional(),
});

export const CreateTenantSchema = z.object({
  companyName: z.string().min(2).max(120),
  primaryDomain: z.string().min(3).max(255),
  adminEmail: z.string().email().max(255),
  adminName: z.string().max(120).optional()
});

export const RequestMagicLinkSchema = z.object({
  email: z.string().email().max(255)
});

export const CrawlRequestSchema = z.object({
  rootUrl: z.string().url(),
  title: z.string().max(160).optional()
});

export const TenantSettingsSchema = z.object({
  agentName: z.string().min(2).max(80),
  accentColor: z.string().regex(/^#([A-Fa-f0-9]{6})$/),
  launcherLabel: z.string().min(2).max(60),
  proactiveEnabled: z.boolean(),
  pricingTriggerEnabled: z.boolean(),
  docsTriggerEnabled: z.boolean(),
  pricingMessage: z.string().max(240),
  docsMessage: z.string().max(240),
  qualificationPrompts: z.array(z.string().min(2).max(240)).max(8),
  allowedOrigins: z.array(z.string().url()).max(10),
  calendlyEventTypeUri: z.string().max(255).optional().or(z.literal("")),
  crmWebhookUrl: z.string().url().optional().or(z.literal("")),
  handoffWebhookUrl: z.string().url().optional().or(z.literal(""))
});

export const CalendlyTestSchema = z.object({
  accessToken: z.string().min(8),
  eventTypeUri: z.string().min(8)
});

export const CrmWebhookTestSchema = z.object({
  webhookUrl: z.string().url(),
  secret: z.string().optional()
});

export const WordPressConnectSchema = z.object({
  origin: z.string().url(),
  returnUrl: z.string().url(),
  pluginVersion: z.string().max(40).optional(),
});

export const WordPressExchangeSchema = z.object({
  code: z.string().min(8).max(255),
  origin: z.string().url(),
  pluginVersion: z.string().max(40).optional(),
});

export const WordPressHeartbeatSchema = z.object({
  installKey: z.string().min(8).max(96),
  managementToken: z.string().min(8).max(255),
  pluginVersion: z.string().max(40).optional(),
});

export const WordPressDisconnectSchema = z.object({
  installKey: z.string().min(8).max(96),
  managementToken: z.string().min(8).max(255),
});

export function validateOrThrow<T>(schema: z.ZodSchema<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw parsed.error;
  }
  return parsed.data;
}

export function validationErrorResponse(
  request: Request,
  error: z.ZodError,
  allowOrigin = false,
) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");

  for (const [key, value] of Object.entries(
    getCorsHeaders(request.headers.get("origin"), allowOrigin),
  )) {
    headers.set(key, value);
  }

  return new Response(
    JSON.stringify({
      error: error.issues[0]?.message || "Invalid request",
      code: "VALIDATION_ERROR",
      issues: error.issues
    }),
    {
      status: 400,
      headers
    }
  );
}
