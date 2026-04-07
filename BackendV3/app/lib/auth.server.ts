import { redirect } from "react-router";
import prisma from "~/db.server";
import { clearSessionCookie, createSessionCookie, getSessionCookie } from "./cookies.server";
import {
  createLogHash,
  generateToken,
  hashToken,
  signAdminSession,
  verifyAdminSession,
} from "./crypto.server";
import { logger } from "~/utils";

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

export async function createMagicLink(
  email: string,
  redirectTo?: string | null,
  audit?: AuthAuditContext,
) {
  const normalizedEmail = normalizeAdminEmail(email);
  const auditContext = buildAuthAuditContext(audit);
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
      emailHash: getEmailHash(normalizedEmail),
      adminCount: admins.length,
      ...auditContext,
    });
    return null;
  }

  const admin = admins[0];

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

  await prisma.tenantAdminLoginToken.create({
    data: {
      tenantId: admin.tenantId,
      adminId: admin.id,
      email: normalizedEmail,
      tokenHash,
      expiresAt
    }
  });

  const baseUrl = process.env.MAGIC_LINK_BASE_URL || process.env.APP_URL || "http://localhost:3000";
  const url = new URL("/admin/auth/magic", baseUrl);
  url.searchParams.set("token", rawToken);

  const safeRedirectTo = sanitizeRedirectTo(redirectTo);
  if (safeRedirectTo) {
    url.searchParams.set("redirectTo", safeRedirectTo);
  }

  logger.info("Magic link generated", {
    tenantId: admin.tenantId,
    emailHash: getEmailHash(normalizedEmail),
    expiresAt: expiresAt.toISOString(),
    ...auditContext,
  });

  return {
    email: normalizedEmail,
    tenantId: admin.tenantId,
    url: url.toString(),
    preview: process.env.NODE_ENV !== "production" ? url.toString() : null
  };
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
