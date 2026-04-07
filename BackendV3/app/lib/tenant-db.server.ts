import type { Prisma } from "@prisma/client";
import prisma from "~/db.server";

export type TenantDbClient = Prisma.TransactionClient;

type DbContextClient = Prisma.TransactionClient & {
  $queryRaw?: (...args: unknown[]) => Promise<unknown>;
};

type TransactionHost = {
  $transaction?: <T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ) => Promise<T>;
};

async function applyDbContext(input: {
  tx: DbContextClient;
  tenantId: string | null;
  bypassRls: boolean;
}) {
  if (typeof input.tx.$queryRaw !== "function") {
    return;
  }

  await input.tx.$queryRaw`
    SELECT
      set_config('app.tenant_id', ${input.tenantId ?? ""}, true),
      set_config('app.bypass_rls', ${input.bypassRls ? "on" : "off"}, true)
  `;
}

export async function withTenantDb<T>(
  tenantId: string,
  fn: (db: TenantDbClient) => Promise<T>,
) {
  const host = prisma as unknown as TransactionHost;
  if (typeof host.$transaction !== "function") {
    return fn(prisma as unknown as TenantDbClient);
  }

  return host.$transaction(async (tx) => {
    await applyDbContext({
      tx: tx as DbContextClient,
      tenantId,
      bypassRls: false,
    });
    return fn(tx);
  });
}

export async function withPlatformDb<T>(
  fn: (db: TenantDbClient) => Promise<T>,
) {
  const host = prisma as unknown as TransactionHost;
  if (typeof host.$transaction !== "function") {
    return fn(prisma as unknown as TenantDbClient);
  }

  return host.$transaction(async (tx) => {
    await applyDbContext({
      tx: tx as DbContextClient,
      tenantId: null,
      bypassRls: true,
    });
    return fn(tx);
  });
}
