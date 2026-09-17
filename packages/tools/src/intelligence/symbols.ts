import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext } from '@agentforge/types';
import { WorkspaceFilesystem } from '@agentforge/filesystem';
import { GetFileOutlineTool, SymbolOutlineItem } from './outline.js';

const InputSchema = z.object({
  query: z.string().describe('Name or prefix of the symbol to find (e.g. "UserAuth", "executeCommand")'),
  fileExtensions: z
    .array(z.string())
    .optional()
    .describe('Optional file extensions to restrict search, e.g. [".ts", ".js", ".py"]'),
});

type Input = z.infer<typeof InputSchema>;

export interface SymbolSearchResult {
  file: string;
  symbol: SymbolOutlineItem;
}

export class FindSymbolsTool extends BaseTool<Input, { matches: SymbolSearchResult[]; totalMatches: number }> {
  public readonly name = 'find_symbols';
  public readonly description =
    'Find declarations of functions, classes, interfaces, or types by name across the entire workspace.';
  public readonly category = 'read' as const;
  public readonly inputSchema = InputSchema;
  public readonly requiresConfirmation = false;

  private fs: WorkspaceFilesystem;
  private outlineTool: GetFileOutlineTool;

  constructor(fs: WorkspaceFilesystem) {
    super();
    this.fs = fs;
    this.outlineTool = new GetFileOutlineTool(fs);
  }

  public async run(
    input: Input,
    context: ToolContext,
  ): Promise<{ matches: SymbolSearchResult[]; totalMatches: number }> {
    const files = await this.fs.listDirectory('.', { recursive: true });

    const exts = input.fileExtensions || [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.py',
      '.go',
      '.rs',
      '.java',
      '.c',
      '.cpp',
    ];

    const targetFiles = files.filter(
      (f) => f.isFile && exts.some((ext) => f.name.endsWith(ext)),
    );

    const queryLower = input.query.toLowerCase();
    const matches: SymbolSearchResult[] = [];

    for (const file of targetFiles) {
      const normalizedPath = file.relativePath.replace(/\\/g, '/');
      const outline = await this.outlineTool.execute({ path: normalizedPath }, context);
      if (outline.success && outline.data) {
        for (const sym of outline.data.symbols) {
          if (sym.signature.toLowerCase().includes(queryLower)) {
            matches.push({
              file: normalizedPath,
              symbol: sym,
            });
          }
        }
      }
    }

    return {
      matches,
      totalMatches: matches.length,
    };
  }
}
