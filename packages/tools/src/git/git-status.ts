import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext, GitStatus } from '@agentforge/types';
import { GitClient } from '@agentforge/git';

const GitStatusInputSchema = z.object({});
type GitStatusInput = z.infer<typeof GitStatusInputSchema>;

export class GitStatusTool extends BaseTool<GitStatusInput, GitStatus> {
  readonly name = 'git_status';
  readonly description = 'Checks Git repository status (branch, modified, staged, untracked files).';
  readonly category = 'git' as const;
  readonly inputSchema = GitStatusInputSchema;

  private git: GitClient;

  constructor(gitClient: GitClient) {
    super();
    this.git = gitClient;
  }

  async run(_input: GitStatusInput, _context: ToolContext): Promise<GitStatus> {
    return this.git.status();
  }
}
