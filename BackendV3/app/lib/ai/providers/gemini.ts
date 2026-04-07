import crypto from "node:crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  AIMessage,
  AIProvider,
  AIProviderConfig,
  AIResponse,
  GenerateReplyOptions,
  AIStreamChunk
} from "../types";
import { AIProviderError } from "../types";
import { logger } from "~/utils";

function buildToolPrompt(tools: GenerateReplyOptions["tools"]) {
  if (!tools || tools.length === 0) return "";

  return [
    "You may call exactly one tool when needed.",
    "If a tool is needed, respond with JSON only in this format:",
    '{"tool":{"name":"tool_name","arguments":{"key":"value"}}}',
    "Available tools:",
    ...tools.map((tool) => `${tool.name}: ${tool.description}`)
  ].join("\n");
}

export class GeminiProvider implements AIProvider {
  name = "gemini";

  async generateReply(
    messages: AIMessage[],
    config: AIProviderConfig,
    systemPrompt: string,
    options?: GenerateReplyOptions
  ): Promise<AIResponse> {
    try {
      const client = new GoogleGenerativeAI(config.apiKey);
      const model = client.getGenerativeModel({
        model: config.model,
        systemInstruction: `${systemPrompt}\n\n${buildToolPrompt(options?.tools)}`
      });

      const prompt = messages
        .map((message) => `${message.role.toUpperCase()}: ${typeof message.content === "string" ? message.content : JSON.stringify(message.content)}`)
        .join("\n");

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      if (text.startsWith("{") && text.includes('"tool"')) {
        const parsed = JSON.parse(text) as { tool?: { name: string; arguments?: Record<string, unknown> } };
        if (parsed.tool?.name) {
          return {
            content: null,
            toolCalls: [
              {
                id: crypto.randomUUID(),
                name: parsed.tool.name,
                arguments: parsed.tool.arguments ?? {}
              }
            ],
            finishReason: "tool_calls",
            model: config.model
          };
        }
      }

      return {
        content: text,
        finishReason: "stop",
        model: config.model
      };
    } catch (error) {
      logger.error("Gemini provider error", error);
      throw new AIProviderError("Failed to generate reply", this.name, undefined, error);
    }
  }

  async *generateReplyStream(
    messages: AIMessage[],
    config: AIProviderConfig,
    systemPrompt: string,
    options?: GenerateReplyOptions
  ): AsyncIterable<AIStreamChunk> {
    try {
      const client = new GoogleGenerativeAI(config.apiKey);
      const model = client.getGenerativeModel({
        model: config.model,
        systemInstruction: `${systemPrompt}\n\n${buildToolPrompt(options?.tools)}`
      });

      const prompt = messages
        .map(
          (message) =>
            `${message.role.toUpperCase()}: ${typeof message.content === "string" ? message.content : JSON.stringify(message.content)}`
        )
        .join("\n");

      const result = await model.generateContentStream(prompt);

      let accumulatedText = "";
      for await (const chunk of result.stream) {
        const text = chunk.text();
        accumulatedText += text;
        yield { type: "text", content: text };
      }

      if (accumulatedText.startsWith("{") && accumulatedText.includes('"tool"')) {
        const parsed = JSON.parse(accumulatedText) as {
          tool?: { name: string; arguments?: Record<string, unknown> };
        };
        if (parsed.tool?.name) {
          yield {
            type: "tool_call",
            call: {
              id: crypto.randomUUID(),
              name: parsed.tool.name,
              arguments: parsed.tool.arguments ?? {}
            }
          };
        }
      }
    } catch (error) {
      logger.error("Gemini provider streaming error", error);
      throw new AIProviderError("Failed to generate streaming reply", this.name, undefined, error);
    }
  }

  async validateApiKey(apiKey: string) {
    try {
      const client = new GoogleGenerativeAI(apiKey);
      const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });
      await model.generateContent("hello");
      return true;
    } catch {
      return false;
    }
  }

  getSupportedModels() {
    return ["gemini-2.5-flash", "gemini-2.5-pro"];
  }

  getDefaultModel() {
    return "gemini-2.5-flash";
  }
}
