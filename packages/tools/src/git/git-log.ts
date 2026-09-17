import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext, GitLogEntry } from '@agentforge/types';
import { GitClient } from '@agentforge/git';

const GitLogInputSchema = z.object({
  maxCount: z.number().int().positive().default(10).describe('Number of commits to return'),
});

type GitLogInput = z.infer<typeof GitLogInputSchema>;

export class GitLogTool extends BaseTool<GitLogInput, GitLogEntry[]> {
  readonly name = 'git_log';
  readonly description = 'Fetches recent Git commits with hashes, authors, and messages.';
  readonly category = 'git' as const;
  readonly inputSchema = GitLogInputSchema;

  private git: GitClient;

  constructor(gitClient: GitClient) {
    super();
    this.git = gitClient;
  }

  async run(input: GitLogInput, _context: ToolContext): Promise<GitLogEntry[]> {
    return this.git.log(input.maxCount);
  }
}
