import { AgentForgeRuntime } from '@agentforge/core';
import {
  printBanner,
  printHeading,
  printInfo,
  printSuccess,
  printWarn,
  printError,
} from '../ui/format.js';
import pc from 'picocolors';

export interface RollbackOptions {
  sessionId?: string;
  git?: boolean;
  list?: boolean;
}

export async function rollbackCommand(
  runtime: AgentForgeRuntime,
  targetId?: string,
  options: RollbackOptions = {},
): Promise<void> {
  printBanner();
  printHeading('AgentForge Rollback & Undo Engine');

  const isRepo = await runtime.git.isGitRepo();

  // If user asks to list checkpoints / sessions
  if (options.list) {
    if (isRepo) {
      const checkpoints = await runtime.git.listCheckpoints();
      if (checkpoints.length > 0) {
        console.log(pc.cyan(`\nGit Checkpoint(s):`));
        for (const cp of checkpoints) {
          console.log(`  ${pc.bold(cp.ref)}  ${pc.green(cp.id)}  ${pc.yellow(`[${cp.label}]`)}`);
        }
      } else {
        printInfo('No Git checkpoints found.');
      }
    }

    const sessions = runtime.sessions.listSessions();
    if (sessions.length > 0) {
      console.log(pc.cyan(`\nSession Snapshot(s):`));
      for (const s of sessions.slice(0, 5)) {
        console.log(`  ${pc.bold(s.id)}  ${pc.dim(new Date(s.createdAt).toLocaleString())}  ${pc.dim(s.task.slice(0, 40))}`);
      }
    }
    return;
  }

  // 1. Check if user specified a Git checkpoint or requested --git
  if (options.git || (targetId && targetId.startsWith('cp_'))) {
    if (!isRepo) {
      printError('Workspace is not a Git repository.');
      return;
    }

    try {
      printInfo(`Restoring Git checkpoint ${targetId || 'latest'}...`);
      await runtime.git.restoreCheckpoint(targetId);
      printSuccess('Git workspace restored to checkpoint successfully!');
      return;
    } catch (err) {
      printError(`Git rollback failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
  }

  // 2. Default: Rollback session file backups + Git if available
  const result = await runtime.sessions.rollback(targetId);

  if (!result.success) {
    // If session rollback had no files, try Git rollback if available
    if (isRepo) {
      try {
        printInfo('No session backup found; falling back to Git checkpoint restoration...');
        await runtime.git.restoreCheckpoint(targetId);
        printSuccess('Workspace restored via Git successfully!');
        return;
      } catch (err) {
        printError(`Rollback failed: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }
    printError(result.error || 'Failed to rollback session.');
    return;
  }

  printSuccess('Session rollback completed successfully!');
  if (result.restoredFiles.length > 0) {
    printInfo(`Restored ${result.restoredFiles.length} file(s) to previous snapshot:`);
    for (const f of result.restoredFiles) {
      console.log(`  ✓ ${pc.dim(f)}`);
    }
  } else {
    printInfo('No modified files required restoration.');
  }
}
