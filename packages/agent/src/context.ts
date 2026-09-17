import { ChatMessage } from '@agentforge/llm';

export interface ContextManagerOptions {
  maxToolOutputLength?: number;
  maxHistoryMessages?: number;
}

export class ContextManager {
  private messages: ChatMessage[] = [];
  private readonly maxToolOutputLength: number;
  private readonly maxHistoryMessages: number;

  constructor(options: ContextManagerOptions = {}) {
    this.maxToolOutputLength = options.maxToolOutputLength || 16000;
    this.maxHistoryMessages = options.maxHistoryMessages || 40;
  }

  public setSystemPrompt(systemPrompt: string): void {
    // Replace or set initial system prompt
    const nonSystem = this.messages.filter((m) => m.role !== 'system');
    this.messages = [{ role: 'system', content: systemPrompt }, ...nonSystem];
  }

  public addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content });
    this.trimHistory();
  }

  public addAssistantMessage(content: string, toolCalls?: ChatMessage['toolCalls']): void {
    this.messages.push({
      role: 'assistant',
      content,
      toolCalls,
    });
    this.trimHistory();
  }

  public addToolResult(toolCallId: string, toolName: string, output: string): void {
    let sanitizedOutput = output;
    if (sanitizedOutput.length > this.maxToolOutputLength) {
      sanitizedOutput =
        sanitizedOutput.substring(0, this.maxToolOutputLength) +
        `\n\n[INFO] Output truncated (${output.length} bytes exceeded maximum threshold of ${this.maxToolOutputLength} bytes)`;
    }

    this.messages.push({
      role: 'tool',
      toolCallId,
      name: toolName,
      content: sanitizedOutput,
    });
    this.trimHistory();
  }

  public getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  public clearNonSystem(): void {
    const system = this.messages.filter((m) => m.role === 'system');
    this.messages = [...system];
  }

  private trimHistory(): void {
    const systemMessages = this.messages.filter((m) => m.role === 'system');
    const conversationMessages = this.messages.filter((m) => m.role !== 'system');

    if (conversationMessages.length > this.maxHistoryMessages) {
      // Keep earliest user message and most recent window
      const excess = conversationMessages.length - this.maxHistoryMessages;
      const pruned = conversationMessages.slice(excess);
      this.messages = [...systemMessages, ...pruned];
    }
  }
}
