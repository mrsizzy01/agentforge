import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { BM25SearchTool } from '../src/filesystem/bm25-search.js';
import { WorkspaceFilesystem } from '@agentforge/filesystem';
import { ToolContext } from '@agentforge/types';

describe('BM25SearchTool', () => {
  let tempDir: string;
  let wfs: WorkspaceFilesystem;
  let tool: BM25SearchTool;
  let context: ToolContext;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentforge-bm25-test-'));
    wfs = new WorkspaceFilesystem({ workspaceRoot: tempDir });
    tool = new BM25SearchTool(wfs);
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

  it('tokenizes camelCase and snake_case properly', () => {
    const tokens = BM25SearchTool.tokenizeCode('function getUserAuthToken_v2() { return JWT_SECRET; }');
    expect(tokens).toContain('get');
    expect(tokens).toContain('user');
    expect(tokens).toContain('auth');
    expect(tokens).toContain('token');
    expect(tokens).toContain('jwt');
    expect(tokens).toContain('secret');
  });

  it('ranks relevant source files higher than non-relevant ones', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'auth-service.ts'),
      'export class AuthenticationService {\n  verifyJwtToken(token: string) {\n    return true;\n  }\n}\n',
    );
    fs.writeFileSync(
      path.join(tempDir, 'math-utils.ts'),
      'export function calculateSum(a: number, b: number): number {\n  return a + b;\n}\n',
    );

    const result = await tool.execute({ query: 'jwt token verification' }, context);

    expect(result.success).toBe(true);
    expect(result.data?.matches.length).toBeGreaterThanOrEqual(1);
    expect(result.data?.matches[0].path).toBe('auth-service.ts');
    expect(result.data?.matches[0].score).toBeGreaterThan(0);
    expect(result.data?.matches[0].matchingTerms).toContain('jwt');
    expect(result.data?.matches[0].matchingTerms).toContain('token');
  });
});
