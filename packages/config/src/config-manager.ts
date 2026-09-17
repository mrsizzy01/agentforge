import fs from 'node:fs';
import path from 'node:path';
import {
  AgentForgeConfig,
  AgentForgeConfigSchema,
  PermissionLevel,
  ProviderType,
} from '@agentforge/types';
import {
  getGlobalConfigFile,
  getWorkspaceConfigFile,
} from './paths.js';

export class ConfigManager {
  private config: AgentForgeConfig;
  private workspaceRoot: string;

  constructor(workspaceRoot: string = process.cwd()) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.config = this.loadConfig();
  }

  public getConfig(): AgentForgeConfig {
    return { ...this.config };
  }

  public getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  public get<T = unknown>(dotPath: string): T | undefined {
    const parts = dotPath.split('.');
    let current: unknown = this.config;

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current as T;
  }

  public set(dotPath: string, value: unknown, scope: 'workspace' | 'global' = 'workspace'): void {
    const parts = dotPath.split('.');
    const lastKey = parts.pop()!;
    let current: Record<string, unknown> = this.config as unknown as Record<string, unknown>;

    for (const part of parts) {
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[lastKey] = value;

    // Validate the updated config
    this.config = AgentForgeConfigSchema.parse(this.config);

    // Persist to designated file
    this.save(scope);
  }

  public save(scope: 'workspace' | 'global' = 'workspace'): void {
    const targetFile =
      scope === 'workspace'
        ? getWorkspaceConfigFile(this.workspaceRoot)
        : getGlobalConfigFile();

    const targetDir = path.dirname(targetFile);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    fs.writeFileSync(targetFile, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  private loadConfig(): AgentForgeConfig {
    let merged: Record<string, unknown> = {};

    // 1. Global config
    const globalFile = getGlobalConfigFile();
    if (fs.existsSync(globalFile)) {
      try {
        const raw = fs.readFileSync(globalFile, 'utf-8');
        merged = { ...merged, ...JSON.parse(raw) };
      } catch {
        // Ignore parse errors on corrupted file, fallback
      }
    }

    // 2. Workspace config
    const workspaceFile = getWorkspaceConfigFile(this.workspaceRoot);
    if (fs.existsSync(workspaceFile)) {
      try {
        const raw = fs.readFileSync(workspaceFile, 'utf-8');
        merged = { ...merged, ...JSON.parse(raw) };
      } catch {
        // Ignore parse errors
      }
    }

    // 3. Environment variables
    if (process.env.AGENTFORGE_LOG_LEVEL) {
      merged.logLevel = process.env.AGENTFORGE_LOG_LEVEL;
    }
    if (process.env.AGENTFORGE_PERMISSION_LEVEL) {
      if (!merged.security || typeof merged.security !== 'object') merged.security = {};
      (merged.security as Record<string, unknown>).permissionLevel =
        process.env.AGENTFORGE_PERMISSION_LEVEL as PermissionLevel;
    }
    if (process.env.OPENAI_API_KEY) {
      if (!merged.provider || typeof merged.provider !== 'object') merged.provider = {};
      (merged.provider as Record<string, unknown>).apiKey = process.env.OPENAI_API_KEY;
    }
    if (process.env.AGENTFORGE_PROVIDER) {
      if (!merged.provider || typeof merged.provider !== 'object') merged.provider = {};
      (merged.provider as Record<string, unknown>).type = process.env.AGENTFORGE_PROVIDER as ProviderType;
    }
    if (process.env.AGENTFORGE_MODEL) {
      if (!merged.provider || typeof merged.provider !== 'object') merged.provider = {};
      (merged.provider as Record<string, unknown>).model = process.env.AGENTFORGE_MODEL;
    }

    // Validate and fill defaults with Zod
    const parsed = AgentForgeConfigSchema.safeParse(merged);
    if (parsed.success) {
      return parsed.data;
    }

    // If completely invalid, return defaults
    return AgentForgeConfigSchema.parse({});
  }
}
