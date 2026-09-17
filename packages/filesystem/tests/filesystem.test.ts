import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkspaceFilesystem } from '../src/index.js';

describe('WorkspaceFilesystem', () => {
  let tempDir: string;
  let wfs: WorkspaceFilesystem;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentforge-fs-test-'));
    wfs = new WorkspaceFilesystem({ workspaceRoot: tempDir });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('writes and reads files within workspace', async () => {
    await wfs.writeFile('src/hello.ts', 'export const message = "hello";\nexport const count = 42;');
    const content = await wfs.readFile('src/hello.ts');
    expect(content).toContain('message = "hello"');

    // Partial reading
    const line1 = await wfs.readFile('src/hello.ts', { startLine: 1, endLine: 1 });
    expect(line1).toBe('export const message = "hello";');
  });

  it('blocks path traversal attempts', async () => {
    await expect(wfs.readFile('../outside.txt')).rejects.toThrow('Access denied');
    await expect(wfs.writeFile('../outside.txt', 'evil')).rejects.toThrow('Access denied');
  });

  it('edits files using targeted chunk replacement', async () => {
    await wfs.writeFile('app.ts', 'const a = 1;\nconst b = 2;\nconst c = 3;');

    await wfs.editFile('app.ts', [
      {
        oldContent: 'const b = 2;',
        newContent: 'const b = 99;',
      },
    ]);

    const updated = await wfs.readFile('app.ts');
    expect(updated).toBe('const a = 1;\nconst b = 99;\nconst c = 3;');
  });

  it('throws error when editing text that is not found', async () => {
    await wfs.writeFile('app.ts', 'const a = 1;');
    await expect(
      wfs.editFile('app.ts', [
        {
          oldContent: 'const nonExistent = 100;',
          newContent: 'replacement',
        },
      ]),
    ).rejects.toThrow('target text not found');
  });

  it('lists files and directory hierarchy ignoring node_modules and .git', async () => {
    await wfs.writeFile('src/index.ts', 'console.log(1);');
    await wfs.writeFile('package.json', '{}');
    await wfs.writeFile('node_modules/dummy.js', 'ignore me');

    const files = await wfs.listDirectory('.', { recursive: true, includeDirectories: false });
    const relativePaths = files.map((f) => f.relativePath);

    expect(relativePaths).toContain('src/index.ts');
    expect(relativePaths).toContain('package.json');
    expect(relativePaths).not.toContain('node_modules/dummy.js');
  });

  it('searches for files and code matches', async () => {
    await wfs.writeFile('src/auth.ts', 'export function login() { return true; }');
    await wfs.writeFile('src/user.ts', 'export function getUser() { return null; }');

    const foundFiles = await wfs.searchFiles('auth');
    expect(foundFiles).toEqual(['src/auth.ts']);

    const codeMatches = await wfs.searchCode('login');
    expect(codeMatches.length).toBe(1);
    expect(codeMatches[0].file).toBe('src/auth.ts');
    expect(codeMatches[0].lineContent).toContain('export function login()');
  });

  it('deletes files safely within workspace', async () => {
    await wfs.writeFile('to-delete.txt', 'bye');
    expect(fs.existsSync(path.join(tempDir, 'to-delete.txt'))).toBe(true);

    await wfs.deleteFile('to-delete.txt');
    expect(fs.existsSync(path.join(tempDir, 'to-delete.txt'))).toBe(false);
  });
});
