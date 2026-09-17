import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  ToolRegistry,
  ToolExecutor,
  ReadFileTool,
  WriteFileTool,
  ApplyPatchTool,
} from '../src/index.js';
import { WorkspaceFilesystem } from '@agentforge/filesystem';
import { PermissionManager, AuditLogger, SecretDetector } from '@agentforge/security';
import { ToolContext } from '@agentforge/types';

describe('ToolRegistry & ToolExecutor', () => {
  let tempDir: string;
  let wfs: WorkspaceFilesystem;
  let registry: ToolRegistry;
  let permissionManager: PermissionManager;
  let auditLogger: AuditLogger;
  let executor: ToolExecutor;
  let context: ToolContext;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentforge-tools-test-'));
    wfs = new WorkspaceFilesystem({ workspaceRoot: tempDir });
    registry = new ToolRegistry();
    permissionManager = new PermissionManager('interactive');
    auditLogger = new AuditLogger();
    executor = new ToolExecutor({
      registry,
      permissionManager,
      auditLogger,
      secretDetector: new SecretDetector(),
    });

    registry.register(new ReadFileTool(wfs));
    registry.register(new WriteFileTool(wfs));

    context = {
      workspaceRoot: tempDir,
      isInteractive: true,
      confirmAction: async () => true, // Auto-confirm for test
    };
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('registers tools and exports JSON schema descriptors', () => {
    expect(registry.has('read_file')).toBe(true);
    expect(registry.has('write_file')).toBe(true);

    const descriptors = registry.getDescriptors();
    expect(descriptors.length).toBe(2);
    const readFileDesc = descriptors.find((d) => d.name === 'read_file');
    expect(readFileDesc).toBeDefined();
    expect(readFileDesc?.category).toBe('read');
    expect(readFileDesc?.inputSchemaJson).toBeDefined();
  });

  it('executes write and read tools through ToolExecutor', async () => {
    const writeRes = await executor.execute(
      'write_file',
      { path: 'test.txt', content: 'AgentForge tools working!' },
      context,
    );

    expect(writeRes.success).toBe(true);
    expect(auditLogger.getRecords().length).toBeGreaterThan(0);

    const readRes = await executor.execute('read_file', { path: 'test.txt' }, context);
    expect(readRes.success).toBe(true);
    expect(readRes.data).toBe('AgentForge tools working!');
  });

  it('blocks write operations in readonly mode', async () => {
    permissionManager.setLevel('readonly');

    const res = await executor.execute(
      'write_file',
      { path: 'blocked.txt', content: 'should fail' },
      context,
    );

    expect(res.success).toBe(false);
    expect(res.error).toContain('readonly');
  });

  it('handles user rejecting confirmation prompt', async () => {
    const rejectContext: ToolContext = {
      ...context,
      confirmAction: async () => false, // User declines
    };

    const res = await executor.execute(
      'write_file',
      { path: 'declined.txt', content: 'will not be written' },
      rejectContext,
    );

    expect(res.success).toBe(false);
    expect(res.error).toContain('cancelled by user');
    expect(fs.existsSync(path.join(tempDir, 'declined.txt'))).toBe(false);
  });

  it('extracts outline and symbols from source code files', async () => {
    const sampleCode = `
import { Config } from './config.js';

export interface UserSession {
  id: string;
  createdAt: number;
}

export class AuthService {
  public async authenticate(token: string): Promise<boolean> {
    return true;
  }
}

export function validateInput(raw: string): boolean {
  return raw.length > 0;
}
`;
    await wfs.writeFile('auth.ts', sampleCode);

    const { GetFileOutlineTool, FindSymbolsTool } = await import('../src/index.js');
    const outlineTool = new GetFileOutlineTool(wfs);
    const symbolsTool = new FindSymbolsTool(wfs);

    const outlineRes = await outlineTool.execute({ path: 'auth.ts' }, context);
    expect(outlineRes.success).toBe(true);
    expect(outlineRes.data?.symbols.length).toBeGreaterThanOrEqual(3);

    const kinds = outlineRes.data?.symbols.map((s) => s.kind);
    expect(kinds).toContain('interface');
    expect(kinds).toContain('class');
    expect(kinds).toContain('function');

    const searchRes = await symbolsTool.execute({ query: 'AuthService' }, context);
    expect(searchRes.success).toBe(true);
    expect(searchRes.data?.matches.length).toBe(1);
    expect(searchRes.data?.matches[0].file).toBe('auth.ts');
    expect(searchRes.data?.matches[0].symbol.signature).toContain('class AuthService');
  });

  it('applies surgical SEARCH/REPLACE patches accurately', async () => {
    const original = `function add(a: number, b: number): number {
  return a + b;
}

function subtract(a: number, b: number): number {
  return a - b;
}
`;
    await wfs.writeFile('calc.ts', original);

    const patchTool = new ApplyPatchTool(wfs);

    const patch = `<<<<<<< SEARCH
function add(a: number, b: number): number {
  return a + b;
}
=======
function add(a: number, b: number): number {
  // Validate inputs
  if (isNaN(a) || isNaN(b)) throw new Error('NaN argument');
  return a + b;
}
>>>>>>> REPLACE
<<<<<<< SEARCH
function subtract(a: number, b: number): number {
  return a - b;
}
=======
function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
>>>>>>> REPLACE`;

    const res = await patchTool.execute({ path: 'calc.ts', patch }, context);
    expect(res.success).toBe(true);
    expect(res.data?.chunksApplied).toBe(2);

    const updated = await wfs.readFile('calc.ts');
    expect(updated).toContain('if (isNaN(a)');
    expect(updated).toContain('export function multiply');
  });

  it('fails gracefully when SEARCH block is not found or ambiguous', async () => {
    await wfs.writeFile('sample.txt', 'hello world\nhello world\n');
    const patchTool = new ApplyPatchTool(wfs);

    // Missing block
    const missingPatch = `<<<<<<< SEARCH
non-existent text
=======
replacement
>>>>>>> REPLACE`;
    const res1 = await patchTool.execute({ path: 'sample.txt', patch: missingPatch }, context);
    expect(res1.success).toBe(false);
    expect(res1.error).toContain('SEARCH block was not found');

    // Ambiguous block
    const ambigPatch = `<<<<<<< SEARCH
hello world
=======
replacement
>>>>>>> REPLACE`;
    const res2 = await patchTool.execute({ path: 'sample.txt', patch: ambigPatch }, context);
    expect(res2.success).toBe(false);
    expect(res2.error).toContain('matches 2 times');
  });
});
