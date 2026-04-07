import Redis from "ioredis";
import { DependencyUnavailableError } from "./errors.server";
import { logger } from "~/utils";

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (redis) return redis;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.warn(
      "REDIS_URL not configured; queues and rate-limited routes will be unavailable and may return 503",
    );
    return null;
  }

  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      return Math.min(times * 50, 2000);
    }
  });

  redis.on("connect", () => logger.info("Redis connected"));
  redis.on("error", (error) => logger.error("Redis error", error));
  redis.on("close", () => logger.warn("Redis connection closed"));

  return redis;
}

export async function closeRedis() {
  if (!redis) return;
  await redis.quit();
  redis = null;
}

export function requireRedis() {
  const client = getRedis();
  if (!client) {
    throw new DependencyUnavailableError(
      "Redis is required for this operation.",
      "redis",
    );
  }

  return client;
}

export default getRedis;
