import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import { requireAdminSession } from "~/lib/auth.server";
import {
  createWordPressInstallLinkCode,
  provisionSiteInstall,
} from "~/lib/site-install.server";
import { withTenantDb } from "~/lib/tenant-db.server";

function buildEmbedSnippet(baseUrl: string, installKey: string) {
  return `<script src="${baseUrl}/agent.js" data-install-key="${installKey}"></script>`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { tenant } = await requireAdminSession(request);
  const url = new URL(request.url);

  const siteInstalls = await withTenantDb(tenant.id, (db) =>
    db.siteInstall.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ platform: "asc" }, { createdAt: "asc" }],
    }),
  );

  return {
    tenant,
    backendOrigin: url.origin,
    siteInstalls,
    pendingConnect: {
      origin: url.searchParams.get("origin") ?? "",
      returnUrl: url.searchParams.get("returnUrl") ?? "",
      platform: url.searchParams.get("platform") ?? "",
      pluginVersion: url.searchParams.get("pluginVersion") ?? "",
    },
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { tenant } = await requireAdminSession(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "create-script-install") {
    const origin = String(form.get("origin") ?? "").trim();
    const install = await provisionSiteInstall({
      tenantId: tenant.id,
      origin,
      platform: "script",
      label: `${origin} embed`,
      metadata: { provisionedFrom: "admin-installs" },
    });

    return {
      ok: true,
      message: `Provisioned script install for ${install.origin}.`,
      installKey: install.publicInstallKey,
    };
  }

  if (intent === "authorize-wordpress") {
    const origin = String(form.get("origin") ?? "").trim();
    const returnUrl = String(form.get("returnUrl") ?? "").trim();
    const pluginVersion =
      String(form.get("pluginVersion") ?? "").trim() || undefined;
    const result = await createWordPressInstallLinkCode({
      tenantId: tenant.id,
      origin,
      returnUrl,
      pluginVersion,
    });

    if (returnUrl) {
      const redirectUrl = new URL(returnUrl);
      redirectUrl.searchParams.set("sentient_link_code", result.code);
      redirectUrl.searchParams.set(
        "sentient_backend_url",
        new URL(request.url).origin,
      );
      throw redirect(redirectUrl.toString());
    }

    return {
      ok: true,
      message: `Generated WordPress install code for ${result.install.origin}.`,
      linkCode: result.code,
      expiresAt: result.expiresAt.toISOString(),
    };
  }

  return {
    ok: false,
    error: "Unknown install action.",
  };
}

export default function AdminInstallsPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="stack">
      <section className="hero-card stack">
        <span className="pill">Embedded widget installs</span>
        <h1 style={{ margin: 0, fontSize: "clamp(2rem, 4vw, 3.2rem)" }}>
          Provision backend-owned installs for client websites.
        </h1>
        <p className="muted" style={{ maxWidth: 720 }}>
          Every website now embeds the widget from this backend. Script installs
          use the same contract as WordPress installs, and this page provisions
          both.
        </p>
      </section>

      {actionData?.message ? (
        <div className="callout">{actionData.message}</div>
      ) : null}
      {actionData?.error ? (
        <div className="callout">{actionData.error}</div>
      ) : null}

      {data.pendingConnect.platform === "wordpress" &&
      data.pendingConnect.origin ? (
        <section className="panel stack">
          <h2 style={{ margin: 0 }}>Authorize WordPress install</h2>
          <div className="muted">
            Origin: <span className="mono">{data.pendingConnect.origin}</span>
          </div>
          <div className="muted">
            Return URL:{" "}
            <span className="mono">{data.pendingConnect.returnUrl}</span>
          </div>
          <Form method="post" className="form-actions">
            <input type="hidden" name="intent" value="authorize-wordpress" />
            <input
              type="hidden"
              name="origin"
              value={data.pendingConnect.origin}
            />
            <input
              type="hidden"
              name="returnUrl"
              value={data.pendingConnect.returnUrl}
            />
            <input
              type="hidden"
              name="pluginVersion"
              value={data.pendingConnect.pluginVersion}
            />
            <button type="submit" className="button">
              Approve WordPress connection
            </button>
          </Form>
        </section>
      ) : null}

      <section className="grid two">
        <article className="panel stack">
          <h2 style={{ margin: 0 }}>Provision script install</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Use this for any plain marketing site that should load the backend
            widget with a script tag only.
          </p>
          <Form method="post" className="stack">
            <input type="hidden" name="intent" value="create-script-install" />
            <label className="form-field">
              <span>Site origin</span>
              <input
                name="origin"
                type="url"
                defaultValue={`https://${data.tenant.primaryDomain}`}
                placeholder="https://www.example.com"
                required
              />
            </label>
            <button type="submit" className="button">
              Create script install
            </button>
          </Form>
        </article>

        <article className="panel stack">
          <h2 style={{ margin: 0 }}>WordPress connect link</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            The WordPress plugin opens this backend flow, waits for approval,
            then exchanges the one-time code for its install credentials.
          </p>
          <div className="mono" style={{ wordBreak: "break-all" }}>
            {`${data.backendOrigin}/admin/installs?platform=wordpress&origin=https%3A%2F%2Fexample.com&returnUrl=https%3A%2F%2Fexample.com%2Fwp-admin%2Fadmin.php%3Fpage%3Dsentientweb`}
          </div>
        </article>
      </section>

      <section className="panel stack">
        <h2 style={{ margin: 0 }}>Active installs</h2>
        {data.siteInstalls.length === 0 ? (
          <p className="muted">No installs have been provisioned yet.</p>
        ) : (
          data.siteInstalls.map((install) => (
            <article
              key={install.id}
              className="panel stack"
              style={{ padding: 16 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <strong>{install.label ?? install.origin}</strong>
                <span className="status">
                  {install.platform}:{install.status}
                </span>
              </div>
              <div className="muted">
                Origin: <span className="mono">{install.origin}</span>
              </div>
              <div className="muted">
                Install key:{" "}
                <span className="mono">{install.publicInstallKey}</span>
              </div>
              {install.platform === "script" ? (
                <div className="mono" style={{ wordBreak: "break-all" }}>
                  {buildEmbedSnippet(
                    data.backendOrigin,
                    install.publicInstallKey,
                  )}
                </div>
              ) : null}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
