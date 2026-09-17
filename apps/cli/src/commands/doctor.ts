import { AgentForgeRuntime } from '@agentforge/core';
import { printBanner, printHeading, printSuccess, printWarn, printError } from '../ui/format.js';
import pc from 'picocolors';

export async function doctorCommand(runtime: AgentForgeRuntime): Promise<number> {
  printBanner();
  printHeading('System Diagnostics');

  let hasIssues = false;

  // 1. Node.js check
  const nodeVersion = process.version;
  const majorNode = parseInt(nodeVersion.replace('v', '').split('.')[0], 10);
  if (majorNode >= 20) {
    printSuccess(`Node.js runtime: ${pc.bold(nodeVersion)} (Supported LTS)`);
  } else {
    printWarn(`Node.js runtime: ${pc.bold(nodeVersion)} (Node.js 20+ recommended)`);
  }

  // 2. Git check
  const isGitRepo = await runtime.git.isGitRepo();
  if (isGitRepo) {
    const status = await runtime.git.status();
    printSuccess(`Git repository detected on branch: ${pc.bold(status.branch)}`);
  } else {
    printWarn('Current workspace is not a Git repository (Run `git init` or `agentforge init`)');
  }

  // 3. Workspace access check
  try {
    const testFile = `.agentforge-doctor-test-${Date.now()}.tmp`;
    await runtime.fs.writeFile(testFile, 'ok');
    await runtime.fs.deleteFile(testFile);
    printSuccess(`Workspace filesystem access: ${pc.dim(runtime.workspaceRoot)}`);
  } catch (err) {
    hasIssues = true;
    printError(`Workspace filesystem error: ${(err as Error).message}`);
  }

  // 4. Configuration & Permissions
  const config = runtime.configManager.getConfig();
  printSuccess(`Security permission mode: ${pc.bold(config.security.permissionLevel)}`);

  // 5. Provider check
  const provider = config.provider;
  if (provider.apiKey) {
    printSuccess(`AI Provider configured: ${pc.bold(provider.type)} (${pc.bold(provider.model)})`);
  } else if (provider.type === 'ollama' || provider.type === 'lmstudio') {
    printSuccess(`Local AI Provider configured: ${pc.bold(provider.type)} (${pc.bold(provider.model)})`);
  } else {
    printWarn(`AI Provider API key not set (set OPENAI_API_KEY or use \`agentforge config set provider.type ollama\`)`);
  }

  // 6. Tools registry
  const tools = runtime.registry.getAll();
  printSuccess(`Registered tools available: ${pc.bold(tools.length.toString())} active tools`);

  // 7. Project instructions
  const instructions = runtime.getProjectInstructions();
  if (instructions) {
    printSuccess(`Project instructions detected: ${pc.bold('AGENTFORGE.md')}`);
  } else {
    printWarn('No AGENTFORGE.md found (Run `agentforge init` to generate one)');
  }

  // eslint-disable-next-line no-console
  console.log('\n' + (hasIssues ? pc.red('✖ Diagnostics completed with issues.') : pc.green('✓ All core foundation checks passed.')));
  return hasIssues ? 1 : 0;
}
