import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { bootstrapTenant } from "~/lib/tenants.server";
import { validateOrThrow, CreateTenantSchema } from "~/lib/validation.server";
import { createMagicLink } from "~/lib/auth.server";
import { timingSafeEqualString } from "~/lib/crypto.server";
import { getRequestClientIp, getRequestUserAgent } from "~/lib/http.server";
import { logger } from "~/utils";
import { z } from "zod";

const BOOTSTRAP_FAILURE_MESSAGE = "Bootstrap is unavailable.";

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
  const tenantCount = await prisma.tenant.count();
  if (tenantCount > 0) {
    throw redirect("/admin/login");
  }

  return {
    tenantCount,
    requiresBootstrapSecret: requiresBootstrapSecret(),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const tenantCount = await prisma.tenant.count();
  if (tenantCount > 0) {
    throw redirect("/admin/login");
  }

  const formData = Object.fromEntries(await request.formData());
  try {
    if (!hasValidBootstrapSecret(formData.bootstrapSecret)) {
      logger.warn("Denied first-tenant bootstrap attempt", { route: "/" });
      return {
        ok: false,
        error: BOOTSTRAP_FAILURE_MESSAGE,
      };
    }

    const input = validateOrThrow(
      CreateTenantSchema,
      {
        companyName: formData.companyName,
        primaryDomain: formData.primaryDomain,
        adminEmail: formData.adminEmail,
        adminName: formData.adminName
      }
    );

    await bootstrapTenant(input);
    const magic = await createMagicLink(input.adminEmail, null, {
      ip: getRequestClientIp(request),
      userAgent: getRequestUserAgent(request),
    });
    if (!magic) {
      throw new Error("Bootstrap admin sign-in link could not be created");
    }

    return {
      ok: true,
      magicLink: magic.preview
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: error.issues[0]?.message ?? "Invalid input"
      };
    }

    if (error instanceof Response) {
      throw error;
    }

    logger.error("First-tenant bootstrap failed", error, { route: "/" });

    return {
      ok: false,
      error: BOOTSTRAP_FAILURE_MESSAGE
    };
  }
}

export default function BootstrapPage() {
  const { tenantCount, requiresBootstrapSecret } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <main className="page stack">
      <section className="hero-card stack">
        <span className="pill">Phase 1 bootstrap</span>
        <h1 style={{ fontSize: "clamp(2.5rem, 6vw, 4.8rem)", lineHeight: 0.95, margin: 0 }}>
          Launch the first B2B pilot workspace.
        </h1>
        <p className="muted" style={{ fontSize: "1.1rem", maxWidth: 720 }}>
          This workspace creates the first operator-managed tenant, issues the public site key,
          and generates the first admin magic link.
        </p>
        {requiresBootstrapSecret ? (
          <p className="muted" style={{ marginTop: 0, maxWidth: 720 }}>
            Secure bootstrap mode is active. A bootstrap secret is required before the first
            tenant can be created.
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
              <input name="adminEmail" placeholder="founder@acme.com" type="email" required />
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
            <button className="button" type="submit">Create workspace</button>
          </div>
        </Form>

        {actionData?.error ? <div className="callout">{actionData.error}</div> : null}
        {actionData?.magicLink ? (
          <div className="callout">
            Magic link preview:
            <div className="mono" style={{ marginTop: 8, wordBreak: "break-all" }}>
              {actionData.magicLink}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
