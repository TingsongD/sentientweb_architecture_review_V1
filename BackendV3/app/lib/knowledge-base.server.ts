import { Prisma } from "@prisma/client";
import type { Worker } from "bullmq";
import crypto from "node:crypto";
import prisma from "~/db.server";
import { chunkText } from "./chunking.server";
import { embedText, embedTextBatch } from "./embeddings.server";
import { crawlSite } from "./site-crawler.server";
import { createCrawlWorker, getCrawlQueue } from "./queue.server";
import { DependencyUnavailableError } from "./errors.server";
import { assertAllowedOutboundUrl } from "./outbound-url.server";
import { logger } from "~/utils";

declare global {
  // eslint-disable-next-line no-var
  var __sentientKnowledgeWorker__: boolean | undefined;
}

let knowledgeWorker: Worker | null = null;

function getEmbeddingBatchSize() {
  const configured = Number(process.env.KNOWLEDGE_EMBED_BATCH_SIZE || "50");
  if (!Number.isFinite(configured) || configured < 1) {
    return 50;
  }

  return Math.floor(configured);
}

export async function processKnowledgeSource(sourceId: string) {
  const source = await prisma.knowledgeSource.findUnique({
    where: { id: sourceId },
    include: { tenant: true },
  });

  if (!source) return null;

  await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: {
      status: "processing",
      startedAt: new Date(),
      errorMessage: null,
    },
  });

  try {
    let documents: Array<{
      sourceUrl: string | null;
      title: string | null;
      text: string;
    }> = [];
    if (source.kind === "crawl" && source.rootUrl) {
      const pages = await crawlSite(source.rootUrl);
      documents = pages.map((page) => ({
        sourceUrl: page.url,
        title: page.title,
        text: page.text,
      }));
    } else if (source.rawText) {
      documents = [
        {
          sourceUrl: source.sourceUrl,
          title: source.title ?? source.uploadName ?? "Uploaded document",
          text: source.rawText,
        },
      ];
    }

    await prisma.knowledgeChunk.deleteMany({
      where: { sourceId: source.id },
    });

    const allChunks: Array<{
      tenantId: string;
      sourceId: string;
      sourceUrl: string | null;
      title: string | null;
      content: string;
      contentHash: string;
      tokenCount: number;
      metadata: any;
    }> = [];

    for (const doc of documents) {
      const chunks = chunkText(doc.text);
      chunks.forEach((chunk) => {
        allChunks.push({
          tenantId: source.tenantId,
          sourceId: source.id,
          sourceUrl: doc.sourceUrl,
          title: doc.title,
          content: chunk.content,
          contentHash: `${source.id}:${chunk.offset}`,
          tokenCount: chunk.tokenCount,
          metadata: {
            sourceKind: source.kind,
            offset: chunk.offset,
          },
        });
      });
    }

    const batchSize = getEmbeddingBatchSize();
    for (let i = 0; i < allChunks.length; i += batchSize) {
      const batch = allChunks.slice(i, i + batchSize);
      const embeddings = await embedTextBatch(batch.map((c) => c.content), {
        aiProvider: source.tenant.aiProvider,
        aiCredentialMode: source.tenant.aiCredentialMode,
        aiApiKeyEncrypted: source.tenant.aiApiKeyEncrypted,
      });

      await Promise.all(
        batch.map((chunk, j) => {
          const embedding = embeddings[j];
          const vectorSql = `[${embedding.join(",")}]`;

          return prisma.$executeRaw`
            INSERT INTO "KnowledgeChunk" (
              "id", "tenantId", "sourceId", "sourceUrl", "title", "content", 
              "contentHash", "tokenCount", "metadata", "embedding", 
              "embeddingVector", "createdAt", "updatedAt"
            ) VALUES (
              ${crypto.randomUUID()}, ${chunk.tenantId}, ${chunk.sourceId}, ${chunk.sourceUrl}, ${chunk.title}, ${chunk.content}, 
              ${chunk.contentHash}, ${chunk.tokenCount}, ${chunk.metadata}, ${JSON.stringify(embedding)}, 
              ${vectorSql}::vector, NOW(), NOW()
            )
          `;
        }),
      );
    }

    await prisma.knowledgeSource.update({
      where: { id: source.id },
      data: {
        status: "ready",
        crawledPages: documents.length,
        chunkCount: allChunks.length,
        completedAt: new Date(),
      },
    });

    return { documents: documents.length, chunkCount: allChunks.length };
  } catch (error) {
    logger.error("Knowledge source processing failed", error, { sourceId });
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

export async function enqueueKnowledgeCrawl(input: {
  tenantId: string;
  rootUrl: string;
  title?: string;
}) {
  const validatedRootUrl = await assertAllowedOutboundUrl(input.rootUrl);
  const queue = getCrawlQueue();
  const source = await prisma.knowledgeSource.create({
    data: {
      tenantId: input.tenantId,
      kind: "crawl",
      status: "pending",
      rootUrl: validatedRootUrl.toString(),
      sourceUrl: validatedRootUrl.toString(),
      title: input.title ?? validatedRootUrl.toString(),
    },
  });

  await queue.add(
    "crawl",
    { sourceId: source.id },
    { removeOnComplete: 50, removeOnFail: 50 },
  );
  return source;
}

export async function enqueueUploadedKnowledgeSource(input: {
  tenantId: string;
  title?: string;
  uploadName?: string;
  contentType?: string | null;
  rawText: string;
}) {
  const queue = getCrawlQueue();
  const source = await prisma.knowledgeSource.create({
    data: {
      tenantId: input.tenantId,
      kind: "upload",
      status: "pending",
      title: input.title ?? input.uploadName ?? "Uploaded document",
      uploadName: input.uploadName ?? null,
      contentType: input.contentType ?? null,
      rawText: input.rawText,
    },
  });

  await queue.add(
    "crawl",
    { sourceId: source.id },
    { removeOnComplete: 50, removeOnFail: 50 },
  );
  return source;
}

export async function searchKnowledge(
  tenantId: string,
  query: string,
  topK = 5,
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      aiProvider: true,
      aiCredentialMode: true,
      aiApiKeyEncrypted: true,
    },
  });

  if (!tenant) {
    throw new Error(`Tenant not found for knowledge search: ${tenantId}`);
  }

  const queryEmbedding = await embedText(query, tenant);
  const vectorSql = `[${queryEmbedding.join(",")}]`;

  // Hybrid search: pgvector similarity + Full Text Search rank
  const results = await prisma.$queryRaw<any[]>`
    WITH vector_results AS (
      SELECT 
        id, 
        title, 
        content, 
        "sourceUrl",
        (1 - ("embeddingVector" <=> ${vectorSql}::vector)) as vector_score
      FROM "KnowledgeChunk"
      WHERE "tenantId" = ${tenantId}
      ORDER BY "embeddingVector" <=> ${vectorSql}::vector
      LIMIT 50
    ),
    text_results AS (
      SELECT 
        id, 
        title, 
        content, 
        "sourceUrl",
        ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', ${query})) as text_score
      FROM "KnowledgeChunk"
      WHERE "tenantId" = ${tenantId} AND to_tsvector('english', content) @@ plainto_tsquery('english', ${query})
      ORDER BY text_score DESC
      LIMIT 50
    )
    SELECT 
      COALESCE(v.id, t.id) as id,
      COALESCE(v.title, t.title) as title,
      COALESCE(v.content, t.content) as content,
      COALESCE(v."sourceUrl", t."sourceUrl") as "sourceUrl",
      (COALESCE(v.vector_score, 0) * 0.7 + COALESCE(t.text_score, 0) * 0.3) as score
    FROM vector_results v
    FULL OUTER JOIN text_results t ON v.id = t.id
    ORDER BY score DESC
    LIMIT ${topK}
  `;

  return results.map((row) => ({
    chunkId: row.id,
    title: row.title,
    content: row.content,
    sourceUrl: row.sourceUrl,
    score: row.score,
  }));
}

