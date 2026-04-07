import { Queue, Worker, type Processor } from "bullmq";
import getRedis, { requireRedis } from "./redis.server";
import { logger } from "~/utils";

export const CRAWL_QUEUE_NAME = "crawl-knowledge-source";
export const CRM_SYNC_QUEUE_NAME = "crm-sync-webhook";

let crawlQueue: Queue | null = null;
let crmSyncQueue: Queue | null = null;

export function getCrawlQueue() {
  const redis = requireRedis();

  if (!crawlQueue) {
    crawlQueue = new Queue(CRAWL_QUEUE_NAME, {
      connection: redis.duplicate()
    });
  }

  return crawlQueue;
}

export function createCrawlWorker(processor: Processor): Worker | null {
  const redis = getRedis();
  if (!redis) {
    logger.warn("Redis unavailable, crawl worker not started");
    return null;
  }

  return new Worker(CRAWL_QUEUE_NAME, processor, {
    connection: redis.duplicate()
  });
}

export function getCrmSyncQueue() {
  const redis = requireRedis();

  if (!crmSyncQueue) {
    crmSyncQueue = new Queue(CRM_SYNC_QUEUE_NAME, {
      connection: redis.duplicate()
    });
  }

  return crmSyncQueue;
}

export function createCrmSyncWorker(processor: Processor): Worker | null {
  const redis = getRedis();
  if (!redis) {
    logger.warn("Redis unavailable, CRM sync worker not started");
    return null;
  }

  return new Worker(CRM_SYNC_QUEUE_NAME, processor, {
    connection: redis.duplicate()
  });
}
