import fs from 'node:fs';
import path from 'node:path';
import { AgentForgeRuntime } from '@agentforge/core';
import { McpServerConfig } from '@agentforge/types';
import { MCPClient } from './client.js';

export class MCPClientManager {
  private runtime: AgentForgeRuntime;
  private clients: Map<string, MCPClient> = new Map();

  constructor(runtime: AgentForgeRuntime) {
    this.runtime = runtime;
  }

  /**
   * Connects to all configured MCP servers and registers their tools in the runtime registry.
   * Checks both the passed servers map and the optional `.agentforge/mcp.json` file.
   */
  public async connectAll(
    configServers: Record<string, McpServerConfig> = {},
  ): Promise<number> {
    const servers: Record<string, McpServerConfig> = { ...configServers };

    // Also check .agentforge/mcp.json if present
    const mcpJsonPath = path.join(this.runtime.workspaceRoot, '.agentforge', 'mcp.json');
    if (fs.existsSync(mcpJsonPath)) {
      try {
        const raw = fs.readFileSync(mcpJsonPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
          Object.assign(servers, parsed.mcpServers);
        }
      } catch {
        // Ignore malformed mcp.json
      }
    }

    let totalToolsRegistered = 0;

    for (const [name, cfg] of Object.entries(servers)) {
      try {
        const client = new MCPClient({
          name,
          command: cfg.command,
          args: cfg.args || [],
          env: cfg.env || {},
          cwd: cfg.cwd || this.runtime.workspaceRoot,
        });

        await client.connect();
        const tools = await client.createAdaptedTools();

        for (const tool of tools) {
          // Avoid collision if tool name already registered
          if (!this.runtime.registry.has(tool.name)) {
            this.runtime.registry.register(tool);
            totalToolsRegistered++;
          }
        }

        this.clients.set(name, client);
      } catch {
        // Non-fatal if an external MCP server fails to connect
      }
    }

    return totalToolsRegistered;
  }

  public getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }

  public disconnectAll(): void {
    for (const client of this.clients.values()) {
      try {
        client.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    }
    this.clients.clear();
  }
}
