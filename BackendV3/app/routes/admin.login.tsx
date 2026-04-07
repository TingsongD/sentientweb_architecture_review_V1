import { Form, Link, data, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { createMagicLink } from "~/lib/auth.server";
import { DependencyUnavailableError } from "~/lib/errors.server";
import { getRequestClientIp, getRequestUserAgent } from "~/lib/http.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import { RequestMagicLinkSchema, validateOrThrow } from "~/lib/validation.server";
import { z } from "zod";

export const MAGIC_LINK_CONFIRMATION_MESSAGE =
  "If an operator account exists for that email, a sign-in link has been created.";
const LOGIN_RATE_LIMIT_MESSAGE = "Too many sign-in attempts. Try again later.";
const LOGIN_TEMPORARILY_UNAVAILABLE_MESSAGE =
  "Sign-in is temporarily unavailable.";

function normalizeEmailForRateLimit(email: string) {
  return email.trim().toLowerCase();
}

export async function loader(_: LoaderFunctionArgs) {
  const tenantCount = await prisma.tenant.count();
  return { showBootstrapLink: tenantCount === 0 };
}

export async function action({ request }: ActionFunctionArgs) {
  const url = new URL(request.url);
  const formData = Object.fromEntries(await request.formData());

  try {
    const input = validateOrThrow(RequestMagicLinkSchema, formData);
    const normalizedEmail = normalizeEmailForRateLimit(input.email);
    const clientIp = getRequestClientIp(request);
    const userAgent = getRequestUserAgent(request);

    const ipLimit = await checkRateLimit(
      `admin-login:ip:${clientIp}`,
      20,
      15 * 60,
    );
    if (!ipLimit.allowed) {
      return data(
        {
          ok: false,
          error: LOGIN_RATE_LIMIT_MESSAGE,
        },
        { status: 429 },
      );
    }

    const emailLimit = await checkRateLimit(
      `admin-login:ip-email:${clientIp}:${normalizedEmail}`,
      5,
      15 * 60,
    );
    if (!emailLimit.allowed) {
      return data(
        {
          ok: false,
          error: LOGIN_RATE_LIMIT_MESSAGE,
        },
        { status: 429 },
      );
    }

    const magic = await createMagicLink(
      normalizedEmail,
      url.searchParams.get("redirectTo"),
      { ip: clientIp, userAgent },
    );
    return {
      ok: true,
      message: MAGIC_LINK_CONFIRMATION_MESSAGE,
      preview: magic?.preview ?? null,
    };
  } catch (error) {
    if (error instanceof DependencyUnavailableError) {
      return data(
        {
          ok: false,
          error: LOGIN_TEMPORARILY_UNAVAILABLE_MESSAGE,
        },
        { status: 503 },
      );
    }

    return {
      ok: false,
      // Only Zod messages (which are schema-authored) are safe to surface.
      // Internal Error.message values are never forwarded to the client.
      error:
        error instanceof z.ZodError
          ? error.issues[0]?.message
          : "Unable to create magic link",
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
          Enter the tenant admin email to request a passwordless sign-in link. In development, a
          valid request still shows the preview link directly on screen.
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

        {actionData && "message" in actionData && actionData.message ? (
          <div className="callout">{actionData.message}</div>
        ) : null}
        {actionData?.error ? <div className="callout">{actionData.error}</div> : null}
        {actionData && "preview" in actionData && actionData.preview ? (
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
