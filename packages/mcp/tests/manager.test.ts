import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MCPClientManager } from '../src/index.js';
import { AgentForgeRuntime } from '@agentforge/core';

describe('MCPClientManager', () => {
  let tempDir: string;
  let runtime: AgentForgeRuntime;
  let manager: MCPClientManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentforge-mcp-manager-'));
    runtime = new AgentForgeRuntime({
      workspaceRoot: tempDir,
      isInteractive: false,
    });
    manager = new MCPClientManager(runtime);
  });

  afterEach(() => {
    manager.disconnectAll();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('initializes and manages empty server configuration gracefully', async () => {
    const loaded = await manager.connectAll({});
    expect(loaded).toBe(0);
    expect(manager.getConnectedServers()).toEqual([]);
  });

  it('reads optional .agentforge/mcp.json without crashing if empty or absent', async () => {
    const dotDir = path.join(tempDir, '.agentforge');
    fs.mkdirSync(dotDir, { recursive: true });
    fs.writeFileSync(path.join(dotDir, 'mcp.json'), JSON.stringify({ mcpServers: {} }));

    const loaded = await manager.connectAll();
    expect(loaded).toBe(0);
  });
});
