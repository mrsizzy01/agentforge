import { AgentForgeRuntime } from '@agentforge/core';
import { printBanner, printHeading, printInfo, printSuccess, printWarn } from '../ui/format.js';
import pc from 'picocolors';

export async function historyCommand(runtime: AgentForgeRuntime): Promise<void> {
  printBanner();
  printHeading('AgentForge Task & Session History');

  const sessions = runtime.sessions.listSessions();
  if (sessions.length === 0) {
    printInfo('No previous task sessions found in this workspace.');
    return;
  }

  printInfo(`Found ${pc.bold(sessions.length.toString())} recorded sessions:\n`);

  for (const s of sessions) {
    const date = new Date(s.createdAt).toLocaleString();
    const statusColor =
      s.status === 'completed'
        ? pc.green(s.status)
        : s.status === 'rolled_back'
          ? pc.yellow(s.status)
          : pc.cyan(s.status);

    // eslint-disable-next-line no-console
    console.log(
      `  ID: ${pc.bold(s.id)} [${statusColor}] (${pc.dim(date)})\n` +
        `  Task: "${s.task}"\n` +
        `  File Snapshots: ${s.backups.length} file(s) backed up\n`,
    );
  }

  printSuccess('To revert modifications made in a session, run: agentforge rollback <session-id>');
}
