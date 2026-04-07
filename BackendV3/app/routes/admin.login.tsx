import { Form, Link, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { createMagicLink } from "~/lib/auth.server";
import { RequestMagicLinkSchema, validateOrThrow } from "~/lib/validation.server";
import { z } from "zod";

export async function loader(_: LoaderFunctionArgs) {
  const tenantCount = await prisma.tenant.count();
  return { showBootstrapLink: tenantCount === 0 };
}

export async function action({ request }: ActionFunctionArgs) {
  const url = new URL(request.url);
  const formData = Object.fromEntries(await request.formData());

  try {
    const input = validateOrThrow(RequestMagicLinkSchema, formData);
    const magic = await createMagicLink(input.email, url.searchParams.get("redirectTo"));
    return {
      ok: true,
      preview: magic.preview
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof z.ZodError
          ? error.issues[0]?.message
          : error instanceof Error
            ? error.message
            : "Unable to create magic link"
    };
  }
}

export default function AdminLoginPage() {
  const { showBootstrapLink } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <main className="page">
      <section className="hero-card stack" style={{ maxWidth: 720, margin: "0 auto" }}>
        <span className="pill">Operator-assisted access</span>
        <h1 style={{ margin: 0, fontSize: "clamp(2.2rem, 5vw, 4rem)" }}>
          Access the SentientWeb operator dashboard.
        </h1>
        <p className="muted">
          Enter the tenant admin email to generate a passwordless sign-in link. In development,
          the link is returned directly on screen.
        </p>
        <Form method="post" className="stack">
          <label className="form-field">
            <span>Admin email</span>
            <input name="email" type="email" placeholder="founder@acme.com" required />
          </label>
          <div className="form-actions">
            <button className="button" type="submit">Send magic link</button>
            {showBootstrapLink ? (
              <Link className="button-secondary" to="/">Bootstrap first tenant</Link>
            ) : null}
          </div>
        </Form>

        {actionData?.error ? <div className="callout">{actionData.error}</div> : null}
        {actionData?.preview ? (
          <div className="callout">
            Dev magic link preview:
            <div className="mono" style={{ marginTop: 8, wordBreak: "break-all" }}>
              {actionData.preview}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
