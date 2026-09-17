import path from 'node:path';
import ts from 'typescript';
import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext } from '@agentforge/types';
import { WorkspaceFilesystem } from '@agentforge/filesystem';

const InputSchema = z.object({
  path: z.string().describe('Relative path to the TypeScript/JavaScript file to check for compiler errors'),
});

type Input = z.infer<typeof InputSchema>;

export interface DiagnosticItem {
  line: number;
  character: number;
  code: string;
  category: 'error' | 'warning' | 'suggestion' | 'message';
  message: string;
}

export interface CheckDiagnosticsOutput {
  file: string;
  hasErrors: boolean;
  errorCount: number;
  warningCount: number;
  diagnostics: DiagnosticItem[];
}

export class CheckDiagnosticsTool extends BaseTool<Input, CheckDiagnosticsOutput> {
  public readonly name = 'check_diagnostics';
  public readonly description =
    'Quickly typechecks and validates syntax/semantic errors in a TypeScript or JavaScript file in-memory (<200ms) without running a slow test subprocess.';
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
    context: ToolContext,
  ): Promise<CheckDiagnosticsOutput> {
    const fullPath = path.resolve(context.workspaceRoot, input.path);
    const content = await this.fs.readFile(input.path);

    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowJs: true,
      checkJs: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    };

    // Create a lightweight in-memory compiler host
    const host = ts.createCompilerHost(compilerOptions);
    const originalGetSourceFile = host.getSourceFile;
    host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
      if (path.resolve(fileName) === fullPath) {
        return ts.createSourceFile(fileName, content, languageVersion, true);
      }
      return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
    };

    const program = ts.createProgram([fullPath], compilerOptions, host);
    const sourceFile = program.getSourceFile(fullPath);

    if (!sourceFile) {
      return {
        file: input.path,
        hasErrors: false,
        errorCount: 0,
        warningCount: 0,
        diagnostics: [],
      };
    }

    const syntactic = program.getSyntacticDiagnostics(sourceFile);
    const semantic = program.getSemanticDiagnostics(sourceFile);
    const allDiagnostics = [...syntactic, ...semantic];

    const mapped: DiagnosticItem[] = [];
    let errorCount = 0;
    let warningCount = 0;

    for (const diag of allDiagnostics) {
      if (diag.file && diag.start !== undefined) {
        const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start);
        const categoryStr =
          diag.category === ts.DiagnosticCategory.Error
            ? 'error'
            : diag.category === ts.DiagnosticCategory.Warning
              ? 'warning'
              : diag.category === ts.DiagnosticCategory.Suggestion
                ? 'suggestion'
                : 'message';

        if (categoryStr === 'error') errorCount++;
        if (categoryStr === 'warning') warningCount++;

        const msgText =
          typeof diag.messageText === 'string'
            ? diag.messageText
            : diag.messageText.messageText;

        mapped.push({
          line: line + 1,
          character: character + 1,
          code: `TS${diag.code}`,
          category: categoryStr,
          message: msgText,
        });
      }
    }

    return {
      file: input.path,
      hasErrors: errorCount > 0,
      errorCount,
      warningCount,
      diagnostics: mapped,
    };
  }
}
