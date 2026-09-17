import pc from 'picocolors';
import { SecretDetector } from '@agentforge/security';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  level?: LogLevel;
  format?: 'pretty' | 'json';
  secretDetector?: SecretDetector;
}

const LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  private level: LogLevel;
  private format: 'pretty' | 'json';
  private secretDetector: SecretDetector;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level || 'info';
    this.format = options.format || 'pretty';
    this.secretDetector = options.secretDetector || new SecretDetector();
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  public info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  public error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const errObj = error instanceof Error
      ? { errorMessage: error.message, stack: error.stack }
      : error ? { error } : {};
    this.log('error', message, { ...errObj, ...context });
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_WEIGHTS[level] >= LEVEL_WEIGHTS[this.level];
  }

  private log(level: LogLevel, rawMessage: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    // Sanitize any secrets in message
    const message = this.secretDetector.redactSecrets(rawMessage);

    if (this.format === 'json') {
      const payload = {
        timestamp: new Date().toISOString(),
        level,
        message,
        context,
      };
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(payload));
      return;
    }

    // Pretty format
    const prefix = this.getPrefix(level);
    const contextStr = context && Object.keys(context).length > 0
      ? ` ${pc.dim(JSON.stringify(context))}`
      : '';

    // eslint-disable-next-line no-console
    console.log(`${prefix} ${message}${contextStr}`);
  }

  private getPrefix(level: LogLevel): string {
    switch (level) {
      case 'debug':
        return pc.gray('● [DEBUG]');
      case 'info':
        return pc.cyan('✓ [INFO] ');
      case 'warn':
        return pc.yellow('▲ [WARN] ');
      case 'error':
        return pc.red('✖ [ERROR]');
    }
  }
}
