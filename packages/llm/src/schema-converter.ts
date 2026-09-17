import { ToolDescriptor } from '@agentforge/types';

export interface OpenAIToolFormat {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AnthropicToolFormat {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export class SchemaConverter {
  /**
   * Sanitizes a JSON schema to ensure compatibility with LLM API providers.
   * Removes unsupported keywords like $schema, additionalProperties if not boolean, etc.
   */
  public static sanitizeSchema(rawSchema: Record<string, unknown>): Record<string, unknown> {
    const cleaned: Record<string, unknown> = {
      type: 'object',
      properties: {},
      required: [],
    };

    if (
      rawSchema.type === 'object' &&
      typeof rawSchema.properties === 'object' &&
      rawSchema.properties !== null
    ) {
      cleaned.properties = rawSchema.properties;
    }

    if (Array.isArray(rawSchema.required)) {
      cleaned.required = rawSchema.required;
    }

    // Default to strict or permissive object
    cleaned.additionalProperties = false;

    return cleaned;
  }

  public static toOpenAITools(descriptors: ToolDescriptor[]): OpenAIToolFormat[] {
    return descriptors.map((d) => ({
      type: 'function' as const,
      function: {
        name: d.name,
        description: d.description,
        parameters: this.sanitizeSchema(d.inputSchemaJson),
      },
    }));
  }

  public static toAnthropicTools(descriptors: ToolDescriptor[]): AnthropicToolFormat[] {
    return descriptors.map((d) => ({
      name: d.name,
      description: d.description,
      input_schema: this.sanitizeSchema(d.inputSchemaJson),
    }));
  }

  public static toGeminiTools(descriptors: ToolDescriptor[]): {
    functionDeclarations: GeminiFunctionDeclaration[];
  } {
    return {
      functionDeclarations: descriptors.map((d) => ({
        name: d.name,
        description: d.description,
        parameters: this.sanitizeSchema(d.inputSchemaJson),
      })),
    };
  }
}
