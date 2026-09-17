import { spawn, ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import { z } from 'zod';
import {
  JsonRpcRequest,
  JsonRpcResponse,
  McpTool,
  McpCallToolResult,
} from './protocol.js';
import { ToolDefinition, ToolContext, ToolResult } from '@agentforge/types';

export interface MCPClientOptions {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export class MCPClient {
  public readonly name: string;
  private command: string;
  private args: string[];
  private env: Record<string, string>;
  private cwd?: string;
  private process: ChildProcess | null = null;
  private nextId = 1;
  private pendingRequests: Map<
    string | number,
    {
      resolve: (value: JsonRpcResponse) => void;
      reject: (error: Error) => void;
    }
  > = new Map();

  constructor(options: MCPClientOptions) {
    this.name = options.name;
    this.command = options.command;
    this.args = options.args || [];
    this.env = options.env || {};
    this.cwd = options.cwd;
  }

  public async connect(): Promise<void> {
    if (this.process) {
      return;
    }

    this.process = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: { ...process.env, ...this.env },
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    const rl = readline.createInterface({
      input: this.process.stdout!,
      terminal: false,
    });

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const response = JSON.parse(trimmed) as JsonRpcResponse;
        if (response.id !== undefined && this.pendingRequests.has(response.id)) {
          const handler = this.pendingRequests.get(response.id)!;
          this.pendingRequests.delete(response.id);
          handler.resolve(response);
        }
      } catch {
        // Ignore unparseable non-JSON-RPC lines
      }
    });

    this.process.on('error', (err) => {
      for (const [, handler] of this.pendingRequests) {
        handler.reject(err);
      }
      this.pendingRequests.clear();
    });

    // Send initialize
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      clientInfo: {
        name: 'AgentForge',
        version: '0.1.0',
      },
      capabilities: {},
    });

    // Send notifications/initialized
    this.notify('notifications/initialized', {});
  }

  public async listTools(): Promise<McpTool[]> {
    const res = await this.request('tools/list', {});
    if (res.error) {
      throw new Error(`MCP tools/list failed: ${res.error.message}`);
    }

    const result = res.result as { tools?: McpTool[] };
    return result.tools || [];
  }

  public async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpCallToolResult> {
    const res = await this.request('tools/call', {
      name,
      arguments: args,
    });

    if (res.error) {
      return {
        content: [{ type: 'text', text: `Error: ${res.error.message}` }],
        isError: true,
      };
    }

    return res.result as unknown as McpCallToolResult;
  }

  public createAdaptedTools(): Promise<ToolDefinition[]> {
    return this.listTools().then((tools) => {
      return tools.map((mcpTool) => {
        const adaptedName = `${this.name}_${mcpTool.name}`;

        const toolDef: ToolDefinition = {
          name: adaptedName,
          description: mcpTool.description || `MCP tool from ${this.name}`,
          category: 'network',
          inputSchema: z.record(z.unknown()),
          requiresConfirmation: true,
          execute: async (
            input: unknown,
            _context: ToolContext,
          ): Promise<ToolResult> => {
            const start = Date.now();
            try {
              const res = await this.callTool(
                mcpTool.name,
                (input as Record<string, unknown>) || {},
              );
              const textContent = res.content.map((c) => c.text).join('\n');
              return {
                success: !res.isError,
                data: textContent,
                error: res.isError ? textContent : undefined,
                executionTimeMs: Date.now() - start,
              };
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              return {
                success: false,
                error: msg,
                executionTimeMs: Date.now() - start,
              };
            }
          },
        };

        return toolDef;
      });
    });
  }

  public disconnect(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  private request(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        return reject(new Error('MCPClient is not connected.'));
      }

      const id = this.nextId++;
      this.pendingRequests.set(id, { resolve, reject });

      const payload: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.process.stdin.write(JSON.stringify(payload) + '\n');
    });
  }

  private notify(method: string, params?: Record<string, unknown>): void {
    if (!this.process || !this.process.stdin) return;

    const payload: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.process.stdin.write(JSON.stringify(payload) + '\n');
  }
}
