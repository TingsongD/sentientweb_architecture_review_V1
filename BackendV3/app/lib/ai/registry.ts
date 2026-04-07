import type { AIProvider } from "./types";
import { GeminiProvider } from "./providers/gemini";
import { OpenAIProvider } from "./providers/openai";

const providers = new Map<string, AIProvider>([
  ["openai", new OpenAIProvider()],
  ["gemini", new GeminiProvider()]
]);

export function getProvider(name: string) {
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(`Unknown AI provider: ${name}`);
  }
  return provider;
}

export function getProviderChoices() {
  return Array.from(providers.values()).map((provider) => ({
    value: provider.name,
    label: provider.name
  }));
}
