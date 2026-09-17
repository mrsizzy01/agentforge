import fs from 'node:fs';
import path from 'node:path';
import picomatch from 'picomatch';
import {
  FileInfo,
  FileEditChunk,
  SearchMatch,
  ReadFileOptions,
  ListDirectoryOptions,
} from '@agentforge/types';
import { PathValidator } from '@agentforge/security';
import { isBinaryFile } from './binary-check.js';

export interface WorkspaceFilesystemOptions {
  workspaceRoot: string;
  allowedDirectories?: string[];
  maxFileSizeBytes?: number;
}

const DEFAULT_IGNORE_PATTERNS = [
  '**/.git/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.agentforge/**',
  '**/coverage/**',
];

export class WorkspaceFilesystem {
  private workspaceRoot: string;
  private pathValidator: PathValidator;
  private maxFileSizeBytes: number;
  private agentIgnorePatterns: string[];

  constructor(options: WorkspaceFilesystemOptions) {
    this.workspaceRoot = path.resolve(options.workspaceRoot);
    this.pathValidator = new PathValidator(this.workspaceRoot, options.allowedDirectories || []);
    this.maxFileSizeBytes = options.maxFileSizeBytes || 5 * 1024 * 1024; // 5MB default
    this.agentIgnorePatterns = this.loadAgentIgnore();
  }

  /**
   * Loads .agentforgeignore from the workspace root (gitignore-compatible syntax).
   * Lines starting with # are treated as comments.
   */
  private loadAgentIgnore(): string[] {
    const ignorePath = path.join(this.workspaceRoot, '.agentforgeignore');
    if (!fs.existsSync(ignorePath)) return [];
    try {
      const raw = fs.readFileSync(ignorePath, 'utf-8');
      return raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'))
        .map((l) => (l.includes('/') || l.includes('*') ? l : `**/${l}/**`));
    } catch {
      return [];
    }
  }

  /**
   * Reload ignore patterns (e.g. if .agentforgeignore was created after startup).
   */
  public reloadIgnorePatterns(): void {
    this.agentIgnorePatterns = this.loadAgentIgnore();
  }

  public getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  public getPathValidator(): PathValidator {
    return this.pathValidator;
  }

  public async readFile(targetPath: string, options: ReadFileOptions = {}): Promise<string> {
    const val = this.pathValidator.validate(targetPath);
    if (!val.isValid) {
      throw new Error(val.reason || `Invalid path: ${targetPath}`);
    }

    const resolved = val.resolvedPath;
    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${targetPath}`);
    }

    const stat = await fs.promises.stat(resolved);
    if (stat.isDirectory()) {
      throw new Error(`Cannot read directory as file: ${targetPath}`);
    }

    const limit = options.maxSizeBytes || this.maxFileSizeBytes;
    if (stat.size > limit) {
      throw new Error(
        `File size (${stat.size} bytes) exceeds maximum permitted limit (${limit} bytes).`,
      );
    }

    if (isBinaryFile(resolved)) {
      throw new Error(`Cannot read binary file as text: ${targetPath}`);
    }

    const content = await fs.promises.readFile(resolved, {
      encoding: options.encoding || 'utf-8',
    });

    if (options.startLine !== undefined || options.endLine !== undefined) {
      const lines = content.split(/\r?\n/);
      const start = Math.max(1, options.startLine || 1);
      const end = Math.min(lines.length, options.endLine || lines.length);
      return lines.slice(start - 1, end).join('\n');
    }

    return content;
  }

  public async writeFile(targetPath: string, content: string): Promise<void> {
    const val = this.pathValidator.validate(targetPath);
    if (!val.isValid) {
      throw new Error(val.reason || `Invalid path: ${targetPath}`);
    }

    const resolved = val.resolvedPath;
    const dir = path.dirname(resolved);

    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    // Atomic write via temporary file
    const tempFile = `${resolved}.tmp.${Date.now()}`;
    await fs.promises.writeFile(tempFile, content, 'utf-8');
    await fs.promises.rename(tempFile, resolved);
  }

  public async editFile(
    targetPath: string,
    edits: FileEditChunk[],
  ): Promise<{ modified: boolean }> {
    const current = await this.readFile(targetPath);
    let updated = current;

    for (let i = 0; i < edits.length; i++) {
      const { oldContent, newContent } = edits[i];
      if (!oldContent) {
        throw new Error(`Edit chunk #${i + 1} has empty oldContent.`);
      }

      const occurrences = updated.split(oldContent).length - 1;
      if (occurrences === 0) {
        throw new Error(`Edit failed for chunk #${i + 1}: target text not found in file.`);
      }
      if (occurrences > 1) {
        throw new Error(
          `Edit failed for chunk #${i + 1}: target text appears ${occurrences} times. Must be unique.`,
        );
      }

