import { Command } from 'commander';
import { AgentForgeRuntime } from '@agentforge/core';
import { doctorCommand } from './commands/doctor.js';
import { initCommand } from './commands/init.js';
import { configCommand } from './commands/config.js';
import { toolsCommand } from './commands/tools.js';
import { gitCommand } from './commands/git.js';
import { runCommand } from './commands/run.js';
import { chatCommand } from './commands/chat.js';
import { fixCommand } from './commands/fix.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('agentforge')
    .description('AgentForge - Open-source AI agents for real software development')
    .version('0.1.0', '-v, --version', 'Output the current version of AgentForge')
    .option('--non-interactive', 'Run without prompting for confirmations')
    .option('--cwd <path>', 'Specify custom workspace root directory');

  const getRuntime = (cmd: Command): AgentForgeRuntime => {
    const parentOpts = cmd.optsWithGlobals();
    return new AgentForgeRuntime({
      workspaceRoot: parentOpts.cwd,
      isInteractive: !parentOpts.nonInteractive,
    });
  };

  program
    .command('doctor')
    .description('Check workspace health, dependencies, permissions, and tool readiness')
    .action(async (_options, cmd) => {
      const runtime = getRuntime(cmd);
      const code = await doctorCommand(runtime);
      if (code !== 0) process.exit(code);
    });

  program
    .command('init')
    .description(
      'Initialize AgentForge configuration (.agentforge/) and AGENTFORGE.md in current project',
    )
    .action(async (_options, cmd) => {
      const runtime = getRuntime(cmd);
      await initCommand(runtime);
    });

  program
    .command('config [action] [key] [value]')
    .description('View or update configuration (actions: list, get, set)')
    .option('-g, --global', 'Target global configuration (~/.agentforge/)')
    .action(async (action, key, value, options, cmd) => {
      const runtime = getRuntime(cmd);
      await configCommand(runtime, action || 'list', key, value, options);
    });

  program
    .command('tools [action] [toolName]')
    .description(
      'List available agent tools or inspect their JSON schemas (actions: list, inspect)',
    )
    .action(async (action, toolName, _options, cmd) => {
      const runtime = getRuntime(cmd);
      await toolsCommand(runtime, action || 'list', toolName);
    });

  program
    .command('git <action>')
    .description('Execute safe Git operations (actions: status, diff, log, commit)')
    .option('-s, --staged', 'View staged diff')
    .option('-m, --message <message>', 'Commit message')
    .option('-a, --all', 'Stage all modified files before committing')
    .option('-n, --count <n>', 'Number of commits in log', '10')
    .action(async (action, options, cmd) => {
      const runtime = getRuntime(cmd);
      await gitCommand(runtime, action, options);
    });

  program
    .command('run <task>')
    .description('Run an autonomous agent task on the repository')
    .option('--max-steps <n>', 'Maximum reasoning steps', '25')
    .option('--model <model>', 'Override model identifier')
    .option('--temperature <temp>', 'Sampling temperature')
    .action(async (task, options, cmd) => {
      const runtime = getRuntime(cmd);
      await runCommand(runtime, task, {
        maxSteps: options.maxSteps ? parseInt(options.maxSteps, 10) : undefined,
        model: options.model,
        temperature: options.temperature ? parseFloat(options.temperature) : undefined,
      });
    });

  program
    .command('fix [testCommand]')
    .description('Run project test suite and autonomously repair failing code')
    .option('--max-retries <n>', 'Maximum repair attempts', '3')
    .action(async (testCommand, options, cmd) => {
      const runtime = getRuntime(cmd);
      await fixCommand(runtime, {
        testCommand,
        maxRetries: options.maxRetries ? parseInt(options.maxRetries, 10) : undefined,
      });
    });

  program
    .command('chat')
    .description('Interactive conversation session with AgentForge')
    .action(async (_options, cmd) => {
      const runtime = getRuntime(cmd);
      await chatCommand(runtime);
    });

  return program;
}
