import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import type {
  BookingInput,
  CrmContactInput,
  HandoffInput,
  PlatformAdapter,
  QualificationInput,
} from "./adapter.types";
import {
  createCalendlyBooking,
  getCalendlyAvailability,
} from "./calendly.server";
import { DependencyUnavailableError } from "./errors.server";
import {
  buildKnowledgeContext,
  searchKnowledge,
} from "./knowledge-base.server";
import { enqueueCrmSyncEvent } from "./crm-sync.server";
import { decryptSecret } from "./crypto.server";
import { computeQualificationState } from "./qualification.server";
import { withTenantDb } from "./tenant-db.server";
import { routeToHumanWebhook } from "./webhook-crm.server";
import { logger } from "~/utils";

function toPrismaJson(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toWebhookPayload(value: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function getResultUri(result: Record<string, unknown>) {
  const resource = result.resource;
  if (!resource || typeof resource !== "object") {
    return null;
  }

  const uri = (resource as { uri?: unknown }).uri;
  return typeof uri === "string" ? uri : null;
}

function normalizeEmail(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

export function createB2BWebsiteAdapter(input: {
  tenant: {
    id: string;
    name: string;
    calendlyAccessTokenEncrypted: string | null;
    calendlyEventTypeUri: string | null;
    crmWebhookUrl: string | null;
    crmWebhookSecretEncrypted: string | null;
    handoffWebhookUrl: string | null;
    handoffWebhookSecretEncrypted: string | null;
  };
  conversationId: string;
}): PlatformAdapter {
  return {
    name: "b2b-website",
    async searchKnowledgeBase(query, topK = 5) {
      try {
        return await searchKnowledge(input.tenant.id, query, topK);
      } catch (error) {
        if (error instanceof DependencyUnavailableError) {
          return {
            ok: false,
            code: error.code,
            message: "Knowledge base search is temporarily unavailable.",
          };
        }
        throw error;
      }
    },
    async qualifyLead(payload: QualificationInput) {
      return withTenantDb(input.tenant.id, async (tx) => {
        const normalizedEmail = normalizeEmail(payload.email);
        const existingByLeadId = payload.leadId
          ? await tx.lead.findFirst({
              where: {
                id: payload.leadId,
                tenantId: input.tenant.id,
              },
            })
          : null;
        const existingByEmail = normalizedEmail
          ? await tx.lead.findUnique({
              where: {
                tenantId_email: {
                  tenantId: input.tenant.id,
                  email: normalizedEmail,
                },
              },
            })
          : null;
        const leadConflict =
          existingByEmail !== null &&
          existingByLeadId !== null &&
          existingByEmail.id !== existingByLeadId.id;

        if (leadConflict) {
          logger.warn("qualify_lead: email matches a different lead than conversationLeadId; using email lead", {
            tenantId: input.tenant.id,
            conversationId: payload.conversationId,
            conversationLeadId: existingByLeadId?.id,
            emailLeadId: existingByEmail?.id,
          });
        }

        const existing = leadConflict
          ? existingByEmail
          : (existingByLeadId ?? existingByEmail);

        const qualification = computeQualificationState({
          email: normalizedEmail ?? existing?.email,
          companyDomain: payload.companyDomain ?? existing?.companyDomain,
          useCase: payload.useCase ?? existing?.useCase,
          role: payload.role ?? existing?.role,
          authorityConfirmed:
            payload.authorityConfirmed ?? existing?.authorityConfirmed,
          icpFit: payload.icpFit ?? existing?.icpFit,
        });

        const data = {
          email: normalizedEmail ?? existing?.email ?? null,
          name: payload.name ?? existing?.name ?? null,
          company: payload.company ?? existing?.company ?? null,
          companyDomain: qualification.companyDomain,
          role: payload.role ?? existing?.role ?? null,
          authorityConfirmed: qualification.authorityConfirmed,
          useCase: payload.useCase ?? existing?.useCase ?? null,
          timeline: payload.timeline ?? existing?.timeline ?? null,
          icpFit: qualification.icpFit,
          qualificationStatus:
            payload.qualificationStatus ??
            existing?.qualificationStatus ??
            "unqualified",
          qualificationScore: qualification.qualificationScore,
          bookingEligible: qualification.bookingEligible,
          notes:
            payload.notes !== undefined
              ? toPrismaJson({
                  latestNotes: payload.notes,
                  missingFields: qualification.missingFields,
                })
              : toPrismaJson({
                  ...((existing?.notes as Prisma.JsonObject | null) ?? {}),
                  missingFields: qualification.missingFields,
                }),
        };

        const lead =
          existing?.id != null
            ? await tx.lead.update({
                where: { id: existing.id },
                data,
              })
            : normalizedEmail
              ? await tx.lead.upsert({
                  where: {
                    tenantId_email: {
                      tenantId: input.tenant.id,
                      email: normalizedEmail,
                    },
                  },
                  update: data,
                  create: {
                    tenantId: input.tenant.id,
                    ...data,
                  },
                })
              : await tx.lead.create({
                  data: {
                    tenantId: input.tenant.id,
                    ...data,
                  },
                });

        await tx.conversation.update({
          where: { id: payload.conversationId },
          data: {
            leadId: lead.id,
            visitorEmail: lead.email ?? undefined,
            visitorName: lead.name ?? undefined,
            qualification: {
              companyDomain: lead.companyDomain,
              company: lead.company,
              role: lead.role,
              authorityConfirmed: lead.authorityConfirmed,
              useCase: lead.useCase,
              icpFit: lead.icpFit,
              timeline: lead.timeline,
              status: lead.qualificationStatus,
              qualificationScore: lead.qualificationScore,
              bookingEligible: lead.bookingEligible,
              missingFields: qualification.missingFields,
            },
          },
        });

        return {
          lead,
          qualificationScore: lead.qualificationScore,
          bookingEligible: lead.bookingEligible,
          missingFields: qualification.missingFields,
        };
      });
    },
    async checkCalendarAvailability(inputData) {
      if (
        !input.tenant.calendlyAccessTokenEncrypted ||
        !input.tenant.calendlyEventTypeUri
      ) {
        return {
          ok: false,
          message: "Calendly not configured for this tenant.",
        };
      }

      return getCalendlyAvailability({
        accessToken: decryptSecret(input.tenant.calendlyAccessTokenEncrypted),
        eventTypeUri: input.tenant.calendlyEventTypeUri,
        startDate: inputData.startDate,
        endDate: inputData.endDate,
      });
    },
    async bookDemo(payload: BookingInput) {
      if (
        !input.tenant.calendlyAccessTokenEncrypted ||
        !input.tenant.calendlyEventTypeUri
      ) {
        return {
          ok: false,
          message: "Calendly not configured for this tenant.",
        };
      }

      const externalRequestKey = crypto.randomUUID();
      const booking = await withTenantDb(input.tenant.id, (db) =>
        db.demoBooking.create({
          data: {
            tenantId: input.tenant.id,
            conversationId: payload.conversationId,
            leadId: payload.leadId ?? null,
            calendlyEventUri: input.tenant.calendlyEventTypeUri,
            startTime: new Date(payload.startTime),
            status: "booking_requested",
            externalRequestKey,
            payload: toPrismaJson({
              request: {
                name: payload.name,
                email: payload.email,
                startTime: payload.startTime,
                notes: payload.notes ?? null,
              },
            }),
          },
        }),
      );

      try {
        const result = await createCalendlyBooking({
          accessToken: decryptSecret(input.tenant.calendlyAccessTokenEncrypted),
          eventTypeUri: input.tenant.calendlyEventTypeUri,
          name: payload.name,
          email: payload.email,
          startTime: payload.startTime,
          notes: payload.notes,
        });
        const resultUri = getResultUri(result);

        const updatedBooking = await withTenantDb(input.tenant.id, (db) =>
          db.demoBooking.update({
            where: { id: booking.id },
            data: {
              calendlyInviteeUri: resultUri,
              status: "booked",
              errorMessage: null,
              payload: toPrismaJson(result),
            },
          }),
        );

        return {
          ok: true,
          bookingId: updatedBooking.id,
          localStatus: updatedBooking.status,
          calendly: result,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown booking error";

        try {
          await withTenantDb(input.tenant.id, (db) =>
            db.demoBooking.update({
              where: { id: booking.id },
              data: {
                status: "booking_failed",
                errorMessage: message,
              },
            }),
          );
        } catch (updateError) {
          logger.error(
            "Demo booking failure state could not be persisted",
            updateError,
            {
              bookingId: booking.id,
              externalRequestKey,
            },
          );
        }

        throw error;
      }
    },
    async createCrmContact(
      payload: CrmContactInput & { toolExecutionId?: string },
    ) {
      if (!input.tenant.crmWebhookUrl) {
        return {
          ok: false,
          message: "CRM webhook not configured for this tenant.",
        };
      }

      const crmSyncEvent = await enqueueCrmSyncEvent({
        tenantId: input.tenant.id,
        conversationId: payload.conversationId ?? input.conversationId,
        leadId: payload.leadId ?? null,
        webhookUrl: input.tenant.crmWebhookUrl,
        payload: toWebhookPayload(payload),
        toolExecutionId: payload.toolExecutionId ?? null,
      });

      return {
        ok: true,
        status: "queued",
        crmSyncEventId: crmSyncEvent.id,
      };
    },
    async routeToHuman(payload: HandoffInput) {
      if (!input.tenant.handoffWebhookUrl) {
        return {
          ok: false,
          message: "Handoff webhook not configured for this tenant.",
        };
      }

      return routeToHumanWebhook({
        webhookUrl: input.tenant.handoffWebhookUrl,
        secret: input.tenant.handoffWebhookSecretEncrypted
          ? decryptSecret(input.tenant.handoffWebhookSecretEncrypted)
          : null,
        payload: toWebhookPayload(payload),
      });
    },
    async getVisitorContext(sessionId: string) {
      return withTenantDb(input.tenant.id, (db) =>
        db.behaviorEvent.findMany({
          where: { tenantId: input.tenant.id, sessionId },
          orderBy: { occurredAt: "desc" },
          take: 20,
        }),
      );
    },
  };
}

export async function getKnowledgeSummaryForQuestion(
  tenantId: string,
  query: string,
) {
  return buildKnowledgeContext(tenantId, query);
}
