import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  transactionClientMock,
  createCalendlyBookingMock,
  getCalendlyAvailabilityMock,
  enqueueCrmSyncEventMock,
  decryptSecretMock,
  computeQualificationStateMock,
  routeToHumanWebhookMock,
  loggerMock,
} = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    demoBooking: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  transactionClientMock: {
    lead: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
    },
    conversation: {
      update: vi.fn(),
    },
    demoBooking: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  createCalendlyBookingMock: vi.fn(),
  getCalendlyAvailabilityMock: vi.fn(),
  enqueueCrmSyncEventMock: vi.fn(),
  decryptSecretMock: vi.fn((value: string) => value),
  computeQualificationStateMock: vi.fn(),
  routeToHumanWebhookMock: vi.fn(),
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("~/db.server", () => ({
  default: prismaMock,
}));

vi.mock("~/lib/calendly.server", () => ({
  createCalendlyBooking: createCalendlyBookingMock,
  getCalendlyAvailability: getCalendlyAvailabilityMock,
}));

vi.mock("~/lib/crm-sync.server", () => ({
  enqueueCrmSyncEvent: enqueueCrmSyncEventMock,
}));

vi.mock("~/lib/crypto.server", () => ({
  decryptSecret: decryptSecretMock,
}));

vi.mock("~/lib/qualification.server", () => ({
  computeQualificationState: computeQualificationStateMock,
}));

vi.mock("~/lib/webhook-crm.server", () => ({
  routeToHumanWebhook: routeToHumanWebhookMock,
}));

vi.mock("~/utils", () => ({
  logger: loggerMock,
}));

import { createB2BWebsiteAdapter } from "~/lib/b2b-adapter.server";

