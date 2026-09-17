import path from 'node:path';
import os from 'node:os';

export function getGlobalConfigDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.agentforge');
}

export function getGlobalConfigFile(): string {
  return path.join(getGlobalConfigDir(), 'config.json');
}

export function getWorkspaceConfigDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.agentforge');
}

export function getWorkspaceConfigFile(workspaceRoot: string): string {
  return path.join(getWorkspaceConfigDir(workspaceRoot), 'config.json');
}
