import pc from 'picocolors';

export function printBanner(): void {
  // eslint-disable-next-line no-console
  console.log(
    pc.bold(pc.cyan('AgentForge')) +
      pc.dim(' v0.1.0') +
      ' — ' +
      pc.italic('Understand. Build. Test. Ship.\n'),
  );
}

export function printSuccess(message: string): void {
  // eslint-disable-next-line no-console
  console.log(pc.green('✓ ') + message);
}

export function printInfo(message: string): void {
  // eslint-disable-next-line no-console
  console.log(pc.cyan('● ') + message);
}

export function printWarn(message: string): void {
  // eslint-disable-next-line no-console
  console.log(pc.yellow('▲ ') + message);
}

export function printError(message: string): void {
  // eslint-disable-next-line no-console
  console.error(pc.red('✖ ') + message);
}

export function printHeading(title: string): void {
  // eslint-disable-next-line no-console
  console.log(pc.bold(`\n${title}`));
}
