import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { bootstrapTenant } from "~/lib/tenants.server";
import { validateOrThrow, CreateTenantSchema } from "~/lib/validation.server";
import {
  createMagicLinkInTransaction,
  deliverMagicLink,
} from "~/lib/auth.server";
import { timingSafeEqualString } from "~/lib/crypto.server";
import { assertMagicLinkEmailDeliveryConfigured } from "~/lib/magic-link-email.server";
import { DependencyUnavailableError } from "~/lib/errors.server";
import { getRequestClientIp, getRequestUserAgent } from "~/lib/http.server";
import { withPlatformDb } from "~/lib/tenant-db.server";
import { logger } from "~/utils";
import { z } from "zod";

const BOOTSTRAP_FAILURE_MESSAGE = "Bootstrap is unavailable.";
const BOOTSTRAP_LOGIN_QUERY_KEY = "bootstrap";
const BOOTSTRAP_EMAIL_SENT_VALUE = "email-sent";
const BOOTSTRAP_EMAIL_FAILED_VALUE = "email-failed";

function requiresBootstrapSecret() {
  return (
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.FIRST_TENANT_BOOTSTRAP_SECRET)
  );
}

function hasValidBootstrapSecret(input: FormDataEntryValue | undefined) {
  if (!requiresBootstrapSecret()) return true;
  if (typeof input !== "string") return false;

  const configuredSecret = process.env.FIRST_TENANT_BOOTSTRAP_SECRET;
  if (!configuredSecret) return false;

  return timingSafeEqualString(configuredSecret, input);
}

