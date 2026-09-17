import { AgentForgeRuntime } from '@agentforge/core';
import { LLMProviderFactory } from '@agentforge/llm';
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

export interface RunCommandOptions {
  maxSteps?: number;
  model?: string;
  temperature?: number;
}

export async function runCommand(
  runtime: AgentForgeRuntime,
  task: string,
  options: RunCommandOptions = {},
): Promise<void> {
  printBanner();
  printHeading(`Task: "${task}"`);

  const config = runtime.configManager.getConfig();
  const providerType = config.provider.type;
  const model = options.model || config.provider.model;

  printInfo(`Workspace: ${pc.dim(runtime.workspaceRoot)}`);
  printInfo(`AI Provider: ${pc.bold(providerType)} | Model: ${pc.bold(model)}`);
  printInfo(`Permission Level: ${pc.bold(config.security.permissionLevel)}`);

  // Check if provider has required credentials or defaults
  const env = process.env;
  const hasKey =
    config.provider.apiKey ||
    (providerType === 'openai' && env.OPENAI_API_KEY) ||
    (providerType === 'anthropic' && env.ANTHROPIC_API_KEY) ||
    (providerType === 'google' && (env.GEMINI_API_KEY || env.GOOGLE_API_KEY)) ||
    (providerType === 'mistral' && env.MISTRAL_API_KEY) ||
    providerType === 'ollama' ||
    providerType === 'lmstudio';

  if (!hasKey) {
    printWarn(
      `No API key configured for provider "${providerType}".\n` +
        `To configure a cloud provider:\n` +
        `  $ export OPENAI_API_KEY=sk-... (or ANTHROPIC_API_KEY / GEMINI_API_KEY)\n` +
        `To use a free local model with Ollama:\n` +
        `  $ agentforge config set provider.type ollama\n` +
        `  $ agentforge config set provider.model qwen2.5-coder:7b`,
    );
    return;
  }

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
    printError(
      `Failed to initialize AI provider: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  const agent = new ReActAgent(runtime, provider);
  const instructions = runtime.getProjectInstructions();
  await agent.initialize(instructions);

  printHeading('Starting ReAct Reasoning & Execution Loop');

  const onEvent = (event: AgentStepEvent) => {
    if (event.thought) {
      // eslint-disable-next-line no-console
      console.log(pc.cyan(`\n[THINK] `) + event.thought.trim());
    }

    if (event.toolCall) {
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

  const confirmAction = async (
    promptMessage: string,
    details?: Record<string, unknown>,
  ): Promise<boolean> => {
    if (!runtime.isInteractive) {
      return false;
    }

    // eslint-disable-next-line no-console
    console.log(pc.yellow(`\n[SECURITY CONFIRMATION REQUIRED]`));
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

  const result = await agent.runTask(task, {
    maxSteps: options.maxSteps || 25,
    temperature: options.temperature,
    onEvent,
    confirmAction,
  });

  if (result.success) {
    printHeading('Task Execution Completed');
    printSuccess(result.finalAnswer || 'Task completed successfully.');
    printInfo(`Steps executed: ${result.stepsExecuted}`);
  } else {
    printHeading('Task Execution Stopped');
    if (result.error) {
      printError(result.error);
    }
    if (result.finalAnswer) {
      // eslint-disable-next-line no-console
      console.log(result.finalAnswer);
    }
  }
}
