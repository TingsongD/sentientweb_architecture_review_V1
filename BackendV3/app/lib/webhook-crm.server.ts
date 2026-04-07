import crypto from "node:crypto";
import { safeFetch } from "./outbound-url.server";
import { logger } from "~/utils";

function buildSignature(body: string, secret?: string | null) {
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function fingerprintWebhookUrl(url: string) {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 12);
}

async function postWebhook(url: string, payload: Record<string, unknown>, secret?: string | null) {
  const body = JSON.stringify(payload);
  const signature = buildSignature(body, secret);

  const response = await safeFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signature ? { "X-Sentient-Signature": signature } : {})
    },
    body
  }, {
    timeoutMs: 10_000,
    purpose: "Webhook request"
  });

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} ${await response.text()}`);
  }

  return {
    ok: true,
    status: response.status
  };
}

export async function pushCrmContactWebhook(input: {
  webhookUrl: string;
  secret?: string | null;
  tenantName: string;
  payload: Record<string, unknown>;
}) {
  logger.info("Posting CRM webhook", {
    eventType: "crm.contact.upsert",
    tenantName: input.tenantName,
    webhookUrlFingerprint: fingerprintWebhookUrl(input.webhookUrl),
  });
  return postWebhook(input.webhookUrl, { type: "crm.contact.upsert", tenantName: input.tenantName, ...input.payload }, input.secret);
}

export async function routeToHumanWebhook(input: {
  webhookUrl: string;
  secret?: string | null;
  payload: Record<string, unknown>;
}) {
  logger.info("Posting handoff webhook", {
    eventType: "handoff.requested",
    webhookUrlFingerprint: fingerprintWebhookUrl(input.webhookUrl),
  });
  return postWebhook(input.webhookUrl, { type: "handoff.requested", ...input.payload }, input.secret);
}

export async function testGenericWebhook(input: { webhookUrl: string; secret?: string | null }) {
  return postWebhook(
    input.webhookUrl,
    {
      type: "sentient.test",
      timestamp: new Date().toISOString(),
      message: "SentientWeb integration test"
    },
    input.secret
  );
}
