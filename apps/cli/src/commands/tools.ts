import { AgentForgeRuntime } from '@agentforge/core';
import { printBanner, printHeading, printError } from '../ui/format.js';
import pc from 'picocolors';

export async function toolsCommand(
  runtime: AgentForgeRuntime,
  action: 'list' | 'inspect' = 'list',
  toolName?: string,
): Promise<void> {
  printBanner();

  if (action === 'inspect') {
    if (!toolName) {
      printError('Tool name is required for "agentforge tools inspect <toolName>"');
      process.exit(1);
    }
    const descriptors = runtime.registry.getDescriptors();
    const found = descriptors.find((d: { name: string }) => d.name === toolName);
    if (!found) {
      printError(`Tool "${toolName}" not found in registry.`);
      process.exit(1);
    }

    printHeading(`Tool: ${pc.bold(found.name)} [${found.category}]`);
    // eslint-disable-next-line no-console
    console.log(pc.italic(found.description) + '\n');
    // eslint-disable-next-line no-console
    console.log(pc.bold('Input Schema (JSON Schema):'));
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(found.inputSchemaJson, null, 2));
    return;
  }

  // Default: list tools
  printHeading('Registered AgentForge Tools:');
  const descriptors = runtime.registry.getDescriptors();

  for (const tool of descriptors) {
    const confirmTag = tool.requiresConfirmation
      ? pc.yellow('[Requires confirmation]')
      : pc.green('[Auto-run]');
    const categoryTag = pc.cyan(`[${tool.category.toUpperCase()}]`);

    // eslint-disable-next-line no-console
    console.log(`  ${pc.bold(tool.name.padEnd(18))} ${categoryTag.padEnd(12)} ${confirmTag.padEnd(26)} ${pc.dim(tool.description)}`);
  }

  // eslint-disable-next-line no-console
  console.log(pc.dim(`\nTotal: ${descriptors.length} tools available. Run \`agentforge tools inspect <name>\` for schema details.`));
}
