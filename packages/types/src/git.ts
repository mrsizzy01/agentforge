export interface GitFileStatus {
  path: string;
  index: ' ' | 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?';
  workingTree: ' ' | 'M' | 'D' | 'U' | '?';
  staged: boolean;
}

export interface GitStatus {
  isRepo: boolean;
  branch: string;
  ahead: number;
  behind: number;
  clean: boolean;
  files: GitFileStatus[];
  stagedFiles: string[];
  modifiedFiles: string[];
  untrackedFiles: string[];
  conflictedFiles: string[];
}

export interface GitLogEntry {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

export interface GitCommitOptions {
  message: string;
  stageAll?: boolean;
  files?: string[];
  allowEmpty?: boolean;
}

export interface GitDiffOptions {
  staged?: boolean;
  file?: string;
  commit?: string;
}
