import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CheckDiagnosticsTool } from '../src/intelligence/diagnostic.js';
import { WorkspaceFilesystem } from '@agentforge/filesystem';
import { ToolContext } from '@agentforge/types';

describe('CheckDiagnosticsTool', () => {
  let tempDir: string;
  let wfs: WorkspaceFilesystem;
  let tool: CheckDiagnosticsTool;
  let context: ToolContext;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentforge-diag-test-'));
    wfs = new WorkspaceFilesystem({ workspaceRoot: tempDir });
    tool = new CheckDiagnosticsTool(wfs);
    context = {
      workspaceRoot: tempDir,
      isInteractive: false,
    };
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('reports no errors for clean, valid TypeScript code', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'valid.ts'),
      'export function add(a: number, b: number): number { return a + b; }\n',
    );

    const result = await tool.execute({ path: 'valid.ts' }, context);
    expect(result.success).toBe(true);
    expect(result.data?.hasErrors).toBe(false);
    expect(result.data?.errorCount).toBe(0);
  }, 15000);

  it('identifies syntax and type errors with exact line and code', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'invalid.ts'),
      'const x: number = "not a number";\n',
    );

    const result = await tool.execute({ path: 'invalid.ts' }, context);
    expect(result.success).toBe(true);
    expect(result.data?.hasErrors).toBe(true);
    expect(result.data?.errorCount).toBeGreaterThanOrEqual(1);
    expect(result.data?.diagnostics[0].code).toBe('TS2322');
    expect(result.data?.diagnostics[0].line).toBe(1);
  }, 15000);
});
