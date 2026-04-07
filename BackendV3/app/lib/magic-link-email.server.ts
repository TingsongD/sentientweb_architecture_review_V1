import { DependencyUnavailableError } from "./errors.server";

const RESEND_API_URL = "https://api.resend.com/emails";

export interface AdminMagicLinkEmailInput {
  toEmail: string;
  magicUrl: string;
  tenantName?: string | null;
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function getResendApiKey() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (apiKey) return apiKey;
  throw new DependencyUnavailableError(
    "Magic-link email delivery is not configured.",
    "resend",
  );
}

function getMagicLinkFromEmail() {
  const fromEmail = process.env.MAGIC_LINK_FROM_EMAIL?.trim();
  if (fromEmail) return fromEmail;
  throw new DependencyUnavailableError(
    "Magic-link email delivery is not configured.",
    "resend",
  );
}

function getMagicLinkFromName() {
  return process.env.MAGIC_LINK_FROM_NAME?.trim() || "SentientWeb";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function assertMagicLinkEmailDeliveryConfigured() {
  if (!isProduction()) return;

  getResendApiKey();
  getMagicLinkFromEmail();
}

export async function sendAdminMagicLinkEmail(
  input: AdminMagicLinkEmailInput,
) {
  assertMagicLinkEmailDeliveryConfigured();
  const tenantLabel = input.tenantName || "SentientWeb";
  const safeTenantLabel = escapeHtml(tenantLabel);

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getResendApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${getMagicLinkFromName()} <${getMagicLinkFromEmail()}>`,
      to: [input.toEmail],
      subject: `Your ${tenantLabel} sign-in link`,
      text:
        `Use this one-time sign-in link to access ${tenantLabel}.\n\n` +
        `${input.magicUrl}\n\n` +
        "This link expires in 30 minutes.",
      html:
        `<p>Use this one-time sign-in link to access <strong>${safeTenantLabel}</strong>.</p>` +
        `<p><a href="${input.magicUrl}">Sign in to the operator dashboard</a></p>` +
        "<p>This link expires in 30 minutes.</p>",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new DependencyUnavailableError(
      `Resend magic-link email request failed with status ${response.status}${
        body ? `: ${body.slice(0, 300)}` : ""
      }`,
      "resend",
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | { id?: unknown }
    | null;
  return typeof payload?.id === "string" ? payload.id : null;
}