export async function loader(_: LoaderFunctionArgs) {
  const tenantCount = await withPlatformDb((db) => db.tenant.count());
  if (tenantCount > 0) {
    throw redirect("/admin/login");
  }

  return {
    tenantCount,
    requiresBootstrapSecret: requiresBootstrapSecret(),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = Object.fromEntries(await request.formData());

  if (!hasValidBootstrapSecret(formData.bootstrapSecret)) {
    logger.warn("Denied first-tenant bootstrap attempt", { route: "/" });
    return { ok: false, error: BOOTSTRAP_FAILURE_MESSAGE };
  }

  // Fast-path redirect: if a tenant exists, send the user to the login page.
  // This check is intentionally outside the try-catch so the React Router
  // redirect Response propagates correctly as an unhandled rejection.
  const existingTenant = await withPlatformDb((db) => db.tenant.findFirst());
  if (existingTenant) {
    throw redirect("/admin/login");
  }

  let input;
  try {
    input = validateOrThrow(CreateTenantSchema, {
      companyName: formData.companyName,
      primaryDomain: formData.primaryDomain,
      adminEmail: formData.adminEmail,
      adminName: formData.adminName,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "Invalid input" };
    }
    logger.error("First-tenant bootstrap failed", error, { route: "/" });
    return { ok: false, error: BOOTSTRAP_FAILURE_MESSAGE };
  }

  const auditContext = {
    ip: getRequestClientIp(request),
    userAgent: getRequestUserAgent(request),
  };

  if (process.env.NODE_ENV === "production") {
    try {
      assertMagicLinkEmailDeliveryConfigured();
    } catch (error) {
      logger.error("First-tenant bootstrap failed", error, { route: "/" });
      return { ok: false, error: BOOTSTRAP_FAILURE_MESSAGE };
    }
  }

  function redirectToLogin(bootstrapState: string) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set(BOOTSTRAP_LOGIN_QUERY_KEY, bootstrapState);
    return redirect(loginUrl.pathname + loginUrl.search);
  }

  // Tenant creation and magic link token insertion happen in a single
  // transaction. An advisory lock is acquired first to serialize any
  // concurrent bootstrap attempts — two POSTs with different domains would
  // both see an empty Tenant table without it and both commit.
  // BOOTSTRAP_ADVISORY_LOCK_ID is an arbitrary fixed bigint; it only needs
  // to be consistent across all processes of this application.
  const BOOTSTRAP_ADVISORY_LOCK_ID = 7391846204n;

  try {
    const result = await withPlatformDb(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${BOOTSTRAP_ADVISORY_LOCK_ID})`;

      const alreadyExists = await tx.tenant.findFirst();
      if (alreadyExists) {
        throw redirect("/admin/login");
      }

      const tenant = await bootstrapTenant(input!, tx);
      const admin = tenant.admins[0];
      const magicLink = await createMagicLinkInTransaction(tx, {
        adminId: admin.id,
        tenantId: tenant.id,
        email: admin.email,
        tenantName: tenant.name,
        audit: auditContext,
      });

      return { magicLink };
    });

    if (process.env.NODE_ENV === "production") {
      try {
        await deliverMagicLink(result.magicLink);
      } catch (error) {
        if (error instanceof DependencyUnavailableError) {
          logger.error("First-tenant bootstrap email delivery failed", error, {
            route: "/",
            tenantId: result.magicLink.tenantId,
          });
          throw redirectToLogin(BOOTSTRAP_EMAIL_FAILED_VALUE);
        }
        throw error;
      }

      throw redirectToLogin(BOOTSTRAP_EMAIL_SENT_VALUE);
    }

    return { ok: true, magicLink: result.magicLink.preview };
  } catch (error) {
    // Re-throw redirect Responses — React Router intercepts these.
    if (error instanceof Response) {
      throw error;
    }
    logger.error("First-tenant bootstrap failed", error, { route: "/" });
    return { ok: false, error: BOOTSTRAP_FAILURE_MESSAGE };
  }
}

export default function BootstrapPage() {
  const { tenantCount, requiresBootstrapSecret } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <main className="page stack">
      <section className="hero-card stack">
        <span className="pill">Phase 1 bootstrap</span>
        <h1
          style={{
            fontSize: "clamp(2.5rem, 6vw, 4.8rem)",
            lineHeight: 0.95,
            margin: 0,
          }}
        >
          Launch the first B2B pilot workspace.
        </h1>
        <p className="muted" style={{ fontSize: "1.1rem", maxWidth: 720 }}>
          This workspace creates the first operator-managed tenant, issues the
          public site key, and generates the first admin magic link.
        </p>
        {requiresBootstrapSecret ? (
          <p className="muted" style={{ marginTop: 0, maxWidth: 720 }}>
            Secure bootstrap mode is active. A bootstrap secret is required
            before the first tenant can be created.
          </p>
        ) : null}
      </section>

      <section className="panel stack">
        <h2 style={{ margin: 0 }}>Create the first tenant</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Existing tenant count: {tenantCount}
        </p>
        <Form method="post" className="stack">
          <div className="grid two">
            <label className="form-field">
              <span>Company name</span>
              <input name="companyName" placeholder="Acme" required />
            </label>
            <label className="form-field">
              <span>Primary domain</span>
              <input name="primaryDomain" placeholder="acme.com" required />
            </label>
          </div>
          <div className="grid two">
            <label className="form-field">
              <span>Admin email</span>
              <input
                name="adminEmail"
                placeholder="founder@acme.com"
                type="email"
                required
              />
            </label>
            <label className="form-field">
              <span>Admin name</span>
              <input name="adminName" placeholder="Jane Doe" />
            </label>
          </div>
          {requiresBootstrapSecret ? (
            <label className="form-field">
              <span>Bootstrap secret</span>
              <input
                name="bootstrapSecret"
                placeholder="Production bootstrap secret"
                type="password"
                required
              />
            </label>
          ) : null}
          <div className="form-actions">
            <button className="button" type="submit">
              Create workspace
            </button>
          </div>
        </Form>

        {actionData?.error ? (
          <div className="callout">{actionData.error}</div>
        ) : null}
        {actionData?.magicLink ? (
          <div className="callout">
            Magic link preview:
            <div
              className="mono"
              style={{ marginTop: 8, wordBreak: "break-all" }}
            >
              {actionData.magicLink}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
