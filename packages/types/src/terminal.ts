export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
  timedOut: boolean;
  killed: boolean;
}

export interface TerminalOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxBufferBytes?: number;
  shell?: string | boolean;
}

export type CommandClassification = 'safe' | 'needs_approval' | 'dangerous';

export interface CommandSafetyAnalysis {
  classification: CommandClassification;
  command: string;
  reasons: string[];
  isBlocked: boolean;
  requiresConfirmation: boolean;
}
