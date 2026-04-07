import OpenAI from "openai";
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

export class OpenAIProvider implements AIProvider {
  name = "openai";

  async generateReply(
    messages: AIMessage[],
    config: AIProviderConfig,
    systemPrompt: string,
    options?: GenerateReplyOptions
  ): Promise<AIResponse> {
    try {
      const client = new OpenAI({ apiKey: config.apiKey });
      const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt }
      ];

      for (const message of messages) {
        if (message.role === "tool") {
          openaiMessages.push({
            role: "tool",
            tool_call_id: message.toolCallId ?? "tool",
            content: typeof message.content === "string" ? message.content : JSON.stringify(message.content)
          });
          continue;
        }

        if (message.role === "assistant") {
          openaiMessages.push({
            role: "assistant",
            content: typeof message.content === "string" ? message.content : null,
            tool_calls: message.toolCalls?.map((call) => ({
              id: call.id,
              type: "function",
              function: {
                name: call.name,
                arguments: JSON.stringify(call.arguments)
              }
            }))
          });
          continue;
        }

        openaiMessages.push({
          role: "user",
          content: typeof message.content === "string" ? message.content : JSON.stringify(message.content)
        });
      }

      const completion = await client.chat.completions.create({
        model: config.model,
        messages: openaiMessages,
        temperature: config.temperature ?? 0.2,
        max_tokens: config.maxTokens ?? 500,
        tools: options?.tools?.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
          }
        })),
        tool_choice: options?.toolChoice === "none" ? "none" : "auto"
      });

      const choice = completion.choices[0];
      const toolCalls = choice.message.tool_calls
        ?.filter((call) => call.type === "function")
        .map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: JSON.parse(call.function.arguments || "{}") as Record<string, unknown>
        }));

      return {
        content: choice.message.content,
        toolCalls,
        finishReason: toolCalls && toolCalls.length > 0 ? "tool_calls" : "stop",
        tokensUsed: completion.usage?.total_tokens,
        model: completion.model
      };
    } catch (error) {
      logger.error("OpenAI provider error", error);
      if (error instanceof OpenAI.APIError) {
        throw new AIProviderError(error.message, this.name, error.status, error);
      }
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
      const client = new OpenAI({ apiKey: config.apiKey });
      const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt }
      ];

      for (const message of messages) {
        if (message.role === "tool") {
          openaiMessages.push({
            role: "tool",
            tool_call_id: message.toolCallId ?? "tool",
            content: typeof message.content === "string" ? message.content : JSON.stringify(message.content)
          });
          continue;
        }

        if (message.role === "assistant") {
          openaiMessages.push({
            role: "assistant",
            content: typeof message.content === "string" ? message.content : null,
            tool_calls: message.toolCalls?.map((call) => ({
              id: call.id,
              type: "function",
              function: {
                name: call.name,
                arguments: JSON.stringify(call.arguments)
              }
            }))
          });
          continue;
        }

        openaiMessages.push({
          role: "user",
          content: typeof message.content === "string" ? message.content : JSON.stringify(message.content)
        });
      }

      const stream = await client.chat.completions.create({
        model: config.model,
        messages: openaiMessages,
        temperature: config.temperature ?? 0.2,
        max_tokens: config.maxTokens ?? 500,
        tools: options?.tools?.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
          }
        })),
        tool_choice: options?.toolChoice === "none" ? "none" : "auto",
        stream: true
      });

      const toolCallsMap: Record<number, { id: string; name: string; arguments: string }> = {};

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        const delta = choice?.delta;
        if (!delta) continue;

        if (delta.content) {
          yield { type: "text", content: delta.content };
        }

        if (delta.tool_calls) {
          for (const call of delta.tool_calls) {
            const index = call.index;
            if (!toolCallsMap[index]) {
              toolCallsMap[index] = {
                id: call.id || "",
                name: call.function?.name || "",
                arguments: ""
              };
            }
            if (call.function?.arguments) {
              toolCallsMap[index].arguments += call.function.arguments;
            }
          }
        }

        if (choice.finish_reason === "tool_calls") {
          for (const call of Object.values(toolCallsMap)) {
            yield {
              type: "tool_call",
              call: {
                id: call.id,
                name: call.name,
                arguments: JSON.parse(call.arguments || "{}") as Record<string, unknown>
              }
            };
          }
        }
      }
    } catch (error) {
      logger.error("OpenAI provider streaming error", error);
      if (error instanceof OpenAI.APIError) {
        throw new AIProviderError(error.message, this.name, error.status, error);
      }
      throw new AIProviderError("Failed to generate streaming reply", this.name, undefined, error);
    }
  }

  async validateApiKey(apiKey: string) {
    try {
      const client = new OpenAI({ apiKey });
      await client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  getSupportedModels() {
    return ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"];
  }

  getDefaultModel() {
    return "gpt-4o-mini";
  }
}
