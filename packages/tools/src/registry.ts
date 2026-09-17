import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition, ToolDescriptor } from '@agentforge/types';

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  public register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool with name "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  public get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public has(name: string): boolean {
    return this.tools.has(name);
  }

  public getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  public getDescriptors(): ToolDescriptor[] {
    return this.getAll().map((tool) => {
      const jsonSchema = zodToJsonSchema(tool.inputSchema, {
        target: 'openApi3',
        $refStrategy: 'none',
      }) as Record<string, unknown>;

      return {
        name: tool.name,
        description: tool.description,
        category: tool.category,
        inputSchemaJson: jsonSchema,
        requiresConfirmation: !!tool.requiresConfirmation,
      };
    });
  }
}
