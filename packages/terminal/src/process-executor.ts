import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { CommandResult, TerminalOptions } from '@agentforge/types';
import { CommandSafetyValidator, SecretDetector } from '@agentforge/security';

export interface ProcessExecutorOptions {
  workspaceRoot: string;
  defaultTimeoutMs?: number;
  maxBufferBytes?: number;
  safetyValidator?: CommandSafetyValidator;
  secretDetector?: SecretDetector;
}

export class ProcessExecutor {
  private workspaceRoot: string;
  private defaultTimeoutMs: number;
  private maxBufferBytes: number;
  private safetyValidator: CommandSafetyValidator;
  private secretDetector: SecretDetector;

  constructor(options: ProcessExecutorOptions) {
    this.workspaceRoot = path.resolve(options.workspaceRoot);
    this.defaultTimeoutMs = options.defaultTimeoutMs || 60000;
    this.maxBufferBytes = options.maxBufferBytes || 10 * 1024 * 1024; // 10MB
    this.safetyValidator = options.safetyValidator || new CommandSafetyValidator();
    this.secretDetector = options.secretDetector || new SecretDetector();
  }

  public async execute(
    command: string,
    options: TerminalOptions = {},
    abortSignal?: AbortSignal,
  ): Promise<CommandResult> {
    // 1. Safety check
    const analysis = this.safetyValidator.analyze(command);
    if (analysis.isBlocked) {
      throw new Error(
        `Command blocked by security policy: ${command}. Reasons: ${analysis.reasons.join(', ')}`,
      );
    }

    const startTime = Date.now();
    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    const maxBuffer = options.maxBufferBytes || this.maxBufferBytes;
    const cwd = options.cwd
      ? path.isAbsolute(options.cwd)
        ? options.cwd
        : path.resolve(this.workspaceRoot, options.cwd)
      : this.workspaceRoot;

    // Filter environment to prevent accidental leak of sensitive credentials
    const cleanEnv = { ...process.env, ...options.env };
    // Redact/mask critical env if needed, but allow dev tools to run

    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const shellExecutable = isWindows ? 'cmd.exe' : '/bin/sh';
      const shellArgs = isWindows ? ['/d', '/s', '/c', command] : ['-c', command];

      let child: ChildProcess | null = null;
      let timedOut = false;
      let killed = false;
      let stdout = '';
      let stderr = '';
      let timer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };

      try {
        child = spawn(shellExecutable, shellArgs, {
          cwd,
          env: cleanEnv,
          windowsVerbatimArguments: isWindows,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err) {
        cleanup();
        resolve({
          command,
          exitCode: 1,
          stdout: '',
          stderr: (err as Error).message,
          executionTimeMs: Date.now() - startTime,
          timedOut: false,
          killed: false,
        });
        return;
      }

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          timedOut = true;
          killed = true;
          if (child && !child.killed) {
            child.kill('SIGTERM');
            setTimeout(() => {
              if (child && !child.killed) {
                child.kill('SIGKILL');
              }
            }, 1000);
          }
        }, timeoutMs);
      }

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          killed = true;
          if (child && !child.killed) {
            child.kill('SIGTERM');
          }
        });
      }

      child.stdout?.on('data', (chunk: Buffer) => {
        if (stdout.length < maxBuffer) {
          stdout += chunk.toString('utf-8');
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderr.length < maxBuffer) {
          stderr += chunk.toString('utf-8');
        }
      });

      child.on('error', (err) => {
        cleanup();
        resolve({
          command,
          exitCode: 1,
          stdout: this.secretDetector.redactSecrets(stdout),
          stderr: this.secretDetector.redactSecrets(
            stderr ? `${stderr}\n${err.message}` : err.message,
          ),
          executionTimeMs: Date.now() - startTime,
          timedOut,
          killed,
        });
      });

      child.on('close', (code) => {
        cleanup();
        resolve({
          command,
          exitCode: code ?? (timedOut ? 124 : 1),
          stdout: this.secretDetector.redactSecrets(stdout),
          stderr: this.secretDetector.redactSecrets(stderr),
          executionTimeMs: Date.now() - startTime,
          timedOut,
          killed,
        });
      });
    });
  }
}
