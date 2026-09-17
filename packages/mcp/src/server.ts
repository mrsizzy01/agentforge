import readline from 'node:readline';
import { AgentForgeRuntime } from '@agentforge/core';
import {
  JsonRpcRequest,
  JsonRpcResponse,
  McpTool,
  MCP_ERROR_CODES,
} from './protocol.js';
import { ToolContext } from '@agentforge/types';

export interface MCPServerOptions {
  runtime: AgentForgeRuntime;
  inputStream?: NodeJS.ReadableStream;
  outputStream?: NodeJS.WritableStream;
}

export class MCPServer {
  private runtime: AgentForgeRuntime;
  private inputStream: NodeJS.ReadableStream;
  private outputStream: NodeJS.WritableStream;

  constructor(options: MCPServerOptions) {
    this.runtime = options.runtime;
    this.inputStream = options.inputStream || process.stdin;
    this.outputStream = options.outputStream || process.stdout;
  }

  public start(): void {
    const rl = readline.createInterface({
      input: this.inputStream,
      terminal: false,
    });

    rl.on('line', async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let request: JsonRpcRequest;
      try {
        request = JSON.parse(trimmed);
      } catch {
        this.sendError(
          undefined,
          MCP_ERROR_CODES.PARSE_ERROR,
          'Parse error: invalid JSON',
        );
        return;
      }

      await this.handleRequest(request);
    });
  }

  public async handleRequest(request: JsonRpcRequest): Promise<void> {
    const { id, method, params } = request;

    switch (method) {
      case 'initialize': {
        this.sendResponse(id, {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'AgentForge',
            version: '0.1.0',
          },
          capabilities: {
            tools: {},
          },
        });
        break;
      }

      case 'notifications/initialized': {
        // Notification, no reply needed
        break;
      }

      case 'ping': {
        this.sendResponse(id, {});
        break;
      }

      case 'tools/list': {
        const descriptors = this.runtime.tools.getDescriptors();
        const mcpTools: McpTool[] = descriptors.map((d) => ({
          name: d.name,
          description: d.description,
          inputSchema: (d.inputSchemaJson as any) || { type: 'object' },
        }));

        this.sendResponse(id, { tools: mcpTools });
        break;
      }

      case 'tools/call': {
        const toolName = params?.name as string;
        const toolArgs = (params?.arguments as Record<string, unknown>) || {};

        if (!toolName) {
          this.sendError(
            id,
            MCP_ERROR_CODES.INVALID_PARAMS,
            'Missing "name" in tools/call parameters',
          );
          return;
        }

        const toolContext: ToolContext = {
          workspaceRoot: this.runtime.workspaceRoot,
          isInteractive: false, // In MCP server mode, non-interactive by default
        };

        const result = await this.runtime.executor.execute(
          toolName,
          toolArgs,
          toolContext,
        );

        const textOutput = result.success
          ? typeof result.data === 'string'
            ? result.data
            : JSON.stringify(result.data, null, 2)
          : `[FAIL] ${result.error}`;

        this.sendResponse(id, {
          content: [{ type: 'text', text: textOutput }],
          isError: !result.success,
        });
        break;
      }

      default: {
        if (id !== undefined) {
          this.sendError(
            id,
            MCP_ERROR_CODES.METHOD_NOT_FOUND,
            `Method not found: ${method}`,
          );
        }
        break;
      }
    }
  }

  private sendResponse(
    id: string | number | undefined,
    result: Record<string, unknown>,
  ): void {
    if (id === undefined) return;
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      result,
    };
    this.outputStream.write(JSON.stringify(response) + '\n');
  }

  private sendError(
    id: string | number | undefined,
    code: number,
    message: string,
  ): void {
    if (id === undefined) return;
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      error: { code, message },
    };
    this.outputStream.write(JSON.stringify(response) + '\n');
  }
}
