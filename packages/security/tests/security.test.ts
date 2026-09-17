import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  PathValidator,
  SecretDetector,
  CommandSafetyValidator,
  PermissionManager,
  AuditLogger,
} from '../src/index.js';

describe('PathValidator', () => {
  const workspaceRoot = path.resolve('c:/test/workspace');
  const validator = new PathValidator(workspaceRoot);

  it('allows files located inside workspace root', () => {
    const res = validator.validate('src/index.ts');
    expect(res.isValid).toBe(true);
    expect(res.resolvedPath).toBe(path.resolve(workspaceRoot, 'src/index.ts'));
    expect(res.isSensitive).toBe(false);
  });

  it('blocks path traversal attempting to escape workspace', () => {
    const res = validator.validate('../../etc/passwd');
    expect(res.isValid).toBe(false);
    expect(res.reason).toContain('Access denied');
  });

  it('blocks absolute paths outside workspace', () => {
    const res = validator.validate('c:/other/project/file.txt');
    expect(res.isValid).toBe(false);
  });

  it('detects sensitive files (.env, credentials, pem)', () => {
    expect(validator.isSensitive('.env')).toBe(true);
    expect(validator.isSensitive('config/.env.local')).toBe(true);
    expect(validator.isSensitive('keys/server.pem')).toBe(true);
    expect(validator.isSensitive('src/app.ts')).toBe(false);
  });
});

describe('SecretDetector', () => {
  const detector = new SecretDetector();

  it('detects OpenAI API keys and redacts them', () => {
    const text = 'Authorization: Bearer sk-abcdef1234567890abcdef1234567890';
    expect(detector.hasSecrets(text)).toBe(true);
    const matches = detector.findSecrets(text);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].type).toBe('OpenAI API Key');

    const redacted = detector.redactSecrets(text);
    expect(redacted).not.toContain('sk-abcdef1234567890');
    expect(redacted).toContain('[REDACTED_SECRET]');
  });

  it('detects Anthropic API keys', () => {
    const text = 'api_key: sk-ant-api03-abcdef1234567890abcdef123456';
    expect(detector.hasSecrets(text)).toBe(true);
    const matches = detector.findSecrets(text);
    expect(matches[0].type).toBe('Anthropic API Key');
  });

  it('returns clean text without secrets unchanged', () => {
    const text = 'console.log("Hello, world!");';
    expect(detector.hasSecrets(text)).toBe(false);
    expect(detector.redactSecrets(text)).toBe(text);
  });
});

describe('CommandSafetyValidator', () => {
  const validator = new CommandSafetyValidator();

  it('classifies normal dev commands as safe', () => {
    expect(validator.analyze('npm test').classification).toBe('safe');
    expect(validator.analyze('git status').classification).toBe('safe');
    expect(validator.analyze('pnpm build').classification).toBe('safe');
  });

  it('blocks catastrophic commands outright', () => {
    const rootRm = validator.analyze('rm -rf /');
    expect(rootRm.isBlocked).toBe(true);
    expect(rootRm.classification).toBe('dangerous');

    const formatCmd = validator.analyze('format C: /fs:NTFS');
    expect(formatCmd.isBlocked).toBe(true);

    const shutdownCmd = validator.analyze('shutdown /s /t 0');
    expect(shutdownCmd.isBlocked).toBe(true);
  });

  it('flags sensitive operations as needing approval', () => {
    const forcePush = validator.analyze('git push --force origin main');
    expect(forcePush.requiresConfirmation).toBe(true);
    expect(forcePush.isBlocked).toBe(false);
    expect(forcePush.classification).toBe('needs_approval');
  });
});

describe('PermissionManager', () => {
  it('enforces readonly mode strictly', () => {
    const pm = new PermissionManager('readonly');
    expect(pm.evaluate({ category: 'read', toolName: 'read_file' }).verdict).toBe('allow');
    expect(pm.evaluate({ category: 'git', toolName: 'git_status' }).verdict).toBe('allow');
    expect(pm.evaluate({ category: 'write', toolName: 'write_file' }).verdict).toBe('block');
    expect(pm.evaluate({ category: 'execute', toolName: 'run_command' }).verdict).toBe('block');
  });

  it('enforces safe mode requiring confirmation for non-read operations', () => {
    const pm = new PermissionManager('safe');
    expect(pm.evaluate({ category: 'read', toolName: 'read_file' }).verdict).toBe('allow');
    expect(pm.evaluate({ category: 'write', toolName: 'write_file' }).verdict).toBe('require_confirmation');
  });

  it('blocks dangerous operations regardless of permission level', () => {
    const pm = new PermissionManager('autonomous');
    const res = pm.evaluate({
      category: 'execute',
      toolName: 'run_command',
      isDangerous: true,
    });
    expect(res.verdict).toBe('block');
  });
});

describe('AuditLogger', () => {
  it('records and returns security audit logs', () => {
    const logger = new AuditLogger(5);
    logger.log({
      action: 'read_file',
      category: 'read',
      target: 'src/index.ts',
      verdict: 'allow',
      actor: 'agent',
    });
    const records = logger.getRecords();
    expect(records.length).toBe(1);
    expect(records[0].action).toBe('read_file');
    expect(records[0].verdict).toBe('allow');
  });
});
