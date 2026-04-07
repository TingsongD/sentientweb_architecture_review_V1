import type { LoaderFunctionArgs } from "react-router";
import { requireAdminSession } from "~/lib/auth.server";
import { jsonResponse } from "~/lib/http.server";
import { withTenantDb } from "~/lib/tenant-db.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { tenant } = await requireAdminSession(request);
  const source = await withTenantDb(tenant.id, (db) =>
    db.knowledgeSource.findFirst({
      where: {
        id: params.jobId,
        tenantId: tenant.id,
      },
    }),
  );

  if (!source) {
    return jsonResponse(request, { error: "Not found" }, { status: 404 });
  }

  return jsonResponse(request, { source });
}
