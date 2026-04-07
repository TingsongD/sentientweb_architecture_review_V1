import crypto from "node:crypto";
import {
  Prisma,
  type SiteInstall,
  type SiteInstallSession,
  type Tenant,
} from "@prisma/client";
import {
  createInstallLinkCode,
  createInstallManagementToken,
  createPublicInstallKey,
  hashToken,
  signVisitorSession,
  timingSafeEqualString,
  verifyVisitorSession,
} from "./crypto.server";
import { getCorsHeaders, normalizeOrigin } from "./origin.server";
import {
  InstallManagementAuthError,
  WordPressExchangeError,
} from "./errors.server";
import {
  type TenantDbClient,
  withPlatformDb,
  withTenantDb,
} from "./tenant-db.server";

const VISITOR_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const WORDPRESS_LINK_CODE_TTL_MS = 1000 * 60 * 10;
type DbClient = TenantDbClient;

function widgetError(
  status: number,
  body: Record<string, unknown>,
  origin: string | null = null,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(origin, true),
    },
  });
}

export function normalizeInstallOrigin(rawOrigin: string) {
  const normalized = normalizeOrigin(rawOrigin);
  let url: URL;

  try {
    url = new URL(normalized);
  } catch {
    throw new Error("Invalid install origin.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Install origins must use HTTP or HTTPS.");
  }

  if (url.username || url.password) {
    throw new Error("Install origins cannot include embedded credentials.");
  }

  return {
    origin: `${url.protocol}//${url.host}`,
    domain: url.hostname,
  };
}

function getTenantAllowedOrigins(
  tenant: Pick<Tenant, "allowedOrigins" | "domains">,
) {
  if (tenant.allowedOrigins.length > 0) {
    return tenant.allowedOrigins.map(
      (origin) => normalizeInstallOrigin(origin).origin,
    );
  }

  return tenant.domains.map((domain) => `https://${domain}`);
}

function mergeMetadata(current: unknown, next: Record<string, unknown>) {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};

  return toInputJsonObject({
    ...base,
    ...next,
  });
}

function toInputJsonValue(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null) return Prisma.JsonNull;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toInputJsonValue(item)) as Prisma.InputJsonArray;
  }

  if (typeof value === "object") {
    return toInputJsonObject(value as Record<string, unknown>);
  }

  return String(value);
}

function toInputJsonObject(
  value: Record<string, unknown>,
): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, toInputJsonValue(entry)]),
  ) as Prisma.InputJsonObject;
}

export async function ensureDefaultScriptInstall(
  input: {
    tenantId: string;
    primaryDomain: string;
    allowedOrigins: string[];
  },
  db?: DbClient,
) {
  const run = async (client: DbClient) => {
    const preferredOrigin =
      input.allowedOrigins[0] ?? `https://${input.primaryDomain}`;
    const { origin, domain } = normalizeInstallOrigin(preferredOrigin);

    const existing = await client.siteInstall.findUnique({
      where: {
        tenantId_origin_platform: {
          tenantId: input.tenantId,
          origin,
          platform: "script",
        },
      },
    });

    if (existing) return existing;

    return client.siteInstall.create({
      data: {
        tenantId: input.tenantId,
        platform: "script",
        label: `${domain} embed`,
        origin,
        domain,
        publicInstallKey: createPublicInstallKey(),
        status: "active",
        metadata: {
          createdBy: "bootstrap",
        },
      },
    });
  };

  if (db) {
    return run(db);
  }

  return withTenantDb(input.tenantId, run);
}