      updated = updated.replace(oldContent, newContent);
    }

    await this.writeFile(targetPath, updated);
    return { modified: true };
  }

  public async deleteFile(targetPath: string): Promise<void> {
    const val = this.pathValidator.validate(targetPath);
    if (!val.isValid) {
      throw new Error(val.reason || `Invalid path: ${targetPath}`);
    }

    const resolved = val.resolvedPath;
    if (resolved === this.workspaceRoot) {
      throw new Error(`Cannot delete workspace root directory.`);
    }

    if (!fs.existsSync(resolved)) {
      throw new Error(`File or directory does not exist: ${targetPath}`);
    }

    const stat = await fs.promises.stat(resolved);
    if (stat.isDirectory()) {
      await fs.promises.rm(resolved, { recursive: true, force: true });
    } else {
      await fs.promises.unlink(resolved);
    }
  }

  public async listDirectory(
    targetPath: string = '.',
    options: ListDirectoryOptions = {},
  ): Promise<FileInfo[]> {
    const val = this.pathValidator.validate(targetPath);
    if (!val.isValid) {
      throw new Error(val.reason || `Invalid path: ${targetPath}`);
    }

    const resolved = val.resolvedPath;
    if (!fs.existsSync(resolved)) {
      throw new Error(`Directory not found: ${targetPath}`);
    }

    const results: FileInfo[] = [];
    const ignoreList = [
      ...DEFAULT_IGNORE_PATTERNS,
      ...this.agentIgnorePatterns,
      ...(options.ignorePatterns || []),
    ];
    const isIgnored = picomatch(ignoreList, { dot: true });

    const walk = async (currentDir: string, depth: number) => {
      if (options.maxDepth !== undefined && depth > options.maxDepth) {
        return;
      }

      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relative = path.relative(this.workspaceRoot, fullPath).replace(/\\/g, '/');

        if (isIgnored(relative) || isIgnored(entry.name)) {
          continue;
        }

        const isDir = entry.isDirectory();
        const isFile = entry.isFile();
        const isSymlink = entry.isSymbolicLink();

        let size = 0;
        let modifiedAt = new Date();
        try {
          const stat = await fs.promises.stat(fullPath);
          size = stat.size;
          modifiedAt = stat.mtime;
        } catch {
          // Ignore
        }

        if (isDir) {
          if (options.includeDirectories !== false) {
            results.push({
              path: fullPath,
              relativePath: relative,
              name: entry.name,
              size,
              isDirectory: true,
              isFile: false,
              isSymbolicLink: isSymlink,
              modifiedAt,
            });
          }
          if (options.recursive !== false) {
            await walk(fullPath, depth + 1);
          }
        } else if (isFile) {
          if (options.includeFiles !== false) {
            results.push({
              path: fullPath,
              relativePath: relative,
              name: entry.name,
              size,
              isDirectory: false,
              isFile: true,
              isSymbolicLink: isSymlink,
              modifiedAt,
              isBinary: isBinaryFile(fullPath),
            });
          }
        }
      }
    };

    await walk(resolved, 0);
    return results;
  }

  public async searchFiles(query: string): Promise<string[]> {
    const files = await this.listDirectory('.', { recursive: true, includeDirectories: false });
    const lowerQuery = query.toLowerCase();

    return files
      .filter(
        (f) =>
          f.name.toLowerCase().includes(lowerQuery) ||
          f.relativePath.toLowerCase().includes(lowerQuery),
      )
      .map((f) => f.relativePath);
  }

  public async searchCode(
    pattern: string,
    options: { isRegex?: boolean; caseSensitive?: boolean; maxResults?: number } = {},
  ): Promise<SearchMatch[]> {
    const files = await this.listDirectory('.', { recursive: true, includeDirectories: false });
    const matches: SearchMatch[] = [];
    const max = options.maxResults || 100;

    let regex: RegExp;
    try {
      const flags = options.caseSensitive ? 'g' : 'gi';
      regex = options.isRegex
        ? new RegExp(pattern, flags)
        : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    } catch (err) {
      throw new Error(`Invalid search pattern: ${(err as Error).message}`);
    }

    for (const file of files) {
      if (file.isBinary) continue;

      let content: string;
      try {
        content = await fs.promises.readFile(file.path, 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split(/\r?\n/);
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const lineContent = lines[lineNum];
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(lineContent)) !== null) {
          matches.push({
            file: file.relativePath,
            line: lineNum + 1,
            column: match.index + 1,
            lineContent: lineContent.trim(),
            match: match[0],
          });

          if (matches.length >= max) {
            return matches;
          }

          if (!regex.global) break;
        }
      }
    }

    return matches;
  }
}
