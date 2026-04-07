import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
  },
  txMock: {
    $queryRaw: vi.fn(),
    tenant: {
      count: vi.fn(),
    },
  },
}));

vi.mock("~/db.server", () => ({
  default: prismaMock,
}));

import { withPlatformDb, withTenantDb } from "~/lib/tenant-db.server";

describe("tenant db helpers", () => {
  beforeEach(() => {
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof txMock) => Promise<unknown>) =>
        callback(txMock),
    );
    txMock.$queryRaw.mockResolvedValue([]);
    txMock.tenant.count.mockResolvedValue(1);
  });

  afterEach(() => {
    prismaMock.$transaction.mockReset();
    txMock.$queryRaw.mockReset();
    txMock.tenant.count.mockReset();
  });

  it("sets tenant_id and disables bypass for tenant-scoped work", async () => {
    await withTenantDb("tenant_1", (db) => db.tenant.count());

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(txMock.$queryRaw.mock.calls[0]?.[1]).toBe("tenant_1");
    expect(txMock.$queryRaw.mock.calls[0]?.[2]).toBe("off");
    expect(txMock.tenant.count).toHaveBeenCalledTimes(1);
  });

  it("enables bypass and clears tenant_id for platform-scoped work", async () => {
    await withPlatformDb((db) => db.tenant.count());

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(txMock.$queryRaw.mock.calls[0]?.[1]).toBe("");
    expect(txMock.$queryRaw.mock.calls[0]?.[2]).toBe("on");
    expect(txMock.tenant.count).toHaveBeenCalledTimes(1);
  });
});
