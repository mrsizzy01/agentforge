import { AgentForgeRuntime } from '@agentforge/core';
import { printBanner, printHeading, printInfo, printSuccess } from '../ui/format.js';
import pc from 'picocolors';

export async function runCommand(runtime: AgentForgeRuntime, task: string): Promise<void> {
  printBanner();
  printHeading(`Task: "${task}"`);

  printInfo(`Analyzing workspace at: ${pc.dim(runtime.workspaceRoot)}`);
  const status = await runtime.git.status();
  if (status.isRepo) {
    printSuccess(`Repository detected (Branch: ${pc.bold(status.branch)})`);
  }

  const tools = runtime.registry.getAll();
  printSuccess(`${tools.length} execution tools ready in runtime.`);

  // eslint-disable-next-line no-console
  console.log(
    pc.cyan(
      '\n[Phase 1 Foundation Ready]\n' +
        'Monorepo, Security sandbox, Filesystem, Safe Terminal, and Git tools are fully active.\n' +
        'LLM Orchestration is scheduled for Phase 2, and the Autonomous Planner Loop is scheduled for Phase 3.\n',
    ),
  );
}
