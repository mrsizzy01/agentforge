import { ChatMessage } from '@agentforge/llm';

export interface ContextManagerOptions {
  maxToolOutputLength?: number;
  maxHistoryMessages?: number;
  maxTokenEstimate?: number;
}

export class ContextManager {
  private messages: ChatMessage[] = [];
  private readonly maxToolOutputLength: number;
  private readonly maxHistoryMessages: number;
  private readonly maxTokenEstimate: number;

  constructor(options: ContextManagerOptions = {}) {
    this.maxToolOutputLength = options.maxToolOutputLength || 16000;
    this.maxHistoryMessages = options.maxHistoryMessages || 40;
    this.maxTokenEstimate = options.maxTokenEstimate || 100000;
  }

  public setSystemPrompt(systemPrompt: string): void {
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

  public setMessages(messages: ChatMessage[]): void {
    this.messages = [...messages];
  }

  public clearNonSystem(): void {
    const system = this.messages.filter((m) => m.role === 'system');
    this.messages = [...system];
  }

  /**
   * Approximate token count based on typical ~4 chars per token rule of thumb.
   */
  public estimateTokenCount(): number {
    let totalChars = 0;
    for (const msg of this.messages) {
      totalChars += (msg.content || '').length;
      if (msg.toolCalls) {
        totalChars += JSON.stringify(msg.toolCalls).length;
      }
    }
    return Math.ceil(totalChars / 4);
  }

  /**
   * Intelligently compacts intermediate conversation steps into a summarized checkpoint.
   * Preserves:
   * - System prompt (role: 'system')
   * - Original user prompt (the primary objective)
   * - The most recent N messages (active working memory)
   */
  public compactHistory(keepRecentCount: number = 12): { compacted: boolean; removedCount: number } {
    const system = this.messages.find((m) => m.role === 'system');
    const nonSystem = this.messages.filter((m) => m.role !== 'system');

    if (nonSystem.length <= keepRecentCount + 2) {
      return { compacted: false, removedCount: 0 };
    }

    const firstUserMsg = nonSystem[0];

    // Find safe atomic cut boundary so we never cut between assistant [toolCalls] and tool results
    let cutIndex = nonSystem.length - keepRecentCount;
    // If cutIndex lands on a 'tool' message, move cutIndex backwards to include the assistant message in recent,
    // or forward to include the whole transaction in compacted.
    while (cutIndex > 1 && nonSystem[cutIndex]?.role === 'tool') {
      cutIndex--;
    }

    const toCompact = nonSystem.slice(1, cutIndex);
    const recentMessages = nonSystem.slice(cutIndex);

    if (toCompact.length === 0) {
      return { compacted: false, removedCount: 0 };
    }

    // Generate concise summary of compacted tool executions
    const actionsSummaries: string[] = [];
    for (const msg of toCompact) {
      if (msg.role === 'assistant' && msg.toolCalls) {
        const toolsUsed = msg.toolCalls.map((tc) => tc.name).join(', ');
        actionsSummaries.push(`Executed tools: ${toolsUsed}`);
      } else if (msg.role === 'assistant' && msg.content) {
        actionsSummaries.push(`Note: ${msg.content.slice(0, 100).replace(/\n/g, ' ')}...`);
      }
    }

    const summaryBlock: ChatMessage = {
      role: 'user',
      content: `[CONTEXT CHECKPOINT] The previous ${toCompact.length} intermediate execution steps were compacted:\n- ${actionsSummaries.slice(0, 8).join('\n- ')}\n(Progress continues from current state)`,
    };

    const newMessages: ChatMessage[] = [];
    if (system) newMessages.push(system);
    newMessages.push(firstUserMsg);
    newMessages.push(summaryBlock);
    newMessages.push(...recentMessages);

    // Validate atomic integrity: ensure no orphaned tool messages
    const validated = ContextManager.ensureAtomicIntegrity(newMessages);

    const removedCount = this.messages.length - validated.length;
    this.messages = validated;

    return { compacted: true, removedCount };
  }

  /**
   * Ensures that every tool message is preceded by an assistant message containing the matching tool_call_id.
   * Any orphaned tool message that lost its parent assistant call is safely purged.
   */
  public static ensureAtomicIntegrity(messages: ChatMessage[]): ChatMessage[] {
    const validMessages: ChatMessage[] = [];
    const activeToolCallIds = new Set<string>();

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === 'assistant') {
        activeToolCallIds.clear();
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            activeToolCallIds.add(tc.id);
          }
        }
        validMessages.push(msg);
      } else if (msg.role === 'tool') {
        // Only keep if the active assistant message requested this tool call
        if (msg.toolCallId && activeToolCallIds.has(msg.toolCallId)) {
          validMessages.push(msg);
        }
        // If orphaned, drop it to prevent HTTP 400 from LLM providers
      } else {
        // User or system messages reset active tool calls
        activeToolCallIds.clear();
        validMessages.push(msg);
      }
    }

    return validMessages;
  }

  private trimHistory(): void {
    if (this.estimateTokenCount() > this.maxTokenEstimate && this.messages.length > 8) {
      this.compactHistory(Math.max(4, Math.floor(this.maxHistoryMessages / 2)));
      return;
    }

    const systemMessages = this.messages.filter((m) => m.role === 'system');
    const conversationMessages = this.messages.filter((m) => m.role !== 'system');

    if (conversationMessages.length > this.maxHistoryMessages) {
      let excess = conversationMessages.length - this.maxHistoryMessages;

      // Adjust excess index so we never cut between assistant tool_calls and tool results
      while (
        excess < conversationMessages.length &&
        conversationMessages[excess]?.role === 'tool'
      ) {
        excess++;
      }

      const pruned = conversationMessages.slice(excess);
      const validated = ContextManager.ensureAtomicIntegrity([...systemMessages, ...pruned]);
      this.messages = validated;
    }
  }
}
