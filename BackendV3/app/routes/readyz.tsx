import prisma from "~/db.server";
import { jsonResponse } from "~/lib/http.server";
import { getMagicLinkDeliveryReadiness } from "~/lib/magic-link-email.server";
import { getRedis } from "~/lib/redis.server";

async function checkDatabase() {
  await prisma.$queryRaw`SELECT 1`;
}

async function checkRedis() {
  const redis = getRedis();
  if (!redis) {
    throw new Error("Redis unavailable");
  }

  await redis.ping();
}

export async function loader({ request }: { request: Request }) {
  const checks = await Promise.allSettled([checkDatabase(), checkRedis()]);
  const magicLinkDelivery = getMagicLinkDeliveryReadiness();
  const components = {
    database:
      checks[0].status === "fulfilled"
        ? { ok: true }
        : { ok: false, error: "unavailable" },
    redis:
      checks[1].status === "fulfilled"
        ? { ok: true }
        : { ok: false, error: "unavailable" },
    magicLinkDelivery,
  };
  const ok =
    checks.every((result) => result.status === "fulfilled") &&
    magicLinkDelivery.ok;

  return jsonResponse(
    request,
    {
      ok,
      components,
    },
    { status: ok ? 200 : 503 },
  );
}
