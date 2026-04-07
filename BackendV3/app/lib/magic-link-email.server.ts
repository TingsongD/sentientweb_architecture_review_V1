import { DependencyUnavailableError } from "./errors.server";
import { logger } from "~/utils";

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_MAGIC_LINK_BASE_URL = "http://localhost:3000";
const MAGIC_LINK_DELIVERY_TEMPORARILY_UNAVAILABLE_MESSAGE =
  "Magic-link email delivery is temporarily unavailable.";

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

function isLocalMagicLinkHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

function getConfiguredMagicLinkBaseUrl() {
  return process.env.MAGIC_LINK_BASE_URL?.trim() || process.env.APP_URL?.trim() || null;
}

export function resolveMagicLinkBaseUrl() {
  const configuredBaseUrl = getConfiguredMagicLinkBaseUrl();

  if (!configuredBaseUrl) {
    if (!isProduction()) {
      return new URL(DEFAULT_MAGIC_LINK_BASE_URL);
    }

    throw new DependencyUnavailableError(
      "Magic-link email delivery is not configured.",
      "magic_link_base_url",
    );
  }

  let url: URL;
  try {
    url = new URL(configuredBaseUrl);
  } catch {
    throw new DependencyUnavailableError(
      "Magic-link base URL is invalid.",
      "magic_link_base_url",
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DependencyUnavailableError(
      "Magic-link base URL is invalid.",
      "magic_link_base_url",
    );
  }

  if (isProduction() && isLocalMagicLinkHostname(url.hostname)) {
    throw new DependencyUnavailableError(
      "Magic-link base URL is invalid.",
      "magic_link_base_url",
    );
  }

  return url;
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
  resolveMagicLinkBaseUrl();
}

export function getMagicLinkDeliveryReadiness() {
  if (!isProduction()) {
    return {
      ok: true,
      mode: "preview" as const,
    };
  }

  try {
    assertMagicLinkEmailDeliveryConfigured();
    return {
      ok: true,
      mode: "email" as const,
    };
  } catch {
    return {
      ok: false,
      mode: "email" as const,
      error: "unavailable" as const,
    };
  }
}

export async function sendAdminMagicLinkEmail(
  input: AdminMagicLinkEmailInput,
) {
  assertMagicLinkEmailDeliveryConfigured();
  const tenantLabel = input.tenantName || "SentientWeb";
  const safeTenantLabel = escapeHtml(tenantLabel);

  let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
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
          `<p><a href="${escapeHtml(input.magicUrl)}">Sign in to the operator dashboard</a></p>` +
          "<p>This link expires in 30 minutes.</p>",
      }),
    });
  } catch (error) {
    logger.error("Resend magic-link email request failed", error);
    throw new DependencyUnavailableError(
      MAGIC_LINK_DELIVERY_TEMPORARILY_UNAVAILABLE_MESSAGE,
      "resend",
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.error("Resend magic-link email request failed", undefined, {
      status: response.status,
      bodySnippet: body.slice(0, 300) || null,
    });
    throw new DependencyUnavailableError(
      MAGIC_LINK_DELIVERY_TEMPORARILY_UNAVAILABLE_MESSAGE,
      "resend",
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | { id?: unknown }
    | null;
  return typeof payload?.id === "string" ? payload.id : null;
}
