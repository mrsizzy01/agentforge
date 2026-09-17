import path from 'node:path';
import fs from 'node:fs';
import { ConfigManager, loadProjectInstructions } from '@agentforge/config';
import {
  PathValidator,
  SecretDetector,
  CommandSafetyValidator,
  PermissionManager,
  AuditLogger,
} from '@agentforge/security';
import { WorkspaceFilesystem } from '@agentforge/filesystem';
import { ProcessExecutor } from '@agentforge/terminal';
import { GitClient } from '@agentforge/git';
import {
  ToolRegistry,
  ToolExecutor,
  ReadFileTool,
  WriteFileTool,
  EditFileTool,
  ApplyPatchTool,
  DeleteFileTool,
  ListDirectoryTool,
  SearchFilesTool,
  SearchCodeTool,
  BM25SearchTool,
  RunCommandTool,
  TestRunnerTool,
  GitStatusTool,
  GitDiffTool,
  GitLogTool,
  GitCommitTool,
  DiffReviewTool,
  GetFileOutlineTool,
  FindSymbolsTool,
  PlanTool,
  CheckDiagnosticsTool,
  DelegateTaskTool,
  ReadUrlTool,
} from '@agentforge/tools';
import { Logger } from './logger.js';
import { SessionManager } from './session.js';

export interface RuntimeOptions {
  workspaceRoot?: string;
  isInteractive?: boolean;
}

export class AgentForgeRuntime {
  public readonly isInteractive: boolean;
  public readonly workspaceRoot: string;
  public readonly configManager: ConfigManager;
  public readonly secretDetector: SecretDetector;
  public readonly safetyValidator: CommandSafetyValidator;
  public readonly pathValidator: PathValidator;
  public readonly permissionManager: PermissionManager;
  public readonly auditLogger: AuditLogger;
  public readonly sessions: SessionManager;
  public readonly fs: WorkspaceFilesystem;
  public readonly terminal: ProcessExecutor;
  public readonly git: GitClient;
  public readonly registry: ToolRegistry;
  public readonly executor: ToolExecutor;
  public readonly logger: Logger;

  public get tools(): ToolRegistry {
    return this.registry;
  }

  public get permissions(): PermissionManager {
    return this.permissionManager;
  }

  public get audit(): AuditLogger {
    return this.auditLogger;
  }

  constructor(options: RuntimeOptions = {}) {
    this.isInteractive = options.isInteractive ?? true;
    this.workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
    this.configManager = new ConfigManager(this.workspaceRoot);
    const config = this.configManager.getConfig();

    this.logger = new Logger({ level: config.logLevel });
    this.secretDetector = new SecretDetector();
    this.safetyValidator = new CommandSafetyValidator(config.security.blockedCommands);
    this.pathValidator = new PathValidator(
      this.workspaceRoot,
      config.security.allowedDirectories,
      config.security.sensitiveFilePatterns,
    );
    this.permissionManager = new PermissionManager(config.security.permissionLevel);
    this.auditLogger = new AuditLogger();
    this.sessions = new SessionManager(this.workspaceRoot);

    this.fs = new WorkspaceFilesystem({
      workspaceRoot: this.workspaceRoot,
      allowedDirectories: config.security.allowedDirectories,
      maxFileSizeBytes: config.security.maxFileSizeBytes,
    });

    this.terminal = new ProcessExecutor({
      workspaceRoot: this.workspaceRoot,
      defaultTimeoutMs: config.security.commandTimeoutMs,
      safetyValidator: this.safetyValidator,
      secretDetector: this.secretDetector,
    });

    this.git = new GitClient({
      workspaceRoot: this.workspaceRoot,
      processExecutor: this.terminal,
    });

    this.registry = new ToolRegistry();
    this.registerBuiltinTools();

    this.executor = new ToolExecutor({
      registry: this.registry,
      permissionManager: this.permissionManager,
      auditLogger: this.auditLogger,
      secretDetector: this.secretDetector,
    });
  }

  private registerBuiltinTools(): void {
    // Filesystem tools
    this.registry.register(new ReadFileTool(this.fs));
    this.registry.register(new WriteFileTool(this.fs));
    this.registry.register(new EditFileTool(this.fs));
    this.registry.register(new ApplyPatchTool(this.fs));
    this.registry.register(new DeleteFileTool(this.fs));
    this.registry.register(new ListDirectoryTool(this.fs));
    this.registry.register(new SearchFilesTool(this.fs));
    this.registry.register(new SearchCodeTool(this.fs));
    this.registry.register(new BM25SearchTool(this.fs));

    // Terminal tool
    this.registry.register(new RunCommandTool(this.terminal, this.safetyValidator));

    // Git tools
    this.registry.register(new GitStatusTool(this.git));
    this.registry.register(new GitDiffTool(this.git));
    this.registry.register(new GitLogTool(this.git));
    this.registry.register(new GitCommitTool(this.git));
    this.registry.register(new DiffReviewTool(this.git));

    // Terminal extended
    this.registry.register(new TestRunnerTool(this.terminal));

    // Intelligence tools
    this.registry.register(new GetFileOutlineTool(this.fs));
    this.registry.register(new FindSymbolsTool(this.fs));
    this.registry.register(new PlanTool());
    this.registry.register(new CheckDiagnosticsTool(this.fs));
    this.registry.register(new DelegateTaskTool());

    // Web tools
    this.registry.register(new ReadUrlTool());
  }

  public getProjectInstructions(): string | null {
    const fileName = this.configManager.get<string>('customInstructionsFile') || 'AGENTFORGE.md';
    return loadProjectInstructions(this.workspaceRoot, fileName);
  }

  public initWorkspace(): { createdConfig: boolean; createdInstructions: boolean } {
    const configDir = path.join(this.workspaceRoot, '.agentforge');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const configFile = path.join(configDir, 'config.json');
    let createdConfig = false;
    if (!fs.existsSync(configFile)) {
      this.configManager.save('workspace');
      createdConfig = true;
    }

    const instructionsFile = path.join(this.workspaceRoot, 'AGENTFORGE.md');
    let createdInstructions = false;
    if (!fs.existsSync(instructionsFile)) {
      const template = `# AgentForge Project Instructions

## Overview
Describe your project and core architectural guidelines here.

## Conventions
- Package manager: pnpm
- Run tests before creating commits
- Follow Conventional Commits: feat:, fix:, docs:, refactor:, test:
- Never commit secrets, .env files, or API keys
`;
      fs.writeFileSync(instructionsFile, template, 'utf-8');
      createdInstructions = true;
    }

    return { createdConfig, createdInstructions };
  }
}
