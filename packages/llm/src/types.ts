export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: { type: string };
  default?: unknown;
}

export interface ToolJsonSchema {
  type: 'object';
  properties: Record<string, ToolParameterProperty | Record<string, unknown>>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolJsonSchema;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMCompletionRequest {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'required' | 'none' | { type: 'function'; function: { name: string } };
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
}

export interface LLMCompletionResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
  usage?: LLMUsage;
  model: string;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface LLMProvider {
  readonly id: string;
  readonly defaultModel: string;
  complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse>;
}
