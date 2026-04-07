import type { BehaviorEvent, Conversation, Lead, Tenant } from "@prisma/client";
import type { IcpFit } from "./qualification.server";

export interface KnowledgeSearchResult {
  chunkId: string;
  title: string | null;
  content: string;
  sourceUrl: string | null;
  score: number;
}

export interface KnowledgeSearchUnavailableResult {
  ok: false;
  code: "DEPENDENCY_UNAVAILABLE";
  message: string;
}

export interface QualificationInput {
  conversationId: string;
  leadId?: string;
  email?: string;
  name?: string;
  company?: string;
  companyDomain?: string;
  role?: string;
  authorityConfirmed?: boolean;
  useCase?: string;
  icpFit?: IcpFit | string;
  timeline?: string;
  notes?: string;
  qualificationStatus?: string;
}

export interface AvailabilityInput {
  startDate: string;
  endDate: string;
}

export interface BookingInput {
  conversationId: string;
  leadId?: string;
  name: string;
  email: string;
  startTime: string;
  notes?: string;
}

export interface CrmContactInput {
  leadId?: string;
  conversationId?: string;
  email?: string;
  name?: string;
  company?: string;
  companyDomain?: string;
  role?: string;
  notes?: string;
}

export interface HandoffInput {
  conversationId: string;
  reason: string;
  summary: string;
}

export interface B2BAdapterContext {
  tenant: Tenant;
  conversation: Conversation;
  lead: Lead | null;
}

export interface PlatformAdapter {
  readonly name: string;
  searchKnowledgeBase(
    query: string,
    topK?: number,
  ): Promise<KnowledgeSearchResult[] | KnowledgeSearchUnavailableResult>;
  qualifyLead(input: QualificationInput): Promise<{
    lead: Lead;
    qualificationScore: number;
    bookingEligible: boolean;
    missingFields: string[];
  }>;
  checkCalendarAvailability(input: AvailabilityInput): Promise<unknown>;
  bookDemo(input: BookingInput): Promise<unknown>;
  createCrmContact(input: CrmContactInput & { toolExecutionId?: string }): Promise<unknown>;
  routeToHuman(input: HandoffInput): Promise<unknown>;
  getVisitorContext(sessionId: string): Promise<BehaviorEvent[]>;
}
