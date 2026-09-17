#!/usr/bin/env node
import { createCli } from './cli.js';

const cli = createCli();
cli.parseAsync(process.argv).catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