describe("createB2BWebsiteAdapter", () => {
  beforeEach(() => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback(transactionClientMock),
    );
  });

  afterEach(() => {
    prismaMock.$transaction.mockReset();
    prismaMock.demoBooking.create.mockReset();
    prismaMock.demoBooking.update.mockReset();
    transactionClientMock.lead.findFirst.mockReset();
    transactionClientMock.lead.findUnique.mockReset();
    transactionClientMock.lead.update.mockReset();
    transactionClientMock.lead.upsert.mockReset();
    transactionClientMock.lead.create.mockReset();
    transactionClientMock.conversation.update.mockReset();
    transactionClientMock.demoBooking.create.mockReset();
    transactionClientMock.demoBooking.update.mockReset();
    createCalendlyBookingMock.mockReset();
    getCalendlyAvailabilityMock.mockReset();
    enqueueCrmSyncEventMock.mockReset();
    decryptSecretMock.mockClear();
    computeQualificationStateMock.mockReset();
    routeToHumanWebhookMock.mockReset();
    loggerMock.info.mockReset();
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();
    loggerMock.debug.mockReset();
  });

  it("updates the existing lead by leadId inside a transaction", async () => {
    const existingLead = {
      id: "lead_1",
      tenantId: "tenant_1",
      email: "buyer@acme.com",
      name: "Buyer",
      company: "Acme",
      companyDomain: "acme.com",
      role: "VP Sales",
      authorityConfirmed: true,
      useCase: "Qualify inbound demos",
      timeline: null,
      icpFit: "match",
      qualificationStatus: "qualified",
      qualificationScore: 1,
      bookingEligible: true,
      notes: {},
    };

    transactionClientMock.lead.findFirst.mockResolvedValue(existingLead);
    transactionClientMock.lead.findUnique.mockResolvedValue(null);
    computeQualificationStateMock.mockReturnValue({
      companyDomain: "acme.com",
      useCase: "Qualify inbound demos",
      icpFit: "match",
      authorityConfirmed: true,
      qualificationScore: 1,
      bookingEligible: true,
      missingFields: [],
    });
    transactionClientMock.lead.update.mockResolvedValue(existingLead);
    transactionClientMock.conversation.update.mockResolvedValue({});

    const adapter = createB2BWebsiteAdapter({
      tenant: {
        id: "tenant_1",
        name: "Acme",
        calendlyAccessTokenEncrypted: null,
        calendlyEventTypeUri: null,
        crmWebhookUrl: null,
        crmWebhookSecretEncrypted: null,
        handoffWebhookUrl: null,
        handoffWebhookSecretEncrypted: null,
      },
      conversationId: "conversation_1",
    });

    const result = await adapter.qualifyLead({
      conversationId: "conversation_1",
      leadId: "lead_1",
      email: "Buyer@Acme.com",
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionClientMock.lead.findFirst).toHaveBeenCalledWith({
      where: {
        id: "lead_1",
        tenantId: "tenant_1",
      },
    });
    expect(transactionClientMock.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lead_1" },
      }),
    );
    expect(transactionClientMock.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "conversation_1" },
      }),
    );
    expect(result.lead.id).toBe("lead_1");
  });

  it("returns the local booking id and final status after a successful booking", async () => {
    transactionClientMock.demoBooking.create.mockResolvedValue({
      id: "booking_1",
    });
    createCalendlyBookingMock.mockResolvedValue({
      resource: { uri: "https://api.calendly.com/invitees/invitee_1" },
    });
    transactionClientMock.demoBooking.update.mockResolvedValue({
      id: "booking_1",
      status: "booked",
    });

    const adapter = createB2BWebsiteAdapter({
      tenant: {
        id: "tenant_1",
        name: "Acme",
        calendlyAccessTokenEncrypted: "enc_token",
        calendlyEventTypeUri: "https://api.calendly.com/event_types/test-event",
        crmWebhookUrl: null,
        crmWebhookSecretEncrypted: null,
        handoffWebhookUrl: null,
        handoffWebhookSecretEncrypted: null,
      },
      conversationId: "conversation_1",
    });

    const result = await adapter.bookDemo({
      conversationId: "conversation_1",
      leadId: "lead_1",
      name: "Buyer",
      email: "buyer@acme.com",
      startTime: "2026-04-03T17:00:00.000Z",
    });

    expect(transactionClientMock.demoBooking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "booking_requested",
          externalRequestKey: expect.any(String),
        }),
      }),
    );
    expect(result).toEqual({
      ok: true,
      bookingId: "booking_1",
      localStatus: "booked",
      calendly: {
        resource: { uri: "https://api.calendly.com/invitees/invitee_1" },
      },
    });
  });

  it("logs a warning and uses the email lead when leadId and email point to different leads", async () => {
    const leadById = {
      id: "lead_old",
      tenantId: "tenant_1",
      email: "old@acme.com",
      name: "Old Lead",
      company: "Acme",
      companyDomain: "acme.com",
      role: null,
      authorityConfirmed: false,
      useCase: null,
      timeline: null,
      icpFit: "unknown",
      qualificationStatus: "unqualified",
      qualificationScore: 0,
      bookingEligible: false,
      notes: {},
    };
    const leadByEmail = {
      ...leadById,
      id: "lead_email",
      email: "new@acme.com",
    };

    transactionClientMock.lead.findFirst.mockResolvedValue(leadById);
    transactionClientMock.lead.findUnique.mockResolvedValue(leadByEmail);
    computeQualificationStateMock.mockReturnValue({
      companyDomain: "acme.com",
      useCase: null,
      icpFit: "unknown",
      authorityConfirmed: false,
      qualificationScore: 0,
      bookingEligible: false,
      missingFields: ["email", "useCase", "icpMatch", "authority"],
    });
    transactionClientMock.lead.update.mockResolvedValue(leadByEmail);
    transactionClientMock.conversation.update.mockResolvedValue({});

    const adapter = createB2BWebsiteAdapter({
      tenant: {
        id: "tenant_1",
        name: "Acme",
        calendlyAccessTokenEncrypted: null,
        calendlyEventTypeUri: null,
        crmWebhookUrl: null,
        crmWebhookSecretEncrypted: null,
        handoffWebhookUrl: null,
        handoffWebhookSecretEncrypted: null,
      },
      conversationId: "conversation_1",
    });

    const result = await adapter.qualifyLead({
      conversationId: "conversation_1",
      leadId: "lead_old",
      email: "new@acme.com",
    });

    expect(result.lead.id).toBe("lead_email");
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("email matches a different lead"),
      expect.objectContaining({
        conversationLeadId: "lead_old",
        emailLeadId: "lead_email",
      }),
    );
  });

  it("persists a recoverable failed booking record when Calendly fails", async () => {
    transactionClientMock.demoBooking.create.mockResolvedValue({
      id: "booking_1",
    });
    createCalendlyBookingMock.mockRejectedValue(
      new Error("Calendly unavailable"),
    );
    transactionClientMock.demoBooking.update.mockResolvedValue({
      id: "booking_1",
      status: "booking_failed",
    });

    const adapter = createB2BWebsiteAdapter({
      tenant: {
        id: "tenant_1",
        name: "Acme",
        calendlyAccessTokenEncrypted: "enc_token",
        calendlyEventTypeUri: "https://api.calendly.com/event_types/test-event",
        crmWebhookUrl: null,
        crmWebhookSecretEncrypted: null,
        handoffWebhookUrl: null,
        handoffWebhookSecretEncrypted: null,
      },
      conversationId: "conversation_1",
    });

    await expect(
      adapter.bookDemo({
        conversationId: "conversation_1",
        leadId: "lead_1",
        name: "Buyer",
        email: "buyer@acme.com",
        startTime: "2026-04-03T17:00:00.000Z",
      }),
    ).rejects.toThrow("Calendly unavailable");

    expect(transactionClientMock.demoBooking.update).toHaveBeenCalledWith({
      where: { id: "booking_1" },
      data: {
        status: "booking_failed",
        errorMessage: "Calendly unavailable",
      },
    });
  });
});
