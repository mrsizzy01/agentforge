import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MCPServer } from '../src/index.js';
import { AgentForgeRuntime } from '@agentforge/core';
import { JsonRpcRequest, JsonRpcResponse } from '../src/protocol.js';

describe('@agentforge/mcp Server', () => {
  let tempDir: string;
  let runtime: AgentForgeRuntime;
  let server: MCPServer;
  let outputStream: PassThrough;
  let sentResponses: JsonRpcResponse[];

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentforge-mcp-test-'));
    runtime = new AgentForgeRuntime({
      workspaceRoot: tempDir,
      isInteractive: false,
    });

    outputStream = new PassThrough();
    sentResponses = [];

    outputStream.on('data', (chunk) => {
      const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        sentResponses.push(JSON.parse(line));
      }
    });

    server = new MCPServer({
      runtime,
      outputStream,
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('responds to initialize request with protocolVersion and serverInfo', async () => {
    const initReq: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    };

    await server.handleRequest(initReq);

    expect(sentResponses).toHaveLength(1);
    expect(sentResponses[0].id).toBe(1);
    expect(sentResponses[0].result?.protocolVersion).toBe('2024-11-05');
    expect(sentResponses[0].result?.serverInfo).toEqual({
      name: 'AgentForge',
      version: '0.1.0',
    });
  });

  it('lists all registered AgentForge tools on tools/list', async () => {
    const listReq: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    };

    await server.handleRequest(listReq);

    expect(sentResponses).toHaveLength(1);
    const tools = sentResponses[0].result?.tools as any[];
    expect(tools).toBeDefined();
    expect(tools.length).toBe(16);

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('write_file');
    expect(toolNames).toContain('apply_patch');
    expect(toolNames).toContain('get_file_outline');
    expect(toolNames).toContain('find_symbols');
    expect(toolNames).toContain('read_url');
  });

  it('executes a tool via tools/call and returns text content block', async () => {
    fs.writeFileSync(path.join(tempDir, 'sample.txt'), 'MCP test content');

    const callReq: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'read_file',
        arguments: {
          path: 'sample.txt',
        },
      },
    };

    await server.handleRequest(callReq);

    expect(sentResponses).toHaveLength(1);
    const res = sentResponses[0];
    expect(res.id).toBe(3);
    expect(res.result?.isError).toBe(false);
    expect((res.result?.content as any[])[0].text).toBe('MCP test content');
  });
});
