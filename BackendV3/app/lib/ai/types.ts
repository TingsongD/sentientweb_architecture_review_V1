export interface MessageContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: "low" | "high" | "auto";
  };
}

export interface AIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | MessageContent[] | null;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIProviderConfig {
  provider: "openai" | "gemini";
  model: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateReplyOptions {
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "none";
}

export interface AIResponse {
  content: string | null;
  delta?: string;
  toolCalls?: ToolCall[];
  finishReason: "stop" | "tool_calls";
  tokensUsed?: number;
  model?: string;
}

export type AIStreamChunk =
  | { type: "text"; content: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "done"; tokensUsed?: number };

export interface AIProvider {
  name: string;
  generateReply(
    messages: AIMessage[],
    config: AIProviderConfig,
    systemPrompt: string,
    options?: GenerateReplyOptions
  ): Promise<AIResponse>;
  generateReplyStream(
    messages: AIMessage[],
    config: AIProviderConfig,
    systemPrompt: string,
    options?: GenerateReplyOptions
  ): AsyncIterable<AIStreamChunk>;
  validateApiKey(apiKey: string): Promise<boolean>;
  getSupportedModels(): string[];
  getDefaultModel(): string;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public statusCode?: number,
    public originalError?: unknown
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