export async function buildKnowledgeContext(tenantId: string, query: string) {
  let matches: Awaited<ReturnType<typeof searchKnowledge>>;
  try {
    matches = await searchKnowledge(tenantId, query, 5);
  } catch (error) {
    if (error instanceof DependencyUnavailableError) {
      logger.warn("Skipping knowledge context because embeddings are unavailable", {
        tenantId,
      });
      return "";
    }
    throw error;
  }

  return matches
    .map(
      (match, index) =>
        `[#${index + 1}] ${match.title ?? "Untitled"} (${match.sourceUrl ?? "uploaded"})\n${match.content}`,
    )
    .join("\n\n");
}

export function startKnowledgeWorker() {
  if (knowledgeWorker) {
    return knowledgeWorker;
  }

  logger.info("Starting Sentient knowledge worker");
  const worker = createCrawlWorker(async (job) => {
    const sourceId = String(job.data?.sourceId ?? "");
    if (!sourceId) return;
    await processKnowledgeSource(sourceId);
  });

  if (!worker) {
    logger.warn("Sentient knowledge worker could not start");
    return null;
  }

  knowledgeWorker = worker;
  global.__sentientKnowledgeWorker__ = true;
  logger.info("Sentient knowledge worker started");
  return worker;
}

export async function stopKnowledgeWorker() {
  if (!knowledgeWorker) return;

  await knowledgeWorker.close();
  knowledgeWorker = null;
  global.__sentientKnowledgeWorker__ = false;
  logger.info("Sentient knowledge worker stopped");
}
