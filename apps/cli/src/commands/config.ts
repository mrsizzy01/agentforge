import { AgentForgeRuntime } from '@agentforge/core';
import { printBanner, printHeading, printSuccess, printError } from '../ui/format.js';
import pc from 'picocolors';

export async function configCommand(
  runtime: AgentForgeRuntime,
  action: 'get' | 'set' | 'list',
  key?: string,
  value?: string,
  options: { global?: boolean } = {},
): Promise<void> {
  const scope = options.global ? 'global' : 'workspace';

  if (action === 'list' || !action) {
    printBanner();
    printHeading(`Configuration (${scope}):`);
    const cfg = runtime.configManager.getConfig();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(cfg, null, 2));
    return;
  }

  if (action === 'get') {
    if (!key) {
      printError('Key is required for "config get <key>"');
      process.exit(1);
    }
    const val = runtime.configManager.get(key);
    if (val === undefined) {
      // eslint-disable-next-line no-console
      console.log(pc.dim(`Key "${key}" is not set.`));
    } else {
      // eslint-disable-next-line no-console
      console.log(typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val));
    }
    return;
  }

  if (action === 'set') {
    if (!key || value === undefined) {
      printError('Key and value are required for "config set <key> <value>"');
      process.exit(1);
    }

    try {
      let parsedVal: unknown = value;
      if (value === 'true') parsedVal = true;
      else if (value === 'false') parsedVal = false;
      else if (!isNaN(Number(value)) && value.trim() !== '') parsedVal = Number(value);

      runtime.configManager.set(key, parsedVal, scope);
      printSuccess(`Updated ${pc.bold(key)} = ${pc.green(String(value))} (${scope})`);
    } catch (err) {
      printError(`Failed to update configuration: ${(err as Error).message}`);
      process.exit(1);
    }
  }
}
