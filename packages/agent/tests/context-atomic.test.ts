import { describe, it, expect } from 'vitest';
import { ContextManager } from '../src/context.js';
import { ChatMessage } from '@agentforge/llm';

describe('ContextManager Atomic Transactions', () => {
  it('purges orphaned tool messages that have no preceding assistant tool_call', () => {
    const corrupted: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'hello' },
      // Orphaned tool message
      { role: 'tool', toolCallId: 'orphan_123', name: 'read_file', content: 'data' },
      // Valid transaction
      {
        role: 'assistant',
        content: 'I will read',
        toolCalls: [{ id: 'call_abc', name: 'read_file', arguments: { path: 'a.txt' } }],
      },
      { role: 'tool', toolCallId: 'call_abc', name: 'read_file', content: 'file content' },
    ];

    const validated = ContextManager.ensureAtomicIntegrity(corrupted);

    expect(validated).toHaveLength(4);
    const toolMsgs = validated.filter((m) => m.role === 'tool');
    expect(toolMsgs).toHaveLength(1);
    expect(toolMsgs[0].toolCallId).toBe('call_abc');
  });

  it('preserves full assistant toolCall + tool results during compaction', () => {
    const cm = new ContextManager({ maxHistoryMessages: 6 });
    cm.addUserMessage('Goal: solve problem');

    for (let i = 1; i <= 5; i++) {
      cm.addAssistantMessage(`Step ${i}`, [
        { id: `call_${i}`, name: 'read_file', arguments: { path: `f${i}.txt` } },
      ]);
      cm.addToolResult(`call_${i}`, 'read_file', `content ${i}`);
    }

    // Force compaction
    cm.compactHistory(4);

    const msgs = cm.getMessages();
    const validated = ContextManager.ensureAtomicIntegrity(msgs);
    expect(validated.length).toBe(msgs.length); // No orphans created
  });
});
