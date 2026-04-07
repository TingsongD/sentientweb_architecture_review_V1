import OpenAI from "openai";
import { decryptSecret } from "./crypto.server";
import { DependencyUnavailableError } from "./errors.server";
import { logger } from "~/utils";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_VECTOR_SIZE = 1536;

export interface EmbeddingTenantConfig {
  aiProvider: string;
  aiCredentialMode: string;
  aiApiKeyEncrypted: string | null;
}

export function cosineSimilarity(a: number[], b: number[]) {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
}

export function resolveEmbeddingApiKey(
  tenant: EmbeddingTenantConfig | null | undefined,
) {
  if (
    tenant?.aiProvider === "openai" &&
    tenant.aiCredentialMode === "tenant_key"
  ) {
    if (!tenant.aiApiKeyEncrypted) {
      throw new DependencyUnavailableError(
        "Knowledge embeddings are unavailable because the tenant OpenAI key is not configured.",
        "embeddings",
      );
    }

    try {
      return decryptSecret(tenant.aiApiKeyEncrypted);
    } catch {
      throw new DependencyUnavailableError(
        "Knowledge embeddings are unavailable because the tenant OpenAI key could not be decrypted.",
        "embeddings",
      );
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new DependencyUnavailableError(
      "Knowledge embeddings are unavailable because OPENAI_API_KEY is not configured.",
      "embeddings",
    );
  }

  return apiKey;
}

export async function embedTextBatch(
  texts: string[],
  tenant?: EmbeddingTenantConfig | null,
) {
  const apiKey = resolveEmbeddingApiKey(tenant);

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts
    });

    const embeddings = response.data.map((item) => item.embedding);
    for (const embedding of embeddings) {
      if (embedding.length !== EMBEDDING_VECTOR_SIZE) {
        throw new DependencyUnavailableError(
          "Embedding provider returned an unexpected vector size.",
          "embeddings",
        );
      }
    }

    return embeddings;
  } catch (error) {
    logger.error("Batch embedding generation failed", error);
    if (error instanceof DependencyUnavailableError) {
      throw error;
    }
    throw new DependencyUnavailableError(
      "Knowledge embeddings are temporarily unavailable.",
      "embeddings",
    );
  }
}

export async function embedText(
  text: string,
  tenant?: EmbeddingTenantConfig | null,
) {
  const batch = await embedTextBatch([text], tenant);
  return batch[0];
}
