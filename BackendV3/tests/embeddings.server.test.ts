import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  openAICtorMock,
  embeddingsCreateMock,
  decryptSecretMock,
  loggerMock,
} = vi.hoisted(() => ({
  openAICtorMock: vi.fn(),
  embeddingsCreateMock: vi.fn(),
  decryptSecretMock: vi.fn(),
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("openai", () => ({
  default: openAICtorMock,
}));

vi.mock("~/lib/crypto.server", () => ({
  decryptSecret: decryptSecretMock,
}));

vi.mock("~/utils", () => ({
  logger: loggerMock,
}));

import { DependencyUnavailableError } from "~/lib/errors.server";
import { embedTextBatch } from "~/lib/embeddings.server";

function makeEmbedding() {
  return Array.from({ length: 1536 }, (_, index) => index / 1536);
}

describe("embedding credential resolution", () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    openAICtorMock.mockImplementation(({ apiKey }: { apiKey: string }) => ({
      apiKey,
      embeddings: {
        create: embeddingsCreateMock,
      },
    }));
    embeddingsCreateMock.mockResolvedValue({
      data: [{ embedding: makeEmbedding() }],
    });
  });

  afterEach(() => {
    if (originalOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    }

    openAICtorMock.mockReset();
    embeddingsCreateMock.mockReset();
    decryptSecretMock.mockReset();
    loggerMock.info.mockReset();
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();
    loggerMock.debug.mockReset();
  });

  it("uses the tenant-managed OpenAI key for embeddings when configured", async () => {
    process.env.OPENAI_API_KEY = "platform-key";
    decryptSecretMock.mockReturnValue("tenant-key");

    await embedTextBatch(["hello"], {
      aiProvider: "openai",
      aiCredentialMode: "tenant_key",
      aiApiKeyEncrypted: "encrypted-key",
    });

    expect(decryptSecretMock).toHaveBeenCalledWith("encrypted-key");
    expect(openAICtorMock).toHaveBeenCalledWith({ apiKey: "tenant-key" });
  });

  it("uses the platform OpenAI key when tenant-managed credentials are not selected", async () => {
    process.env.OPENAI_API_KEY = "platform-key";

    await embedTextBatch(["hello"], {
      aiProvider: "gemini",
      aiCredentialMode: "managed",
      aiApiKeyEncrypted: null,
    });

    expect(decryptSecretMock).not.toHaveBeenCalled();
    expect(openAICtorMock).toHaveBeenCalledWith({ apiKey: "platform-key" });
  });

  it("fails loudly when no usable OpenAI embedding key is available", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(
      embedTextBatch(["hello"], {
        aiProvider: "gemini",
        aiCredentialMode: "managed",
        aiApiKeyEncrypted: null,
      }),
    ).rejects.toBeInstanceOf(DependencyUnavailableError);

    expect(openAICtorMock).not.toHaveBeenCalled();
  });
});
