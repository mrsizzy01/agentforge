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

export async function chatCommand(runtime: AgentForgeRuntime): Promise<void> {
  printBanner();
  printHeading('Interactive AgentForge Session');
  printInfo(`Type your question or instruction. Type ${pc.bold('/exit')} to quit.`);

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
      temperature: config.provider.temperature,
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

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await prompts({
      type: 'text',
      name: 'prompt',
      message: pc.cyan('agentforge>'),
    });

    if (!input.prompt) {
      continue;
    }

    const command = input.prompt.trim();

    if (command === '/exit' || command === '/quit') {
      printInfo('Exiting AgentForge session. Goodbye!');
      break;
    }

    if (command === '/help') {
      // eslint-disable-next-line no-console
      console.log(`
Available commands:
  /help     Show this help message
  /tools    List active tools registered in runtime
  /clear    Clear conversation memory
  /exit     Exit the interactive session
`);
      continue;
    }

    if (command === '/tools') {
      const descriptors = runtime.tools.getDescriptors();
      // eslint-disable-next-line no-console
      console.log('\nRegistered Tools:');
      for (const d of descriptors) {
        // eslint-disable-next-line no-console
        console.log(`  - ${pc.bold(d.name)} (${pc.dim(d.category)}): ${d.description}`);
      }
      continue;
    }

    if (command === '/clear') {
      agent.getContext().clearNonSystem();
      printSuccess('Conversation context reset.');
      continue;
    }

    const result = await agent.runTask(command, {
      maxSteps: 20,
      onEvent,
    });

    if (result.success) {
      // eslint-disable-next-line no-console
      console.log(`\n${result.finalAnswer}\n`);
    } else {
      printError(result.error || 'Task did not finish successfully.');
    }
  }
}
