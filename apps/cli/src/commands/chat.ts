import readline from 'node:readline';
import { AgentForgeRuntime } from '@agentforge/core';
import { LLMProviderFactory, LLMUsage } from '@agentforge/llm';
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

interface ChatSession {
  turnCount: number;
  totalTokens: number;
  history: string[];
}

export async function chatCommand(runtime: AgentForgeRuntime): Promise<void> {
  printBanner();
  printHeading('Interactive AgentForge Session');

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
    printError(`Provider initialization failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const agent = new ReActAgent(runtime, provider);
  const instructions = runtime.getProjectInstructions();
  await agent.initialize(instructions);

  const session: ChatSession = { turnCount: 0, totalTokens: 0, history: [] };

  // Set up readline with command history support
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 100,
  });

  // Restore history from session
  const historyProp = (rl as unknown as { history: string[] }).history;
  if (Array.isArray(historyProp)) {
    historyProp.push(...session.history);
  }

  printInfo(
    `Provider: ${pc.bold(providerType)} | Model: ${pc.bold(config.provider.model || 'default')}`,
  );
  printInfo(`Type ${pc.bold('/help')} for commands, ${pc.bold('/exit')} to quit.\n`);

  const onEvent = (event: AgentStepEvent) => {
    if (event.thought) {
      process.stdout.write(pc.cyan(`\n[THINK] `) + event.thought.trim() + '\n');
    }
    if (event.toolCall) {
      const args = JSON.stringify(event.toolCall.arguments);
      process.stdout.write(
        pc.yellow(`[TOOL] `) +
          pc.bold(event.toolCall.name) +
          pc.dim(` ${args.length > 100 ? args.slice(0, 100) + '...' : args}`) +
          '\n',
      );
    }
    if (event.toolResult) {
      const badge = event.toolResult.success ? pc.green('[OK]') : pc.red('[FAIL]');
      const preview = event.toolResult.output.trim();
      process.stdout.write(
        `  ${badge} ` + pc.dim(preview.length > 150 ? preview.slice(0, 150) + '...' : preview) + '\n',
      );
    }
  };

  const showHelp = () => {
    console.log(`
${pc.bold('Available commands:')}
  ${pc.cyan('/help')}         Show this help message
  ${pc.cyan('/tools')}        List all registered tools
  ${pc.cyan('/clear')}        Reset conversation context (keep system prompt)
  ${pc.cyan('/history')}      Show current session turn history
  ${pc.cyan('/tokens')}       Show token usage for this session
  ${pc.cyan('/status')}       Show agent and provider status
  ${pc.cyan('/exit')}         Exit the interactive session
`);
  };

  const prompt = (): Promise<string> => {
    return new Promise((resolve) => {
      const turnLabel = pc.dim(`(${session.turnCount + 1})`);
      rl.question(`${pc.cyan('agentforge')} ${turnLabel}${pc.cyan('>')} `, resolve);
    });
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let command: string;
    try {
      command = (await prompt()).trim();
    } catch {
      // Ctrl+D or closed stdin
      break;
    }

    if (!command) continue;

    // Add to readline history
    if (Array.isArray(historyProp) && command !== historyProp[0]) {
      historyProp.unshift(command);
      if (historyProp.length > 100) historyProp.pop();
    }

    // --- Special commands ---
    if (command === '/exit' || command === '/quit') {
      printInfo('Exiting AgentForge session. Goodbye!');
      break;
    }

    if (command === '/help') {
      showHelp();
      continue;
    }

    if (command === '/tools') {
      const descriptors = runtime.tools.getDescriptors();
      console.log(`\n${pc.bold('Registered Tools')} (${descriptors.length}):`);
      for (const d of descriptors) {
        console.log(`  ${pc.bold(d.name)} ${pc.dim(`(${d.category})`)} — ${d.description}`);
      }
      console.log('');
      continue;
    }

    if (command === '/clear') {
      agent.getContext().clearNonSystem();
      printSuccess('Conversation context reset. Starting fresh.');
      session.turnCount = 0;
      continue;
    }

    if (command === '/history') {
      if (session.history.length === 0) {
        printInfo('No history yet in this session.');
      } else {
        console.log(`\n${pc.bold('Session history:')}`);
        session.history.forEach((h, i) => console.log(`  ${pc.dim(`${i + 1}.`)} ${h}`));
        console.log('');
      }
      continue;
    }

    if (command === '/tokens') {
      console.log(
        `\n${pc.bold('Session usage:')} ${session.totalTokens.toLocaleString()} total tokens across ${session.turnCount} turns\n`,
      );
      continue;
    }

    if (command === '/status') {
      const msgCount = agent.getContext().getMessages().length;
      const estTokens = agent.getContext().estimateTokenCount();
      console.log(`
${pc.bold('Agent Status:')}
  Provider:    ${providerType} / ${config.provider.model || 'default'}
  Context:     ${msgCount} messages (~${estTokens.toLocaleString()} tokens estimated)
  Turns:       ${session.turnCount}
  Total tokens: ${session.totalTokens.toLocaleString()}
`);
      continue;
    }

    // --- Run agent task ---
    session.history.push(command);
    session.turnCount++;

    let taskUsage: LLMUsage | undefined;
    const result = await agent.runTask(command, {
      maxSteps: 25,
      onEvent,
      onToken: (tok) => process.stdout.write(tok),
    });

    if (taskUsage) {
      session.totalTokens += taskUsage.totalTokens;
      const tokenInfo = pc.dim(
        ` [${taskUsage.totalTokens.toLocaleString()} tokens | ` +
          `session total: ${session.totalTokens.toLocaleString()}]`,
      );
      console.log(tokenInfo);
    }

    if (result.success) {
      console.log(`\n${pc.bold(pc.green('●'))} ${result.finalAnswer}\n`);
    } else {
      printError(result.error || 'Task did not finish successfully.');
    }
  }

  rl.close();

  // Save session on exit
  if (session.turnCount > 0) {
    try {
      const sessionRecord = runtime.sessions.startSession('chat', runtime.workspaceRoot);
      await runtime.sessions.saveSessionMessages(sessionRecord.id, agent.getContext().getMessages());
      printInfo(`Session saved (ID: ${pc.dim(sessionRecord.id)}). Resume with: agentforge resume ${sessionRecord.id}`);
    } catch {
      // Session save is non-critical
    }
  }
}
