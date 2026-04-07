import { redirect } from "react-router";
import type { Prisma } from "@prisma/client";
import prisma from "~/db.server";
import { clearSessionCookie, createSessionCookie, getSessionCookie } from "./cookies.server";
import {
  createLogHash,
  generateToken,
  hashToken,
  signAdminSession,
  verifyAdminSession,
} from "./crypto.server";
import {
  assertMagicLinkEmailDeliveryConfigured,
  resolveMagicLinkBaseUrl,
  sendAdminMagicLinkEmail,
} from "./magic-link-email.server";
import { DependencyUnavailableError } from "./errors.server";
import { logger } from "~/utils";

type TxClient = Prisma.TransactionClient;

export interface AuthAuditContext {
  ip?: string;
  userAgent?: string;
}

function buildAuthAuditContext(audit?: AuthAuditContext) {
  return {
    ip: audit?.ip ?? "unknown",
    userAgent: audit?.userAgent ?? "unknown",
  };
}

export function sanitizeRedirectTo(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function buildLoginRedirect(request: Request) {
  const url = new URL(request.url);
  const redirectTo = sanitizeRedirectTo(`${url.pathname}${url.search}`);
  const loginUrl = new URL("/admin/login", url);
  if (redirectTo) {
    loginUrl.searchParams.set("redirectTo", redirectTo);
  }

  return redirect(loginUrl.pathname + loginUrl.search, {
    headers: {
      "Set-Cookie": clearSessionCookie(),
    },
  });
}

function normalizeAdminEmail(email: string) {
  return email.toLowerCase().trim();
}

function getEmailHash(email: string) {
  return createLogHash(email);
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export interface IssuedMagicLink {
  tokenId: string;
  email: string;
  tenantId: string;
  tenantName?: string | null;
  url: string;
  preview: string | null;
}

function buildMagicLinkUrl(rawToken: string, redirectTo?: string | null) {
  const url = new URL("/admin/auth/magic", resolveMagicLinkBaseUrl());
  url.searchParams.set("token", rawToken);

  const safeRedirectTo = sanitizeRedirectTo(redirectTo);
  if (safeRedirectTo) {
    url.searchParams.set("redirectTo", safeRedirectTo);
  }

  return url;
}

async function issueMagicLinkToken(
  tx: TxClient,
  input: {
    adminId: string;
    tenantId: string;
    email: string;
    tenantName?: string | null;
    redirectTo?: string | null;
  },
): Promise<IssuedMagicLink> {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
  const token = await tx.tenantAdminLoginToken.create({
    data: {
      tenantId: input.tenantId,
      adminId: input.adminId,
      email: input.email,
      tokenHash,
      expiresAt,
    },
  });

  const url = buildMagicLinkUrl(rawToken, input.redirectTo);
  return {
    tokenId: token.id,
    email: input.email,
    tenantId: input.tenantId,
    tenantName: input.tenantName,
    url: url.toString(),
    preview: isProduction() ? null : url.toString(),
  };
}

export async function createMagicLink(
  email: string,
  redirectTo?: string | null,
  audit?: AuthAuditContext,
) {
  const normalizedEmail = normalizeAdminEmail(email);
  const auditContext = buildAuthAuditContext(audit);
  const emailHash = getEmailHash(normalizedEmail);
  const admins = await prisma.tenantAdmin.findMany({
    where: { email: normalizedEmail },
    include: { tenant: true },
    take: 2,
  });

  if (admins.length === 0) {
    return null;
  }

  if (admins.length > 1) {
    logger.warn("Duplicate tenant admin email prevents magic link issuance", {
      emailHash,
      adminCount: admins.length,
      ...auditContext,
    });
    return null;
  }

  const admin = admins[0];

  if (isProduction()) {
    try {
      assertMagicLinkEmailDeliveryConfigured();
    } catch (error) {
      if (error instanceof DependencyUnavailableError) {
        logger.warn("Magic link request could not be delivered", {
          tenantId: admin.tenantId,
          emailHash,
          dependency: error.dependency ?? "unknown",
          reason: "delivery_not_ready",
          ...auditContext,
        });
        return null;
      }
      throw error;
    }
  }

  // Invalidate existing active tokens and insert the new one inside a single
  // transaction. With the partial unique index on (tenantId, email) WHERE
  // usedAt IS NULL (see migration 20260407140000_active_token_unique), the DB
  // enforces that only one active token can exist per admin — two concurrent
  // requests cannot both commit a new token.
  const magicLink = await prisma.$transaction(async (tx) => {
    await tx.tenantAdminLoginToken.updateMany({
      where: {
        tenantId: admin.tenantId,
        email: normalizedEmail,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });
    return issueMagicLinkToken(tx, {
      adminId: admin.id,
      tenantId: admin.tenantId,
      email: normalizedEmail,
      tenantName: admin.tenant.name,
      redirectTo,
    });
  });

  if (isProduction()) {
    try {
      await deliverMagicLink(magicLink);
    } catch (error) {
      if (error instanceof DependencyUnavailableError) {
        logger.warn("Magic link request could not be delivered", {
          tenantId: admin.tenantId,
          emailHash,
          dependency: error.dependency ?? "unknown",
          reason: "delivery_failed",
          ...auditContext,
        });
        return null;
      }
      throw error;
    }
  }

  logger.info("Magic link generated", {
    tenantId: admin.tenantId,
    emailHash,
    ...auditContext,
  });

  return magicLink;
}

/**
 * Creates a magic link token inside an existing Prisma transaction.
 * Used during bootstrap so the tenant, admin, and login token are all
 * created atomically — no orphaned tenant if token creation fails.
 *
 * Returns the issued token metadata so callers can either show the preview
 * in non-production or deliver the link via email after the transaction
 * commits in production.
 */
export async function createMagicLinkInTransaction(
  tx: TxClient,
  input: {
    adminId: string;
    tenantId: string;
    email: string;
    tenantName?: string | null;
    audit?: AuthAuditContext;
  },
) {
  const auditContext = buildAuthAuditContext(input.audit);
  const magicLink = await issueMagicLinkToken(tx, {
    adminId: input.adminId,
    tenantId: input.tenantId,
    email: input.email,
    tenantName: input.tenantName,
  });

  logger.info("Bootstrap magic link generated", {
    tenantId: input.tenantId,
    emailHash: getEmailHash(input.email),
    ...auditContext,
  });

  return magicLink;
}

export async function revokeMagicLinkToken(tokenId: string) {
  const revokedAt = new Date();
  const result = await prisma.tenantAdminLoginToken.updateMany({
    where: {
      id: tokenId,
      usedAt: null,
    },
    data: { usedAt: revokedAt },
  });

  return result.count === 1;
}

export async function deliverMagicLink(magicLink: IssuedMagicLink) {
  if (!isProduction()) return;

  try {
    await sendAdminMagicLinkEmail({
      toEmail: magicLink.email,
      magicUrl: magicLink.url,
      tenantName: magicLink.tenantName,
    });
  } catch (error) {
    logger.error("Magic link email delivery failed", error, {
      tenantId: magicLink.tenantId,
      emailHash: getEmailHash(magicLink.email),
    });

    try {
      await revokeMagicLinkToken(magicLink.tokenId);
    } catch (revokeError) {
      logger.error(
        "Failed to revoke magic link token after email delivery failure",
        revokeError,
        {
          tenantId: magicLink.tenantId,
          emailHash: getEmailHash(magicLink.email),
        },
      );
    }

    throw error;
  }
}

export async function consumeMagicLink(
  rawToken: string,
  audit?: AuthAuditContext,
) {
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const auditContext = buildAuthAuditContext(audit);

  return prisma.$transaction(async (tx) => {
    const token = await tx.tenantAdminLoginToken.findUnique({
      where: { tokenHash },
      include: { admin: true, tenant: true }
    });

    if (!token || token.usedAt || token.expiresAt.getTime() < now.getTime() || !token.admin) {
      logger.warn("Magic link consumption rejected", {
        reason: !token
          ? "not_found"
          : token.usedAt
            ? "already_used"
            : token.expiresAt.getTime() < now.getTime()
              ? "expired"
              : "missing_admin",
        ...auditContext,
      });
      return null;
    }

    const claimed = await tx.tenantAdminLoginToken.updateMany({
      where: {
        id: token.id,
        usedAt: null,
        expiresAt: { gt: now }
      },
      data: { usedAt: now }
    });

    if (claimed.count !== 1) {
      logger.warn("Magic link consumption rejected", {
        reason: "claim_conflict",
        tenantId: token.tenantId,
        adminId: token.admin.id,
        emailHash: getEmailHash(token.email),
        ...auditContext,
      });
      return null;
    }

    const session = signAdminSession({
      tenantId: token.tenantId,
      adminId: token.admin.id,
      email: token.email,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14
    });

    logger.info("Magic link consumed", {
      tenantId: token.tenantId,
      adminId: token.admin.id,
      emailHash: getEmailHash(token.email),
      ...auditContext,
    });

    return {
      tenantId: token.tenantId,
      adminId: token.admin.id,
      email: token.email,
      session
    };
  });
}

export async function requireAdminSession(request: Request) {
  const sessionToken = getSessionCookie(request);
  const session = verifyAdminSession(sessionToken);

  if (!session) {
    throw buildLoginRedirect(request);
  }

  const admin = await prisma.tenantAdmin.findUnique({
    where: { id: session.adminId },
    include: { tenant: true }
  });

  if (!admin || admin.tenantId !== session.tenantId) {
    throw buildLoginRedirect(request);
  }

  return { admin, tenant: admin.tenant };
}

export function buildSessionHeaders(session: string) {
  return {
    "Set-Cookie": createSessionCookie(session)
  };
}
