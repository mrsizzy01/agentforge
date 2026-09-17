import { AgentForgeRuntime } from '@agentforge/core';
import { printBanner, printHeading, printSuccess, printError, printWarn } from '../ui/format.js';
import pc from 'picocolors';

export async function gitCommand(
  runtime: AgentForgeRuntime,
  action: 'status' | 'diff' | 'log' | 'commit',
  options: { staged?: boolean; message?: string; all?: boolean; count?: string } = {},
): Promise<void> {
  const isRepo = await runtime.git.isGitRepo();
  if (!isRepo) {
    printError('Current workspace is not a Git repository. Run `git init` first.');
    process.exit(1);
  }

  if (action === 'status' || !action) {
    printBanner();
    const status = await runtime.git.status();
    printHeading(`Git Status (Branch: ${pc.bold(status.branch)})`);

    if (status.clean) {
      printSuccess('Working tree is clean. Nothing to commit.');
      return;
    }

    if (status.stagedFiles.length > 0) {
      // eslint-disable-next-line no-console
      console.log(pc.green('\nChanges to be committed:'));
      status.stagedFiles.forEach((f: string) => console.log(pc.green(`  staged:   ${f}`)));
    }

    if (status.modifiedFiles.length > 0) {
      // eslint-disable-next-line no-console
      console.log(pc.yellow('\nChanges not staged for commit:'));
      status.modifiedFiles.forEach((f: string) => console.log(pc.yellow(`  modified: ${f}`)));
    }

    if (status.untrackedFiles.length > 0) {
      // eslint-disable-next-line no-console
      console.log(pc.red('\nUntracked files:'));
      status.untrackedFiles.forEach((f: string) => console.log(pc.red(`  untracked: ${f}`)));
    }
    return;
  }

  if (action === 'diff') {
    const diffText = await runtime.git.diff({ staged: options.staged });
    if (!diffText.trim()) {
      printWarn(options.staged ? 'No staged changes found.' : 'No unstaged changes found.');
    } else {
      // eslint-disable-next-line no-console
      console.log(diffText);
    }
    return;
  }

  if (action === 'log') {
    const count = options.count ? parseInt(options.count, 10) : 10;
    const entries = await runtime.git.log(count);
    printBanner();
    printHeading(`Recent Commits (last ${entries.length}):`);
    for (const entry of entries) {
      // eslint-disable-next-line no-console
      console.log(
        `${pc.yellow(entry.shortHash)} ${pc.bold(entry.message)} ${pc.dim(`by ${entry.author} on ${entry.date}`)}`,
      );
    }
    return;
  }

  if (action === 'commit') {
    if (!options.message) {
      printError('Commit message is required (-m "message")');
      process.exit(1);
    }
    try {
      const result = await runtime.git.commit({
        message: options.message,
        stageAll: options.all,
      });
      printSuccess(`Commit created successfully:\n${result}`);
    } catch (err) {
      printError(`Commit failed: ${(err as Error).message}`);
      process.exit(1);
    }
  }
}
