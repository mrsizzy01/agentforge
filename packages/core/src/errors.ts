export class AgentForgeError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string = 'AGENTFORGE_ERROR',
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AgentForgeError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SecurityError extends AgentForgeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SECURITY_VIOLATION', details);
    this.name = 'SecurityError';
  }
}

export class ToolExecutionError extends AgentForgeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'TOOL_EXECUTION_ERROR', details);
    this.name = 'ToolExecutionError';
  }
}

export class ConfigurationError extends AgentForgeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', details);
    this.name = 'ConfigurationError';
  }
}
