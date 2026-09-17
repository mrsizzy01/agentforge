import fs from 'node:fs';
import path from 'node:path';
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

export interface WatchCommandOptions {
  /** Glob patterns to watch (relative to workspace root). Default: src/**\/*.ts */
  patterns?: string[];
  /** Task to run on change. Default: run the test suite */
  task?: string;
  /** Debounce delay in ms before triggering (default: 500) */
  debounceMs?: number;
}

export async function watchCommand(
  runtime: AgentForgeRuntime,
  options: WatchCommandOptions = {},
): Promise<void> {
  printBanner();
  printHeading('AgentForge Watch Mode');

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
      temperature: 0.1,
      maxTokens: config.provider.maxTokens,
    });
  } catch (err) {
    printError(`Provider initialization failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const debounceMs = options.debounceMs ?? 500;
  const watchDirs = resolveWatchDirs(runtime.workspaceRoot, options.patterns);
  const defaultTask =
    options.task ||
    'Run the project test suite and report which tests are failing. If there are failures, identify the root cause.';

  printInfo(`Watching: ${watchDirs.map((d) => pc.bold(path.relative(runtime.workspaceRoot, d))).join(', ')}`);
  printInfo(`Task on change: ${pc.bold(defaultTask)}`);
  printInfo(`Press ${pc.bold('Ctrl+C')} to stop.\n`);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let isRunning = false;
  let changeCount = 0;

  const onEvent = (event: AgentStepEvent) => {
    if (event.thought) {
      process.stdout.write(pc.cyan(`[THINK] `) + event.thought.trim() + '\n');
    }
    if (event.toolCall) {
      const args = JSON.stringify(event.toolCall.arguments);
      process.stdout.write(
        pc.yellow(`[TOOL] `) +
          pc.bold(event.toolCall.name) +
          pc.dim(` ${args.length > 80 ? args.slice(0, 80) + '...' : args}`) +
          '\n',
      );
    }
    if (event.toolResult) {
      const badge = event.toolResult.success ? pc.green('[OK]') : pc.red('[FAIL]');
      const preview = event.toolResult.output.trim();
      process.stdout.write(
        `  ${badge} ${pc.dim(preview.length > 120 ? preview.slice(0, 120) + '...' : preview)}\n`,
      );
    }
  };

  const triggerRun = async (changedFile: string) => {
    if (isRunning) {
      printInfo(`[watch] Still running — queuing next run after current finishes.`);
      return;
    }

    isRunning = true;
    changeCount++;
    const timestamp = new Date().toLocaleTimeString();

    console.log('');
    printHeading(`[watch #${changeCount}] ${timestamp} — ${path.relative(runtime.workspaceRoot, changedFile)} changed`);

    const agent = new ReActAgent(runtime, provider);
    const instructions = runtime.getProjectInstructions();
    await agent.initialize(instructions);

    const taskWithContext = `${defaultTask}\n\nContext: The file "${path.relative(runtime.workspaceRoot, changedFile)}" was just modified.`;

    try {
      const result = await agent.runTask(taskWithContext, { maxSteps: 20, onEvent });

      if (result.success) {
        printSuccess(`[watch #${changeCount}] Done — ${result.stepsExecuted} steps`);
        console.log(`\n${result.finalAnswer}\n`);
      } else {
        printError(`[watch #${changeCount}] Agent failed: ${result.error}`);
      }
    } catch (err) {
      printError(`[watch] Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      isRunning = false;
    }
  };

  // Watch all resolved directories using native fs.watch
  const watchers: fs.FSWatcher[] = [];

  for (const watchDir of watchDirs) {
    if (!fs.existsSync(watchDir)) continue;

    try {
      const watcher = fs.watch(watchDir, { recursive: true }, (eventType, filename) => {
        if (!filename || !isWatchableFile(filename)) return;

        const fullPath = path.join(watchDir, filename);

        // Debounce: reset timer on every event
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          triggerRun(fullPath).catch((err) =>
            printError(`Watch error: ${err instanceof Error ? err.message : String(err)}`),
          );
        }, debounceMs);
      });

      watchers.push(watcher);
    } catch {
      printWarn(`Cannot watch directory: ${watchDir}`);
    }
  }

  if (watchers.length === 0) {
    printError('No valid directories to watch. Check your --patterns option.');
    return;
  }

  // Keep process alive until Ctrl+C
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      console.log('');
      printInfo('Watch mode stopped.');
      for (const w of watchers) w.close();
      resolve();
    });
    process.on('SIGTERM', () => {
      for (const w of watchers) w.close();
      resolve();
    });
  });
}

/**
 * Resolve directories to watch from pattern list.
 * Converts patterns like "src/**\/*.ts" → "src/" directory.
 */
function resolveWatchDirs(workspaceRoot: string, patterns?: string[]): string[] {
  const defaultPatterns = ['src'];
  const rawPatterns = patterns ?? defaultPatterns;

  const dirs = new Set<string>();
  for (const pattern of rawPatterns) {
    // Strip glob parts — watch the base directory
    const basePart = pattern.replace(/[*?{[\\].*$/, '').replace(/\/$/, '');
    const resolved = path.resolve(workspaceRoot, basePart || '.');

    // Fall back to workspace root if base doesn't exist
    const target = fs.existsSync(resolved) ? resolved : workspaceRoot;
    dirs.add(target);
  }

  return [...dirs];
}

/**
 * Only trigger on meaningful source file changes — ignore temp/build artifacts.
 */
function isWatchableFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  const watchedExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.go', '.rs', '.java', '.kt',
    '.json', '.yaml', '.yml', '.toml', '.md',
  ]);

  const ignoredPatterns = ['.tmp', '.swp', '~', '.DS_Store', 'thumbs.db'];
  if (ignoredPatterns.some((p) => filename.includes(p))) return false;

  // Ignore dist/build output
  if (filename.includes('dist/') || filename.includes('build/') || filename.includes('.agentforge/'))
    return false;

  return watchedExtensions.has(ext);
}
