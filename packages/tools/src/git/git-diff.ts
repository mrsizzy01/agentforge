import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext } from '@agentforge/types';
import { GitClient } from '@agentforge/git';

const GitDiffInputSchema = z.object({
  staged: z.boolean().default(false).describe('View staged changes instead of unstaged'),
  file: z.string().optional().describe('Limit diff to specific file path'),
  commit: z.string().optional().describe('Compare against specific commit hash or branch'),
});

type GitDiffInput = z.infer<typeof GitDiffInputSchema>;

export class GitDiffTool extends BaseTool<GitDiffInput, string> {
  readonly name = 'git_diff';
  readonly description = 'Shows unified git diff for working tree or staged changes.';
  readonly category = 'git' as const;
  readonly inputSchema = GitDiffInputSchema;

  private git: GitClient;

  constructor(gitClient: GitClient) {
    super();
    this.git = gitClient;
  }

  async run(input: GitDiffInput, _context: ToolContext): Promise<string> {
    return this.git.diff(input);
  }
}
