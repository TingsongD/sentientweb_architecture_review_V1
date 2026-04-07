import { logger } from "~/utils";
import { fetchWithTimeout } from "./outbound-url.server";

const CALENDLY_API = "https://api.calendly.com";
const CALENDLY_TIMEOUT_MS = 15_000;

async function calendlyFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithTimeout(`${CALENDLY_API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {})
    }
  }, {
    timeoutMs: CALENDLY_TIMEOUT_MS,
    purpose: "Calendly request"
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("Calendly API error", { path, status: response.status, errorText });
    throw new Error(`Calendly request failed (${response.status}): ${errorText}`);
  }

  return (await response.json()) as T;
}

export async function testCalendlyConfig(accessToken: string, eventTypeUri: string) {
  const eventTypes = await calendlyFetch<{ collection?: Array<{ uri: string; name: string }> }>(
    accessToken,
    "/event_types"
  );
  const match = eventTypes.collection?.find((item) => item.uri === eventTypeUri) ?? null;
  return {
    ok: !!match,
    eventType: match
  };
}

export async function listCalendlyEventTypes(accessToken: string) {
  const result = await calendlyFetch<{ collection?: Array<{ uri: string; name: string }> }>(
    accessToken,
    "/event_types"
  );
  return result.collection ?? [];
}

export async function getCalendlyAvailability(input: {
  accessToken: string;
  eventTypeUri: string;
  startDate: string;
  endDate: string;
}) {
  const params = new URLSearchParams({
    event_type: input.eventTypeUri,
    start_time: input.startDate,
    end_time: input.endDate
  });

  const result = await calendlyFetch<{ collection?: Array<{ start_time: string; end_time: string }> }>(
    input.accessToken,
    `/event_type_available_times?${params.toString()}`
  );

  return result.collection ?? [];
}

export async function createCalendlyBooking(input: {
  accessToken: string;
  eventTypeUri: string;
  name: string;
  email: string;
  startTime: string;
  notes?: string;
}) {
  const uuid = input.eventTypeUri.split("/").pop();
  if (!uuid) throw new Error("Invalid Calendly event type URI");

  const payload = {
    event_type: input.eventTypeUri,
    start_time: input.startTime,
    invitee: {
      email: input.email,
      name: input.name,
      timezone: "UTC"
    },
    questions_and_answers: input.notes
      ? [
          {
            question: "Sentient summary",
            answer: input.notes
          }
        ]
      : []
  };

  logger.info("Creating Calendly booking", { eventTypeUuid: uuid, email: input.email });

  return calendlyFetch<Record<string, unknown>>(
    input.accessToken,
    `/scheduled_events/${uuid}/invitees`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
}