export async function provisionSiteInstall(
  input: {
    tenantId: string;
    origin: string;
    platform: "script" | "wordpress";
    label?: string;
    metadata?: Record<string, unknown>;
  },
  db?: DbClient,
) {
  const run = async (client: DbClient) => {
    const { origin, domain } = normalizeInstallOrigin(input.origin);
    const existing = await client.siteInstall.findUnique({
      where: {
        tenantId_origin_platform: {
          tenantId: input.tenantId,
          origin,
          platform: input.platform,
        },
      },
    });

    if (existing) {
      const data: Prisma.SiteInstallUpdateInput = {
        label: input.label ?? existing.label,
        domain,
        status: "active",
      };

      if (input.metadata) {
        data.metadata = mergeMetadata(existing.metadata, input.metadata);
      }

      return client.siteInstall.update({
        where: { id: existing.id },
        data,
      });
    }

    return client.siteInstall.create({
      data: {
        tenantId: input.tenantId,
        platform: input.platform,
        label: input.label ?? `${domain} ${input.platform}`,
        origin,
        domain,
        publicInstallKey: createPublicInstallKey(),
        status: "active",
        metadata: toInputJsonObject(input.metadata ?? {}),
      },
    });
  };

  if (db) {
    return run(db);
  }

  return withTenantDb(input.tenantId, run);
}

export async function resolveBootstrapInstall(input: {
  request: Request;
  installKey?: string;
  siteKey?: string;
}) {
  const originHeader = input.request.headers.get("origin");
  if (!originHeader) {
    throw widgetError(
      403,
      {
        error: "Widget bootstrap requires an Origin header.",
        code: "MISSING_ORIGIN",
      },
      originHeader,
    );
  }

  const { origin } = normalizeInstallOrigin(originHeader);

  if (input.installKey) {
    const siteInstall = await withPlatformDb((db) =>
      db.siteInstall.findUnique({
        where: { publicInstallKey: input.installKey },
        include: { tenant: true },
      }),
    );

    if (!siteInstall || siteInstall.status !== "active") {
      throw widgetError(
        401,
        {
          error: "Invalid install key.",
          code: "INVALID_INSTALL_KEY",
        },
        originHeader,
      );
    }

    if (siteInstall.origin !== origin) {
      throw widgetError(
        403,
        {
          error: "Origin not allowed for this install.",
          code: "ORIGIN_NOT_ALLOWED",
        },
        originHeader,
      );
    }

    return {
      origin,
      tenant: siteInstall.tenant,
      install: siteInstall,
    };
  }

  if (!input.siteKey) {
    throw widgetError(
      401,
      {
        error: "Missing install key.",
        code: "MISSING_INSTALL_KEY",
      },
      originHeader,
    );
  }

  const tenant = await withPlatformDb((db) =>
    db.tenant.findUnique({
      where: { publicSiteKey: input.siteKey },
    }),
  );

  if (!tenant) {
    throw widgetError(
      401,
      {
        error: "Invalid site key.",
        code: "INVALID_SITE_KEY",
      },
      originHeader,
    );
  }

  if (!getTenantAllowedOrigins(tenant).includes(origin)) {
    throw widgetError(
      403,
      {
        error: "Origin not allowed for this site key.",
        code: "ORIGIN_NOT_ALLOWED",
      },
      originHeader,
    );
  }

  const install = await withTenantDb(
    tenant.id,
    async (db) =>
      (await db.siteInstall.findUnique({
        where: {
          tenantId_origin_platform: {
            tenantId: tenant.id,
            origin,
            platform: "script",
          },
        },
      })) ??
      provisionSiteInstall(
        {
          tenantId: tenant.id,
          origin,
          platform: "script",
          label: `${tenant.name} embed`,
          metadata: { createdBy: "legacy-site-key-bootstrap" },
        },
        db,
      ),
  );

  return {
    origin,
    tenant,
    install,
  };
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  return request.headers.get("x-sentient-visitor-token");
}

