import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext } from '@agentforge/types';
import { WorkspaceFilesystem } from '@agentforge/filesystem';

const InputSchema = z.object({
  path: z.string().describe('Relative path to the source file to outline'),
});

type Input = z.infer<typeof InputSchema>;

export interface SymbolOutlineItem {
  line: number;
  kind: 'function' | 'class' | 'interface' | 'type' | 'method' | 'enum' | 'export';
  signature: string;
}

export class GetFileOutlineTool extends BaseTool<Input, { symbols: SymbolOutlineItem[]; totalSymbols: number }> {
  public readonly name = 'get_file_outline';
  public readonly description =
    'Extract structural symbols (classes, interfaces, types, functions, methods, exports) from a source file without reading the whole file body. Highly token-efficient.';
  public readonly category = 'read' as const;
  public readonly inputSchema = InputSchema;
  public readonly requiresConfirmation = false;

  private fs: WorkspaceFilesystem;

  constructor(fs: WorkspaceFilesystem) {
    super();
    this.fs = fs;
  }

  public async run(
    input: Input,
    _context: ToolContext,
  ): Promise<{ symbols: SymbolOutlineItem[]; totalSymbols: number }> {
    const content = await this.fs.readFile(input.path);
    const lines = content.split(/\r?\n/);
    const symbols: SymbolOutlineItem[] = [];

    // Regex patterns for key symbols across JS, TS, Python, Go, Rust
    const patterns: Array<{ kind: SymbolOutlineItem['kind']; regex: RegExp }> = [
      { kind: 'interface', regex: /^\s*(?:export\s+)?interface\s+([A-Za-z0-9_]+(?:\s*<[^>]+>)?)/ },
      {
        kind: 'class',
        regex:
          /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_]+(?:\s*<[^>]+>)?(?:\s+extends\s+[^{]+)?(?:\s+implements\s+[^{]+)?)/,
      },
      { kind: 'type', regex: /^\s*(?:export\s+)?type\s+([A-Za-z0-9_]+(?:\s*<[^>]+>)?\s*=)/ },
      { kind: 'enum', regex: /^\s*(?:export\s+)?enum\s+([A-Za-z0-9_]+)/ },
      {
        kind: 'function',
        regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+\s*\([^)]*\)(?:\s*:\s*[^{]+)?)/,
      },
      {
        kind: 'function',
        regex:
          /^\s*(?:export\s+)?const\s+([A-Za-z0-9_]+\s*=\s*(?:async\s*)?\([^)]*\)(?:\s*:\s*[^=>]+)?\s*=>)/,
      },
      { kind: 'function', regex: /^\s*def\s+([A-Za-z0-9_]+\s*\([^)]*\)(?:\s*->\s*[^:]+)?:)/ }, // Python
      { kind: 'function', regex: /^\s*fn\s+([A-Za-z0-9_]+(?:\s*<[^>]+>)?\s*\([^)]*\)(?:\s*->\s*[^{]+)?)/ }, // Rust
      { kind: 'function', regex: /^\s*func\s+(?:\([^)]+\)\s*)?([A-Za-z0-9_]+\s*\([^)]*\)[^{]*)/ }, // Go
      {
        kind: 'method',
        regex:
          /^\s*(?:public|private|protected|static|override|readonly)*\s*(?:async\s+)?([A-Za-z0-9_]+\s*\([^)]*\)(?:\s*:\s*[^{]+)?)\s*[{;]/,
      },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) {
        continue;
      }

      for (const p of patterns) {
        const match = line.match(p.regex);
        if (match) {
          symbols.push({
            line: i + 1,
            kind: p.kind,
            signature: match[0].trim().replace(/\s*[{;]\s*$/, ''),
          });
          break;
        }
      }
    }

    return {
      symbols,
      totalSymbols: symbols.length,
    };
  }
}
