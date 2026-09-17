import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ConfigManager, loadProjectInstructions } from '../src/index.js';

describe('ConfigManager', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentforge-cfg-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('loads default configuration when no config files exist', () => {
    const manager = new ConfigManager(tempDir);
    const config = manager.getConfig();

    expect(config.version).toBe('0.1.0');
    expect(config.security.permissionLevel).toBe('interactive');
    expect(config.provider.type).toBe('openai');
    expect(config.provider.model).toBe('gpt-4o');
  });

  it('retrieves nested properties with dot notation', () => {
    const manager = new ConfigManager(tempDir);
    expect(manager.get('security.permissionLevel')).toBe('interactive');
    expect(manager.get('provider.model')).toBe('gpt-4o');
    expect(manager.get('non.existent.key')).toBeUndefined();
  });

  it('updates and persists configuration', () => {
    const manager = new ConfigManager(tempDir);
    manager.set('provider.type', 'ollama');
    manager.set('provider.model', 'llama3');

    expect(manager.get('provider.type')).toBe('ollama');
    expect(manager.get('provider.model')).toBe('llama3');

    // Check that file was created in .agentforge/config.json
    const configFile = path.join(tempDir, '.agentforge', 'config.json');
    expect(fs.existsSync(configFile)).toBe(true);

    // Verify reloading reads persisted values
    const reloaded = new ConfigManager(tempDir);
    expect(reloaded.get('provider.type')).toBe('ollama');
  });

  it('loads project instructions from AGENTFORGE.md', () => {
    const filePath = path.join(tempDir, 'AGENTFORGE.md');
    fs.writeFileSync(filePath, '# Custom instructions\nUse pnpm.');

    const instructions = loadProjectInstructions(tempDir);
    expect(instructions).toContain('# Custom instructions');
    expect(instructions).toContain('Use pnpm.');
  });
});
