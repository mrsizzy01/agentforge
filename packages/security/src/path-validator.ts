import path from 'node:path';
import picomatch from 'picomatch';

export interface PathValidationResult {
  isValid: boolean;
  resolvedPath: string;
  relativePath: string;
  isSensitive: boolean;
  reason?: string;
}

export class PathValidator {
  private workspaceRoot: string;
  private allowedDirs: string[];
  private sensitiveMatcher: (testPath: string) => boolean;

  constructor(
    workspaceRoot: string,
    allowedDirs: string[] = [],
    sensitivePatterns: string[] = [
      '**/.env*',
      '**/id_rsa*',
      '**/*.pem',
      '**/*.key',
      '**/credentials*',
      '**/secrets*',
      '**/.ssh/**',
      '**/.gnupg/**',
    ],
  ) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.allowedDirs = allowedDirs.map((dir) => path.resolve(this.workspaceRoot, dir));
    this.sensitiveMatcher = picomatch(sensitivePatterns, { dot: true });
  }

  public validate(targetPath: string): PathValidationResult {
    if (!targetPath || typeof targetPath !== 'string') {
      return {
        isValid: false,
        resolvedPath: '',
        relativePath: '',
        isSensitive: false,
        reason: 'Path must be a non-empty string.',
      };
    }

    // Resolve target path against workspace root
    const resolved = path.isAbsolute(targetPath)
      ? path.resolve(targetPath)
      : path.resolve(this.workspaceRoot, targetPath);

    // Normalize paths for comparison (case-insensitive on Windows)
    const normRoot = path.normalize(this.workspaceRoot).toLowerCase();
    const normResolved = path.normalize(resolved).toLowerCase();

    // Check if target is exactly root or inside root
    const isInsideWorkspace =
      normResolved === normRoot || normResolved.startsWith(normRoot + path.sep);

    // Check if path is within an explicitly allowed external directory
    const isInsideAllowedDir = this.allowedDirs.some((dir) => {
      const normDir = path.normalize(dir).toLowerCase();
      return normResolved === normDir || normResolved.startsWith(normDir + path.sep);
    });

    if (!isInsideWorkspace && !isInsideAllowedDir) {
      return {
        isValid: false,
        resolvedPath: resolved,
        relativePath: path.relative(this.workspaceRoot, resolved),
        isSensitive: false,
        reason: `Access denied: path "${targetPath}" resolves outside of workspace boundary (${this.workspaceRoot}).`,
      };
    }

    const relative = path.relative(this.workspaceRoot, resolved).replace(/\\/g, '/');
    const isSensitive = this.sensitiveMatcher(relative) || this.sensitiveMatcher(path.basename(resolved));

    return {
      isValid: true,
      resolvedPath: resolved,
      relativePath: relative,
      isSensitive,
    };
  }

  public isWithinWorkspace(targetPath: string): boolean {
    return this.validate(targetPath).isValid;
  }

  public isSensitive(targetPath: string): boolean {
    return this.validate(targetPath).isSensitive;
  }
}
