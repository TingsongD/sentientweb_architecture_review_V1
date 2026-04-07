import { Form, NavLink, Outlet, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { requireAdminSession } from "~/lib/auth.server";
import { withTenantDb } from "~/lib/tenant-db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, tenant } = await requireAdminSession(request);
  const primaryInstall = await withTenantDb(tenant.id, (db) =>
    db.siteInstall.findFirst({
      where: {
        tenantId: tenant.id,
        status: "active",
      },
      orderBy: [{ platform: "asc" }, { createdAt: "asc" }],
    }),
  );

  return {
    admin: {
      email: admin.email,
      fullName: admin.fullName,
    },
    tenant: {
      id: tenant.id,
      name: tenant.name,
      primaryDomain: tenant.primaryDomain,
      publicSiteKey: tenant.publicSiteKey,
      primaryInstallKey: primaryInstall?.publicInstallKey ?? null,
    },
  };
}

export default function AdminLayout() {
  const data = useLoaderData<typeof loader>();

  return (
    <main className="page stack">
      <header className="site-nav">
        <div className="stack" style={{ gap: 4 }}>
          <span className="pill">{data.tenant.name}</span>
          <div className="muted">
            Install key:{" "}
            <span className="mono">
              {data.tenant.primaryInstallKey ?? "pending"}
            </span>
          </div>
        </div>
        <nav>
          <NavLink
            to="/admin"
            end
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/admin/activity"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Activity
          </NavLink>
          <NavLink
            to="/admin/settings"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Settings
          </NavLink>
          <NavLink
            to="/admin/installs"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Installs
          </NavLink>
        </nav>
      </header>
      <Outlet />
      <section className="panel stack">
        <div className="muted">
          Signed in as {data.admin.fullName ?? data.admin.email}
        </div>
        <Form method="post" action="/admin/logout">
          <button type="submit" className="button-secondary">
            Sign out
          </button>
        </Form>
      </section>
    </main>
  );
}
