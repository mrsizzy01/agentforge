import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext } from '@agentforge/types';
import { GitClient } from '@agentforge/git';

const GitCommitInputSchema = z.object({
  message: z.string().min(1).describe('Git commit message (Conventional Commits encouraged)'),
  stageAll: z
    .boolean()
    .default(false)
    .describe('Stage all modified and untracked files before committing'),
  files: z.array(z.string()).optional().describe('Specific files to stage and commit'),
  allowEmpty: z.boolean().default(false).describe('Allow empty commit'),
});

type GitCommitInput = z.infer<typeof GitCommitInputSchema>;

export class GitCommitTool extends BaseTool<GitCommitInput, { success: boolean; output: string }> {
  readonly name = 'git_commit';
  readonly description = 'Creates a Git commit with a structured message after confirmation.';
  readonly category = 'git' as const;
  readonly inputSchema = GitCommitInputSchema;
  override readonly requiresConfirmation = true;

  private git: GitClient;

  constructor(gitClient: GitClient) {
    super();
    this.git = gitClient;
  }

  async run(
    input: GitCommitInput,
    _context: ToolContext,
  ): Promise<{ success: boolean; output: string }> {
    const output = await this.git.commit({
      message: input.message,
      stageAll: input.stageAll,
      files: input.files,
      allowEmpty: input.allowEmpty,
    });
    return { success: true, output };
  }
}
