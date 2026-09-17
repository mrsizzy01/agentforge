import { AgentForgeRuntime } from '@agentforge/core';
import { LLMProviderFactory } from '@agentforge/llm';
import { ReActAgent, TestFixEngine, AgentStepEvent } from '@agentforge/agent';
import {
  printBanner,
  printHeading,
  printInfo,
  printSuccess,
  printWarn,
  printError,
} from '../ui/format.js';
import pc from 'picocolors';

export interface FixCommandOptions {
  testCommand?: string;
  maxRetries?: number;
}

export async function fixCommand(
  runtime: AgentForgeRuntime,
  options: FixCommandOptions = {},
): Promise<void> {
  printBanner();
  printHeading('Autonomous Test-and-Repair Engine');

  const config = runtime.configManager.getConfig();
  const providerType = config.provider.type;

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
      `No AI provider API key found for "${providerType}".\n` +
        `Set OPENAI_API_KEY or configure Ollama: agentforge config set provider.type ollama`,
    );
    return;
  }

  let provider;
  try {
    provider = LLMProviderFactory.create({
      type: providerType,
      apiKey: config.provider.apiKey,
      baseUrl: config.provider.baseUrl,
      model: config.provider.model,
      temperature: 0.1, // Low temperature for code fixing
      maxTokens: config.provider.maxTokens,
    });
  } catch (err) {
    printError(
      `Provider initialization failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  const agent = new ReActAgent(runtime, provider);
  const instructions = runtime.getProjectInstructions();
  await agent.initialize(instructions);

  const engine = new TestFixEngine(runtime, agent);

  const testCmd = options.testCommand || 'npm test';
  printInfo(`Target test command: ${pc.bold(testCmd)}`);

  const onEvent = (event: AgentStepEvent) => {
    if (event.thought) {
      // eslint-disable-next-line no-console
      console.log(pc.cyan(`\n[THINK] `) + event.thought.trim());
    }

    if (event.toolCall) {
      const args = JSON.stringify(event.toolCall.arguments);
      // eslint-disable-next-line no-console
      console.log(
        pc.yellow(`[TOOL] `) +
          pc.bold(event.toolCall.name) +
          pc.dim(` ${args.length > 100 ? args.slice(0, 100) + '...' : args}`),
      );
    }

    if (event.toolResult) {
      const badge = event.toolResult.success ? pc.green('[OK]') : pc.red('[FAIL]');
      const preview = event.toolResult.output.trim();
      // eslint-disable-next-line no-console
      console.log(
        `  ${badge} ` + pc.dim(preview.length > 150 ? preview.slice(0, 150) + '...' : preview),
      );
    }
  };

  const onStatusUpdate = (status: string) => {
    // eslint-disable-next-line no-console
    console.log(status);
  };

  const fixResult = await engine.runAndFix({
    testCommand: testCmd,
    maxRetries: options.maxRetries || 3,
    onEvent,
    onStatusUpdate,
  });

  if (fixResult.success) {
    printHeading('Repair Finished');
    printSuccess(`All tests passing successfully! (Retries needed: ${fixResult.retriesAttempted})`);
  } else {
    printHeading('Repair Incomplete');
    printError(
      `Could not automatically resolve all test failures after ${fixResult.retriesAttempted} attempts.`,
    );
  }
}
