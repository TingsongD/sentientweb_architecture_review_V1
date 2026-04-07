import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { bootstrapTenant } from "~/lib/tenants.server";
import { validateOrThrow, CreateTenantSchema } from "~/lib/validation.server";
import { createMagicLink } from "~/lib/auth.server";
import { z } from "zod";

export async function loader(_: LoaderFunctionArgs) {
  const tenantCount = await prisma.tenant.count();
  if (tenantCount > 0) {
    throw redirect("/admin/login");
  }

  return { tenantCount };
}

export async function action({ request }: ActionFunctionArgs) {
  const tenantCount = await prisma.tenant.count();
  if (tenantCount > 0) {
    throw redirect("/admin/login");
  }

  const formData = Object.fromEntries(await request.formData());
  try {
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
    const magic = await createMagicLink(input.adminEmail);

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

    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to create tenant"
    };
  }
}

export default function BootstrapPage() {
  const { tenantCount } = useLoaderData<typeof loader>();
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
