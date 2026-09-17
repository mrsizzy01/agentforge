import { AgentForgeRuntime } from '@agentforge/core';
import { printBanner, printHeading, printInfo, printSuccess, printError } from '../ui/format.js';
import pc from 'picocolors';

export async function rollbackCommand(
  runtime: AgentForgeRuntime,
  sessionId?: string,
): Promise<void> {
  printBanner();
  printHeading('Session Rollback Engine');

  const result = await runtime.sessions.rollback(sessionId);

  if (!result.success) {
    printError(result.error || 'Failed to rollback session.');
    return;
  }

  printSuccess(`Rollback completed successfully!`);
  if (result.restoredFiles.length > 0) {
    printInfo(`Restored ${result.restoredFiles.length} file(s) to previous snapshot:`);
    for (const f of result.restoredFiles) {
      // eslint-disable-next-line no-console
      console.log(`  ✓ ${pc.dim(f)}`);
    }
  } else {
    printInfo('No modified files required restoration.');
  }
}
