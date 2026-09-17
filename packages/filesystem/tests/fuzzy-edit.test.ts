import { describe, it, expect } from 'vitest';
import { WorkspaceFilesystem } from '../src/workspace-fs.js';

describe('WorkspaceFilesystem.applyFuzzyEdit', () => {
  it('handles exact literal match', () => {
    const original = `const a = 1;\nconst b = 2;\n`;
    const result = WorkspaceFilesystem.applyFuzzyEdit(original, 'const b = 2;', 'const b = 42;');
    expect(result).toBe(`const a = 1;\nconst b = 42;\n`);
  });

  it('handles line-ending mismatch (CRLF vs LF)', () => {
    const crlfOriginal = 'function hello() {\r\n  return true;\r\n}\r\n';
    const lfTarget = 'function hello() {\n  return true;\n}';
    const lfReplacement = 'function hello() {\n  return false;\n}';

    const result = WorkspaceFilesystem.applyFuzzyEdit(crlfOriginal, lfTarget, lfReplacement);
    expect(result).toContain('return false;');
    expect(result).toContain('\r\n');
  });

  it('handles flexible indentation and whitespace variations', () => {
    const original = `
class Worker {
    process() {
        console.log("running");
    }
}
`;
    // Target with 2 spaces instead of 4 spaces
    const targetWith2Spaces = `  process() {\n    console.log("running");\n  }`;
    const replacement = `  process() {\n    console.log("done");\n  }`;

    const result = WorkspaceFilesystem.applyFuzzyEdit(original, targetWith2Spaces, replacement);
    expect(result).toContain('console.log("done");');
  });

  it('throws helpful error if target appears multiple times ambiguously', () => {
    const original = `item = 1;\nitem = 1;\n`;
    expect(() => WorkspaceFilesystem.applyFuzzyEdit(original, 'item = 1;', 'item = 2;')).toThrow(
      /appears 2 times/i,
    );
  });
});
