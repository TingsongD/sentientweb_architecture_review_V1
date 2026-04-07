import { encodingForModel, getEncoding } from "js-tiktoken";

export interface TextChunk {
  content: string;
  tokenCount: number;
  offset: number;
}

const DEFAULT_MAX_TOKENS = 500;
const DEFAULT_OVERLAP = 80;

let tokenizer:
  | {
      encode(input: string): number[];
    }
  | null = null;

function getTokenizer() {
  if (tokenizer) {
    return tokenizer;
  }

  try {
    tokenizer = encodingForModel("gpt-4o-mini");
    return tokenizer;
  } catch {
    tokenizer = getEncoding("o200k_base");
    return tokenizer;
  }
}

export function estimateTokens(input: string) {
  if (!input) return 0;

  try {
    return getTokenizer().encode(input).length;
  } catch {
    return Math.ceil(input.length / 4);
  }
}

export function normalizeWhitespace(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

export function chunkText(
  input: string,
  maxTokens: number = DEFAULT_MAX_TOKENS,
  overlap: number = DEFAULT_OVERLAP
): TextChunk[] {
  const normalized = normalizeWhitespace(input);
  if (!normalized) return [];

  const words = normalized.split(" ");
  const chunks: TextChunk[] = [];
  let index = 0;
  let offset = 0;
  const overlapWords = Math.max(10, Math.floor(overlap / 2));

  while (index < words.length) {
    let end = index;
    let content = "";

    while (end < words.length) {
      const candidate = words.slice(index, end + 1).join(" ").trim();
      if (!candidate) {
        end += 1;
        continue;
      }

      const candidateTokens = estimateTokens(candidate);
      if (candidateTokens > maxTokens && end > index) {
        break;
      }

      content = candidate;
      end += 1;

      if (candidateTokens >= maxTokens) {
        break;
      }
    }

    if (!content) break;
    const tokenCount = estimateTokens(content);

    chunks.push({
      content,
      tokenCount,
      offset
    });

    offset += content.length;
    if (end >= words.length) {
      break;
    }

    index = Math.max(index + 1, end - overlapWords);
  }

  return chunks;
}
