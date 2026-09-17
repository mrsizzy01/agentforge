import { AgentForgeRuntime } from '@agentforge/core';
import { MCPServer } from '@agentforge/mcp';

export async function mcpServeCommand(runtime: AgentForgeRuntime): Promise<void> {
  // Direct stdio server for MCP (Model Context Protocol)
  const server = new MCPServer({
    runtime,
    inputStream: process.stdin,
    outputStream: process.stdout,
  });

  server.start();
}
