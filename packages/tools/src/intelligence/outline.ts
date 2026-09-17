import path from 'node:path';
import ts from 'typescript';
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
    'Extract structural symbols (classes, interfaces, types, functions, methods, structs, traits) from source files using AST for TS/JS and specialized parsers for Python, Go, and Rust. Highly token-efficient.';
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
    const symbols = GetFileOutlineTool.parseSymbols(content, language, input.path);

    return {
      path: input.path,
      language,
      symbols,
      totalSymbols: symbols.length,
    };
  }

  /**
   * AST-based parser for TypeScript and JavaScript using the official TypeScript Compiler API.
   */
  public static parseTypeScriptSymbols(content: string, filePath = 'file.ts'): SymbolOutlineItem[] {
    const isTsx = filePath.endsWith('.tsx') || filePath.endsWith('.jsx');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const symbols: SymbolOutlineItem[] = [];

    const getLine = (node: ts.Node): number => {
      return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    };

    const getDocComment = (node: ts.Node): string | undefined => {
      const fullText = sourceFile.getFullText();
      const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
      if (ranges && ranges.length > 0) {
        const lastComment = ranges[ranges.length - 1];
        const raw = fullText.slice(lastComment.pos, lastComment.end).trim();
        return raw
          .replace(/^\/\*\*?|\*\/$/g, '')
          .replace(/^\s*\*+/gm, '')
          .trim();
      }
      return undefined;
    };

    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const line = getLine(node);
        const name = node.name.text;
        const heritage = node.heritageClauses
          ? ' ' + node.heritageClauses.map((h) => h.getText(sourceFile)).join(' ')
          : '';
        symbols.push({
          line,
          kind: 'class',
          name,
          signature: `class ${name}${heritage}`,
          docComment: getDocComment(node),
        });

        // Collect class methods
        for (const member of node.members) {
          if (ts.isMethodDeclaration(member) && member.name) {
            const memberLine = getLine(member);
            const memberName = member.name.getText(sourceFile);
            const params = member.parameters.map((p) => p.getText(sourceFile)).join(', ');
            const returnType = member.type ? `: ${member.type.getText(sourceFile)}` : '';
            symbols.push({
              line: memberLine,
              kind: 'method',
              name: memberName,
              signature: `${memberName}(${params})${returnType}`,
              docComment: getDocComment(member),
            });
          }
        }
      } else if (ts.isInterfaceDeclaration(node)) {
        const line = getLine(node);
        const name = node.name.text;
        const heritage = node.heritageClauses
          ? ' ' + node.heritageClauses.map((h) => h.getText(sourceFile)).join(' ')
          : '';
        symbols.push({
          line,
          kind: 'interface',
          name,
          signature: `interface ${name}${heritage}`,
          docComment: getDocComment(node),
        });
      } else if (ts.isTypeAliasDeclaration(node)) {
        const line = getLine(node);
        const name = node.name.text;
        symbols.push({
          line,
          kind: 'type',
          name,
          signature: `type ${name} = ...`,
          docComment: getDocComment(node),
        });
      } else if (ts.isEnumDeclaration(node)) {
        const line = getLine(node);
        const name = node.name.text;
        symbols.push({
          line,
          kind: 'enum',
          name,
          signature: `enum ${name}`,
          docComment: getDocComment(node),
        });
      } else if (ts.isFunctionDeclaration(node) && node.name) {
        const line = getLine(node);
        const name = node.name.text;
        const params = node.parameters.map((p) => p.getText(sourceFile)).join(', ');
        const returnType = node.type ? `: ${node.type.getText(sourceFile)}` : '';
        symbols.push({
          line,
          kind: 'function',
          name,
          signature: `function ${name}(${params})${returnType}`,
          docComment: getDocComment(node),
        });
      } else if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.initializer) {
            if (
              ts.isArrowFunction(decl.initializer) ||
              ts.isFunctionExpression(decl.initializer)
            ) {
              const line = getLine(decl);
              const name = decl.name.text;
              const params = decl.initializer.parameters
                .map((p) => p.getText(sourceFile))
                .join(', ');
              const returnType = decl.initializer.type
                ? `: ${decl.initializer.type.getText(sourceFile)}`
                : '';
              symbols.push({
                line,
                kind: 'function',
                name,
                signature: `const ${name} = (${params})${returnType} => ...`,
                docComment: getDocComment(node),
              });
            }
          }
        }
      }

      ts.forEachChild(node, (child) => {
        // Do not traverse into class children as top-level symbols
        if (!ts.isClassDeclaration(node)) {
          visit(child);
        }
      });
    };

    visit(sourceFile);
    return symbols.sort((a, b) => a.line - b.line);
  }

  public static parseSymbols(
    content: string,
    language: string,
    filePath = 'file.ts',
  ): SymbolOutlineItem[] {
    if (language === 'typescript' || language === 'javascript') {
      return GetFileOutlineTool.parseTypeScriptSymbols(content, filePath);
    }

    const lines = content.split(/\r?\n/);
    const symbols: SymbolOutlineItem[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) {
        continue;
      }

      let docComment: string | undefined;
      if (i > 0) {
        const prev = lines[i - 1].trim();
        if (
          prev.startsWith('///') ||
          prev.startsWith('//') ||
          prev.endsWith('*/') ||
          prev.startsWith('#')
        ) {
          docComment = prev
            .replace(/^(\/\/\/|\/\/|\/\*+|\*+|\#)\s*/, '')
            .replace(/\*\/$/, '')
            .trim();
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

        const funcMatch = line.match(
          /^\s*(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/,
        );
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

        const structMatch = line.match(/^type\s+([A-Za-z0-9_]+)\s+struct\b/);
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

        const interfaceMatch = line.match(/^type\s+([A-Za-z0-9_]+)\s+interface\b/);
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
        const fnMatch = line.match(
          /^\s*(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)/,
        );
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

        const implMatch = line.match(
          /^\s*impl(?:\s*<[^>]+>)?\s+(?:([A-Za-z0-9_]+)\s+for\s+)?([A-Za-z0-9_]+)/,
        );
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
    }

    return symbols;
  }
}
