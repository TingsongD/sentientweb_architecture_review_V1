import "dotenv/config";
import { startCrmSyncWorker, stopCrmSyncWorker } from "./lib/crm-sync.server";
import { assertEncryptionSecretConfigured } from "./lib/crypto.server";
import { closeRedis } from "./lib/redis.server";
import { startKnowledgeWorker, stopKnowledgeWorker } from "./lib/knowledge-base.server";

assertEncryptionSecretConfigured();

const knowledgeWorker = startKnowledgeWorker();
const crmSyncWorker = startCrmSyncWorker();

if (!knowledgeWorker && !crmSyncWorker) {
  console.error("SentientWeb worker failed to start. Check REDIS_URL and worker configuration.");
  process.exit(1);
}

console.log("SentientWeb Background Worker Initialized.");
console.log("Mode: BullMQ Consumer");

async function shutdown(signal: string) {
  console.log(`Worker received ${signal}. Shutting down...`);
  await Promise.all([stopKnowledgeWorker(), stopCrmSyncWorker()]);
  await closeRedis();
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
