import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, getRedisMock, redisMock } = vi.hoisted(() => ({
  prismaMock: {
    $queryRaw: vi.fn(),
  },
  getRedisMock: vi.fn(),
  redisMock: {
    ping: vi.fn(),
  },
}));

vi.mock("~/db.server", () => ({
  default: prismaMock,
}));

vi.mock("~/lib/redis.server", () => ({
  getRedis: getRedisMock,
}));

import { loader } from "~/routes/readyz";
import { loader as healthzLoader } from "~/routes/healthz";

describe("readyz route", () => {
  beforeEach(() => {
    prismaMock.$queryRaw.mockResolvedValue([{ ok: 1 }]);
    redisMock.ping.mockResolvedValue("PONG");
    getRedisMock.mockReturnValue(redisMock);
  });

  afterEach(() => {
    prismaMock.$queryRaw.mockReset();
    redisMock.ping.mockReset();
    getRedisMock.mockReset();
    vi.unstubAllEnvs();
  });

  it("returns 200 when database and redis are available", async () => {
    const response = await loader({
      request: new Request("http://localhost:3000/readyz"),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      components: {
        database: { ok: true },
        redis: { ok: true },
        magicLinkDelivery: { ok: true, mode: "preview" },
      },
    });
  });

  it("returns 503 when redis is unavailable", async () => {
    getRedisMock.mockReturnValue(null);

    const response = await loader({
      request: new Request("http://localhost:3000/readyz"),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      components: {
        database: { ok: true },
        redis: { ok: false, error: "unavailable" },
        magicLinkDelivery: { ok: true, mode: "preview" },
      },
    });
  });

  it("returns 503 when the database check fails", async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error("db offline"));

    const response = await loader({
      request: new Request("http://localhost:3000/readyz"),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      components: {
        database: { ok: false, error: "unavailable" },
        redis: { ok: true },
        magicLinkDelivery: { ok: true, mode: "preview" },
      },
    });
  });

  it("returns 503 in production when magic-link delivery config is incomplete", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.RESEND_API_KEY;
    delete process.env.MAGIC_LINK_FROM_EMAIL;
    delete process.env.MAGIC_LINK_BASE_URL;
    delete process.env.APP_URL;

    const response = await loader({
      request: new Request("http://localhost:3000/readyz"),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      components: {
        database: { ok: true },
        redis: { ok: true },
        magicLinkDelivery: { ok: false, mode: "email", error: "unavailable" },
      },
    });
  });

  it("keeps healthz as a plain liveness probe", async () => {
    const response = healthzLoader();

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("OK");
  });
});
