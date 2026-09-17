import { AgentForgeRuntime } from '@agentforge/core';
import { printBanner, printHeading, printSuccess, printInfo } from '../ui/format.js';
import pc from 'picocolors';

export async function initCommand(runtime: AgentForgeRuntime): Promise<void> {
  printBanner();
  printHeading('Initializing AgentForge in workspace:');
  // eslint-disable-next-line no-console
  console.log(pc.dim(runtime.workspaceRoot) + '\n');

  const { createdConfig, createdInstructions } = runtime.initWorkspace();

  if (createdConfig) {
    printSuccess(`Created configuration at ${pc.bold('.agentforge/config.json')}`);
  } else {
    printInfo(`Configuration already exists at ${pc.bold('.agentforge/config.json')}`);
  }

  if (createdInstructions) {
    printSuccess(`Created project instructions template at ${pc.bold('AGENTFORGE.md')}`);
  } else {
    printInfo(`Project instructions file ${pc.bold('AGENTFORGE.md')} already present`);
  }

  const isRepo = await runtime.git.isGitRepo();
  if (isRepo) {
    const status = await runtime.git.status();
    printSuccess(`Git repository ready on branch ${pc.bold(status.branch)}`);
  } else {
    printInfo(
      `Git is not initialized. Consider running ${pc.bold('git init')} to enable full version control.`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    pc.cyan(
      '\nWorkspace initialized successfully! Run `agentforge doctor` to verify system health.',
    ),
  );
}
