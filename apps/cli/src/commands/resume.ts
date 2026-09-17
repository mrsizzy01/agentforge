import { AgentForgeRuntime } from '@agentforge/core';
import { LLMProviderFactory, ChatMessage } from '@agentforge/llm';
import { ReActAgent, AgentStepEvent } from '@agentforge/agent';
import {
  printBanner,
  printHeading,
  printInfo,
  printSuccess,
  printWarn,
  printError,
} from '../ui/format.js';
import pc from 'picocolors';
import prompts from 'prompts';

export interface ResumeCommandOptions {
  model?: string;
  temperature?: number;
  maxSteps?: number;
}

export async function resumeCommand(
  runtime: AgentForgeRuntime,
  sessionId?: string,
  options: ResumeCommandOptions = {},
): Promise<void> {
  printBanner();

  const targetSession = sessionId
    ? runtime.sessions.getSession(sessionId)
    : runtime.sessions.getLatestSession();

  if (!targetSession) {
    printWarn(
      sessionId
        ? `Session "${sessionId}" was not found.`
        : 'No previous AgentForge sessions found to resume. Start a new task with: agentforge run "<task>"',
    );
    return;
  }

  printHeading(`Resuming Session: ${targetSession.id}`);
  printInfo(`Original Task: "${targetSession.task}"`);
  printInfo(`Status: ${targetSession.status}`);
  printInfo(`Created: ${new Date(targetSession.createdAt).toLocaleString()}`);
  printInfo(`Files modified/backed up: ${targetSession.backups.length}`);

  const rawMessages = runtime.sessions.loadSessionMessages(targetSession.id);
  if (!rawMessages || rawMessages.length === 0) {
    printWarn('No saved conversation context was found for this session.');
    return;
  }

  printSuccess(`Restored ${rawMessages.length} conversation messages into working memory.`);

  const config = runtime.configManager.getConfig();
  const providerType = config.provider.type;
  const model = options.model || config.provider.model;

  let provider;
  try {
    provider = LLMProviderFactory.create({
      type: providerType,
      apiKey: config.provider.apiKey,
      baseUrl: config.provider.baseUrl,
      model,
      temperature: options.temperature ?? config.provider.temperature,
      maxTokens: config.provider.maxTokens,
    });
  } catch (err) {
    printError(`AI Provider initialization failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const agent = new ReActAgent(runtime, provider);
  agent.getContext().setMessages(rawMessages as ChatMessage[]);

  const followUp = await prompts({
    type: 'text',
    name: 'prompt',
    message: pc.cyan('Next instruction (press Enter to continue previous task):'),
  });

  const nextTask = followUp.prompt?.trim() || `Continue working on the objective: "${targetSession.task}"`;

  printHeading(`Executing Follow-up: "${nextTask}"`);

  const onEvent = async (event: AgentStepEvent) => {
    if (event.thought) {
      // eslint-disable-next-line no-console
      console.log(pc.cyan(`\n[THINK] `) + event.thought.trim());
    }

    if (event.toolCall) {
      const toolName = event.toolCall.name;
      if (['write_file', 'edit_file', 'apply_patch', 'delete_file'].includes(toolName)) {
        const filePath = (event.toolCall.arguments as { path?: string }).path;
        if (filePath) {
          await runtime.sessions.recordFileBackup(targetSession.id, filePath);
        }
      }

      const argsPreview = JSON.stringify(event.toolCall.arguments);
      // eslint-disable-next-line no-console
      console.log(
        pc.yellow(`[TOOL] `) +
          pc.bold(event.toolCall.name) +
          pc.dim(` ${argsPreview.length > 120 ? argsPreview.slice(0, 120) + '...' : argsPreview}`),
      );
    }

    if (event.toolResult) {
      const statusBadge = event.toolResult.success ? pc.green('[OK]') : pc.red('[FAIL]');
      const preview = event.toolResult.output.trim();
      // eslint-disable-next-line no-console
      console.log(
        `  ${statusBadge} ` +
          pc.dim(preview.length > 200 ? preview.slice(0, 200) + '...' : preview),
      );
    }
  };

  const confirmAction = async (promptMessage: string, details?: Record<string, unknown>): Promise<boolean> => {
    if (!runtime.isInteractive) return false;
    // eslint-disable-next-line no-console
    console.log(pc.yellow(`\n[SECURITY] Security confirmation required`));
    if (details) {
      // eslint-disable-next-line no-console
      console.log(pc.dim(JSON.stringify(details, null, 2)));
    }
    const res = await prompts({
      type: 'confirm',
      name: 'value',
      message: promptMessage,
      initial: false,
    });
    return !!res.value;
  };

  const result = await agent.runTask(nextTask, {
    maxSteps: options.maxSteps || 25,
    onEvent,
    confirmAction,
  });

  runtime.sessions.saveSessionMessages(targetSession.id, agent.getContext().getMessages());
  runtime.sessions.completeSession(targetSession.id, result.success ? 'completed' : 'failed');

  if (result.success) {
    printHeading('Task Execution Completed');
    printSuccess(result.finalAnswer || 'Task completed successfully.');
    printInfo(`Steps executed: ${result.stepsExecuted}`);
  } else {
    printHeading('Task Execution Stopped');
    if (result.error) printError(result.error);
    if (result.finalAnswer) {
      // eslint-disable-next-line no-console
      console.log(result.finalAnswer);
    }
  }
}