export async function issueVisitorSession(
  input: {
    install: SiteInstall;
    tenantId: string;
    origin: string;
    visitorToken?: string;
    userAgent?: string | null;
  },
  db?: DbClient,
) {
  const run = async (client: DbClient) => {
    const now = Date.now();
    const expiresAt = new Date(now + VISITOR_SESSION_TTL_MS);
    const existingPayload = verifyVisitorSession(input.visitorToken ?? null);
    const existingTokenHash = input.visitorToken
      ? hashToken(input.visitorToken)
      : null;

    let existingSession: SiteInstallSession | null = null;
    if (
      existingPayload &&
      existingTokenHash &&
      existingPayload.installId === input.install.id &&
      existingPayload.tenantId === input.tenantId &&
      existingPayload.origin === input.origin
    ) {
      existingSession = await client.siteInstallSession.findFirst({
        where: {
          siteInstallId: input.install.id,
          tenantId: input.tenantId,
          sessionId: existingPayload.sessionId,
          tokenHash: existingTokenHash,
          status: "active",
          expiresAt: { gt: new Date(now) },
        },
      });
    }

    const sessionId = existingSession?.sessionId ?? crypto.randomUUID();
    const visitorToken = signVisitorSession({
      tenantId: input.tenantId,
      installId: input.install.id,
      sessionId,
      origin: input.origin,
      issuedAt: now,
      expiresAt: expiresAt.getTime(),
    });
    const nextTokenHash = hashToken(visitorToken);

    if (existingSession) {
      await client.siteInstallSession.update({
        where: { id: existingSession.id },
        data: {
          tokenHash: nextTokenHash,
          userAgent: input.userAgent ?? undefined,
          lastSeenAt: new Date(now),
          expiresAt,
          origin: input.origin,
        },
      });
    } else {
      await client.siteInstallSession.create({
        data: {
          tenantId: input.tenantId,
          siteInstallId: input.install.id,
          sessionId,
          origin: input.origin,
          tokenHash: nextTokenHash,
          userAgent: input.userAgent ?? null,
          lastSeenAt: new Date(now),
          expiresAt,
        },
      });
    }

    await client.siteInstall.update({
      where: { id: input.install.id },
      data: { lastSeenAt: new Date(now) },
    });

    return {
      sessionId,
      visitorToken,
      expiresAt: expiresAt.toISOString(),
    };
  };

  if (db) {
    return run(db);
  }

  return withTenantDb(input.tenantId, run);
}

export async function authenticateVisitorRequest(request: Request) {
  const originHeader = request.headers.get("origin");
  if (!originHeader) {
    throw widgetError(
      403,
      {
        error: "Widget requests require an Origin header.",
        code: "MISSING_ORIGIN",
      },
      originHeader,
    );
  }

  const { origin } = normalizeInstallOrigin(originHeader);
  const visitorToken = getBearerToken(request);
  if (!visitorToken) {
    throw widgetError(
      401,
      {
        error: "Missing visitor token.",
        code: "MISSING_VISITOR_TOKEN",
      },
      originHeader,
    );
  }

  const payload = verifyVisitorSession(visitorToken);
  if (!payload) {
    throw widgetError(
      401,
      {
        error: "Visitor token is invalid or expired.",
        code: "INVALID_VISITOR_TOKEN",
      },
      originHeader,
    );
  }

  if (payload.origin !== origin) {
    throw widgetError(
      403,
      {
        error: "Visitor token origin mismatch.",
        code: "VISITOR_ORIGIN_MISMATCH",
      },
      originHeader,
    );
  }

  return withTenantDb(payload.tenantId, async (db) => {
    const session = await db.siteInstallSession.findFirst({
      where: {
        tenantId: payload.tenantId,
        siteInstallId: payload.installId,
        sessionId: payload.sessionId,
        tokenHash: hashToken(visitorToken),
        status: "active",
        expiresAt: { gt: new Date() },
      },
      include: {
        tenant: true,
        siteInstall: true,
      },
    });

    if (!session || session.siteInstall.status !== "active") {
      throw widgetError(
        401,
        {
          error: "Visitor session could not be authenticated.",
          code: "UNKNOWN_VISITOR_SESSION",
        },
        originHeader,
      );
    }

    if (session.siteInstall.origin !== origin) {
      throw widgetError(
        403,
        {
          error: "Origin not allowed for this install.",
          code: "ORIGIN_NOT_ALLOWED",
        },
        originHeader,
      );
    }

    await Promise.all([
      db.siteInstallSession.update({
        where: { id: session.id },
        data: {
          lastSeenAt: new Date(),
          userAgent: request.headers.get("user-agent") ?? undefined,
        },
      }),
      db.siteInstall.update({
        where: { id: session.siteInstall.id },
        data: { lastSeenAt: new Date() },
      }),
    ]);

    return {
      origin,
      tenant: session.tenant,
      install: session.siteInstall,
      sessionId: session.sessionId,
      session,
    };
  });
}

