import path from 'node:path';
import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext } from '@agentforge/types';
import { WorkspaceFilesystem } from '@agentforge/filesystem';

const InputSchema = z.object({
  path: z.string().describe('Relative path to the source file to outline'),
});

type Input = z.infer<typeof InputSchema>;

export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'method'
  | 'enum'
  | 'struct'
  | 'trait'
  | 'impl'
  | 'export';

export interface SymbolOutlineItem {
  line: number;
  kind: SymbolKind;
  name: string;
  signature: string;
  docComment?: string;
}

export class GetFileOutlineTool extends BaseTool<
  Input,
  { path: string; language: string; symbols: SymbolOutlineItem[]; totalSymbols: number }
> {
  public readonly name = 'get_file_outline';
  public readonly description =
    'Extract structural symbols (classes, interfaces, types, functions, methods, structs, traits) from source files across TS/JS, Python, Go, and Rust. Highly token-efficient.';
  public readonly category = 'read' as const;
  public readonly inputSchema = InputSchema;
  public readonly requiresConfirmation = false;

  private fs: WorkspaceFilesystem;

  constructor(fs: WorkspaceFilesystem) {
    super();
    this.fs = fs;
  }

  public static detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ts':
      case '.tsx':
      case '.mts':
      case '.cts':
        return 'typescript';
      case '.js':
      case '.jsx':
      case '.mjs':
      case '.cjs':
        return 'javascript';
      case '.py':
      case '.pyw':
        return 'python';
      case '.go':
        return 'go';
      case '.rs':
        return 'rust';
      default:
        return 'generic';
    }
  }

  public async run(
    input: Input,
    _context: ToolContext,
  ): Promise<{ path: string; language: string; symbols: SymbolOutlineItem[]; totalSymbols: number }> {
    const content = await this.fs.readFile(input.path);
    const language = GetFileOutlineTool.detectLanguage(input.path);
    const symbols = GetFileOutlineTool.parseSymbols(content, language);

    return {
      path: input.path,
      language,
      symbols,
      totalSymbols: symbols.length,
    };
  }

  public static parseSymbols(content: string, language: string): SymbolOutlineItem[] {
    const lines = content.split(/\r?\n/);
    const symbols: SymbolOutlineItem[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) {
        continue;
      }

      // Check preceding doc comment
      let docComment: string | undefined;
      if (i > 0) {
        const prev = lines[i - 1].trim();
        if (prev.startsWith('///') || prev.startsWith('//') || prev.endsWith('*/') || prev.startsWith('#')) {
          docComment = prev.replace(/^(\/\/\/|\/\/|\/\*+|\*+|\#)\s*/, '').replace(/\*\/$/, '').trim();
        }
      }

      // 1. Python Parser
      if (language === 'python') {
        const classMatch = line.match(/^\s*class\s+([A-Za-z0-9_]+)(?:\(([^)]*)\))?:/);
        if (classMatch) {
          symbols.push({
            line: i + 1,
            kind: 'class',
            name: classMatch[1],
            signature: trimmed.replace(/:$/, ''),
            docComment,
          });
          continue;
        }

        const funcMatch = line.match(/^\s*(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/);
        if (funcMatch) {
          const isMethod = line.search(/\S/) > 0;
          symbols.push({
            line: i + 1,
            kind: isMethod ? 'method' : 'function',
            name: funcMatch[1],
            signature: trimmed.replace(/:$/, ''),
            docComment,
          });
          continue;
        }
      }

      // 2. Go Parser
      if (language === 'go') {
        const methodMatch = line.match(/^func\s+\((?:[^)]+)\)\s+([A-Za-z0-9_]+)\s*\(/);
        if (methodMatch) {
          symbols.push({
            line: i + 1,
            kind: 'method',
            name: methodMatch[1],
            signature: trimmed.replace(/\s*\{?\s*$/, ''),
            docComment,
          });
          continue;
        }

        const funcMatch = line.match(/^func\s+([A-Za-z0-9_]+)\s*\(/);
        if (funcMatch) {
          symbols.push({
            line: i + 1,
            kind: 'function',
            name: funcMatch[1],
            signature: trimmed.replace(/\s*\{?\s*$/, ''),
            docComment,
          });
          continue;
        }

        const structMatch = line.match(/^type\s+([A-Za-z0-9_]+)\s+struct/);
        if (structMatch) {
          symbols.push({
            line: i + 1,
            kind: 'struct',
            name: structMatch[1],
            signature: `type ${structMatch[1]} struct`,
            docComment,
          });
          continue;
        }

        const interfaceMatch = line.match(/^type\s+([A-Za-z0-9_]+)\s+interface/);
        if (interfaceMatch) {
          symbols.push({
            line: i + 1,
            kind: 'interface',
            name: interfaceMatch[1],
            signature: `type ${interfaceMatch[1]} interface`,
            docComment,
          });
          continue;
        }
      }

      // 3. Rust Parser
      if (language === 'rust') {
        const fnMatch = line.match(/^\s*(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)/);
        if (fnMatch) {
          symbols.push({
            line: i + 1,
            kind: 'function',
            name: fnMatch[1],
            signature: trimmed.replace(/\s*\{?\s*$/, ''),
            docComment,
          });
          continue;
        }

        const structMatch = line.match(/^\s*(?:pub(?:\([^)]+\))?\s+)?struct\s+([A-Za-z0-9_]+)/);
        if (structMatch) {
          symbols.push({
            line: i + 1,
            kind: 'struct',
            name: structMatch[1],
            signature: trimmed.replace(/\s*\{?\s*$/, ''),
            docComment,
          });
          continue;
        }

        const traitMatch = line.match(/^\s*(?:pub(?:\([^)]+\))?\s+)?trait\s+([A-Za-z0-9_]+)/);
        if (traitMatch) {
          symbols.push({
            line: i + 1,
            kind: 'trait',
            name: traitMatch[1],
            signature: trimmed.replace(/\s*\{?\s*$/, ''),
            docComment,
          });
          continue;
        }

        const implMatch = line.match(/^\s*impl(?:\s*<[^>]+>)?\s+(?:([A-Za-z0-9_]+)\s+for\s+)?([A-Za-z0-9_]+)/);
        if (implMatch) {
          symbols.push({
            line: i + 1,
            kind: 'impl',
            name: implMatch[2] || implMatch[1],
            signature: trimmed.replace(/\s*\{?\s*$/, ''),
            docComment,
          });
          continue;
        }

        const enumMatch = line.match(/^\s*(?:pub(?:\([^)]+\))?\s+)?enum\s+([A-Za-z0-9_]+)/);
        if (enumMatch) {
          symbols.push({
            line: i + 1,
            kind: 'enum',
            name: enumMatch[1],
            signature: trimmed.replace(/\s*\{?\s*$/, ''),
            docComment,
          });
          continue;
        }
      }

      // 4. TypeScript / JavaScript Parser (and fallback)
      const tsInterface = line.match(/^\s*(?:export\s+)?interface\s+([A-Za-z0-9_]+)/);
      if (tsInterface) {
        symbols.push({
          line: i + 1,
          kind: 'interface',
          name: tsInterface[1],
          signature: trimmed.replace(/\s*\{?\s*$/, ''),
          docComment,
        });
        continue;
      }

      const tsClass = line.match(/^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_]+)/);
      if (tsClass) {
        symbols.push({
          line: i + 1,
          kind: 'class',
          name: tsClass[1],
          signature: trimmed.replace(/\s*\{?\s*$/, ''),
          docComment,
        });
        continue;
      }

      const tsType = line.match(/^\s*(?:export\s+)?type\s+([A-Za-z0-9_]+)/);
      if (tsType) {
        symbols.push({
          line: i + 1,
          kind: 'type',
          name: tsType[1],
          signature: trimmed.replace(/;?\s*$/, ''),
          docComment,
        });
        continue;
      }

      const tsEnum = line.match(/^\s*(?:export\s+)?enum\s+([A-Za-z0-9_]+)/);
      if (tsEnum) {
        symbols.push({
          line: i + 1,
          kind: 'enum',
          name: tsEnum[1],
          signature: trimmed.replace(/\s*\{?\s*$/, ''),
          docComment,
        });
        continue;
      }

      const tsFunc = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/);
      if (tsFunc) {
        symbols.push({
          line: i + 1,
          kind: 'function',
          name: tsFunc[1],
          signature: trimmed.replace(/\s*\{?\s*$/, ''),
          docComment,
        });
        continue;
      }

      const tsArrow = line.match(/^\s*(?:export\s+)?(?:const|let)\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*(?::\s*[^=]+)?\s*=>/);
      if (tsArrow) {
        symbols.push({
          line: i + 1,
          kind: 'function',
          name: tsArrow[1],
          signature: trimmed.replace(/\s*=>.*$/, ' => ...'),
          docComment,
        });
        continue;
      }

      const tsMethod = line.match(/^\s*(?:public|private|protected|static|override|readonly)*\s*(?:async\s+)?([A-Za-z0-9_]+)\s*\([^)]*\)(?:\s*:\s*[^{;]+)?\s*[{;]/);
      if (tsMethod && !['if', 'for', 'while', 'switch', 'catch'].includes(tsMethod[1])) {
        symbols.push({
          line: i + 1,
          kind: 'method',
          name: tsMethod[1],
          signature: trimmed.replace(/\s*[{;]\s*$/, ''),
          docComment,
        });
        continue;
      }
    }

    return symbols;
  }
}
