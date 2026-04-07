import { DependencyUnavailableError } from "./errors.server";
import { requireRedis } from "./redis.server";
import { logger } from "~/utils";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export async function checkRateLimit(
  identifier: string,
  limit: number = 10,
  windowSeconds: number = 60
): Promise<RateLimitResult> {
  const redis = requireRedis();
  const resetAt = Date.now() + windowSeconds * 1000;

  const key = `ratelimit:${identifier}`;

  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    const allowed = current <= limit;
    const remaining = Math.max(0, limit - current);

    if (!allowed) {
      logger.warn("Rate limit exceeded", { identifier, limit, current });
    }

    return { allowed, limit, remaining, resetAt };
  } catch (error) {
    logger.error("Rate limit check failed", error, { identifier });
    throw new DependencyUnavailableError(
      "Redis rate limiting is temporarily unavailable.",
      "redis",
    );
  }
}