export async function createWordPressInstallLinkCode(
  input: {
    tenantId: string;
    origin: string;
    returnUrl: string;
    pluginVersion?: string;
  },
  db?: DbClient,
) {
  const run = async (client: DbClient) => {
    const { origin } = normalizeInstallOrigin(input.origin);
    const parsedReturnUrl = new URL(input.returnUrl);
    if (normalizeInstallOrigin(parsedReturnUrl.origin).origin !== origin) {
      throw new Error("WordPress return URL must stay on the site origin.");
    }

    const install = await provisionSiteInstall(
      {
        tenantId: input.tenantId,
        origin,
        platform: "wordpress",
        label: `${normalizeInstallOrigin(origin).domain} WordPress`,
        metadata: input.pluginVersion
          ? { requestedPluginVersion: input.pluginVersion }
          : undefined,
      },
      client,
    );

    const rawCode = createInstallLinkCode();
    const expiresAt = new Date(Date.now() + WORDPRESS_LINK_CODE_TTL_MS);

    await client.siteInstallLinkCode.create({
      data: {
        tenantId: input.tenantId,
        siteInstallId: install.id,
        platform: "wordpress",
        origin,
        returnUrl: input.returnUrl,
        codeHash: hashToken(rawCode),
        metadata: input.pluginVersion
          ? { requestedPluginVersion: input.pluginVersion }
          : {},
        expiresAt,
      },
    });

    return {
      install,
      code: rawCode,
      expiresAt,
    };
  };

  if (db) {
    return run(db);
  }

  return withTenantDb(input.tenantId, run);
}

export async function exchangeWordPressInstallLinkCode(input: {
  code: string;
  origin: string;
  pluginVersion?: string;
}) {
  const { origin } = normalizeInstallOrigin(input.origin);
  const codeHash = hashToken(input.code);
  const linkCode = await withPlatformDb((db) =>
    db.siteInstallLinkCode.findUnique({
      where: { codeHash },
      include: { siteInstall: true },
    }),
  );

  if (
    !linkCode ||
    linkCode.status !== "pending" ||
    linkCode.usedAt ||
    linkCode.expiresAt.getTime() <= Date.now()
  ) {
    throw new WordPressExchangeError(
      "WordPress install code is invalid or expired.",
    );
  }

  if (linkCode.origin !== origin) {
    throw new WordPressExchangeError("WordPress install code origin mismatch.");
  }

  const managementToken = createInstallManagementToken();
  const now = new Date();

  return withTenantDb(linkCode.tenantId, async (db) => {
    const install =
      linkCode.siteInstall ??
      (await provisionSiteInstall(
        {
          tenantId: linkCode.tenantId,
          origin: linkCode.origin,
          platform: "wordpress",
          label: `${normalizeInstallOrigin(linkCode.origin).domain} WordPress`,
        },
        db,
      ));

    await Promise.all([
      db.siteInstall.update({
        where: { id: install.id },
        data: {
          status: "active",
          pluginVersion: input.pluginVersion ?? install.pluginVersion,
          managementTokenHash: hashToken(managementToken),
          lastSeenAt: now,
          metadata: mergeMetadata(install.metadata, {
            lastExchangeAt: now.toISOString(),
            pluginVersion: input.pluginVersion ?? install.pluginVersion ?? null,
          }),
        },
      }),
      db.siteInstallLinkCode.update({
        where: { id: linkCode.id },
        data: {
          status: "used",
          usedAt: now,
          updatedAt: now,
        },
      }),
    ]);

    return {
      install: {
        ...install,
        pluginVersion: input.pluginVersion ?? install.pluginVersion,
      },
      managementToken,
    };
  });
}

export async function authenticateManagedInstall(input: {
  installKey: string;
  managementToken: string;
}) {
  const install = await withPlatformDb((db) =>
    db.siteInstall.findUnique({
      where: { publicInstallKey: input.installKey },
    }),
  );

  if (
    !install ||
    !install.managementTokenHash ||
    !timingSafeEqualString(install.managementTokenHash, hashToken(input.managementToken))
  ) {
    throw new InstallManagementAuthError();
  }

  return install;
}
