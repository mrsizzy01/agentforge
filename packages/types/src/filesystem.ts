export interface FileInfo {
  path: string;
  relativePath: string;
  name: string;
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink: boolean;
  modifiedAt: Date;
  isBinary?: boolean;
}

export interface FileEditChunk {
  oldContent: string;
  newContent: string;
  startLine?: number;
  endLine?: number;
}

export interface SearchMatch {
  file: string;
  line: number;
  column: number;
  lineContent: string;
  match: string;
}

export interface ReadFileOptions {
  maxSizeBytes?: number;
  encoding?: BufferEncoding;
  startLine?: number;
  endLine?: number;
}

export interface ListDirectoryOptions {
  recursive?: boolean;
  maxDepth?: number;
  includeFiles?: boolean;
  includeDirectories?: boolean;
  ignorePatterns?: string[];
}
