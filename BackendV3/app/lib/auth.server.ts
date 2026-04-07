import { redirect } from "react-router";
import prisma from "~/db.server";
import { clearSessionCookie, createSessionCookie, getSessionCookie } from "./cookies.server";
import { generateToken, hashToken, signAdminSession, verifyAdminSession } from "./crypto.server";
import { logger } from "~/utils";

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

export async function createMagicLink(email: string, redirectTo?: string | null) {
  const normalizedEmail = email.toLowerCase().trim();
  const admin = await prisma.tenantAdmin.findFirst({
    where: { email: normalizedEmail },
    include: { tenant: true }
  });

  if (!admin) {
    throw new Error("Admin not found");
  }

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
    email: normalizedEmail,
    expiresAt: expiresAt.toISOString(),
  });

  return {
    email: normalizedEmail,
    tenantId: admin.tenantId,
    url: url.toString(),
    preview: process.env.NODE_ENV !== "production" ? url.toString() : null
  };
}

export async function consumeMagicLink(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const token = await tx.tenantAdminLoginToken.findUnique({
      where: { tokenHash },
      include: { admin: true, tenant: true }
    });

    if (!token || token.usedAt || token.expiresAt.getTime() < now.getTime() || !token.admin) {
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
      return null;
    }

    const session = signAdminSession({
      tenantId: token.tenantId,
      adminId: token.admin.id,
      email: token.email,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14
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
