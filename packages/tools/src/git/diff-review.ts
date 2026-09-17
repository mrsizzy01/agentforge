import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext } from '@agentforge/types';
import { GitClient } from '@agentforge/git';

const InputSchema = z.object({
  includeStagedAndUnstaged: z
    .boolean()
    .default(true)
    .describe('Include both staged and unstaged changes (default: true)'),
});

type Input = z.infer<typeof InputSchema>;

export interface DiffReviewOutput {
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
  stagedDiff: string;
  unstagedDiff: string;
  summary: string;
  totalFilesChanged: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
}

export class DiffReviewTool extends BaseTool<Input, DiffReviewOutput> {
  public readonly name = 'diff_review';
  public readonly description =
    'Reviews all pending git changes (staged and unstaged) before committing. Shows a structured diff summary with file and line statistics. Always call this before git_commit to validate what will be committed.';
  public readonly category = 'git' as const;
  public readonly inputSchema = InputSchema;
  public readonly requiresConfirmation = false;

  private git: GitClient;

  constructor(gitClient: GitClient) {
    super();
    this.git = gitClient;
  }

  public async run(input: Input, _context: ToolContext): Promise<DiffReviewOutput> {
    const [stagedDiff, unstagedDiff] = await Promise.all([
      this.git.diff({ staged: true }).catch(() => ''),
      this.git.diff({ staged: false }).catch(() => ''),
    ]);

    const hasStagedChanges = stagedDiff.trim().length > 0;
    const hasUnstagedChanges = unstagedDiff.trim().length > 0;

    // Parse stats from diff output
    const stats = DiffReviewTool.parseDiffStats(
      input.includeStagedAndUnstaged ? `${stagedDiff}\n${unstagedDiff}` : stagedDiff,
    );

    const summary = DiffReviewTool.buildSummary({
      hasStagedChanges,
      hasUnstagedChanges,
      ...stats,
    });

    return {
      hasStagedChanges,
      hasUnstagedChanges,
      stagedDiff: hasStagedChanges ? stagedDiff : '(no staged changes)',
      unstagedDiff: hasUnstagedChanges ? unstagedDiff : '(no unstaged changes)',
      summary,
      ...stats,
    };
  }

  private static parseDiffStats(diff: string): {
    totalFilesChanged: number;
    totalLinesAdded: number;
    totalLinesRemoved: number;
  } {
    const files = new Set<string>();
    let added = 0;
    let removed = 0;

    for (const line of diff.split('\n')) {
      if (line.startsWith('diff --git ')) {
        const match = line.match(/diff --git a\/(.+) b\//);
        if (match) files.add(match[1]);
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        added++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        removed++;
      }
    }

    return {
      totalFilesChanged: files.size,
      totalLinesAdded: added,
      totalLinesRemoved: removed,
    };
  }

  private static buildSummary(opts: {
    hasStagedChanges: boolean;
    hasUnstagedChanges: boolean;
    totalFilesChanged: number;
    totalLinesAdded: number;
    totalLinesRemoved: number;
  }): string {
    const parts: string[] = ['## Diff Review Summary\n'];

    if (!opts.hasStagedChanges && !opts.hasUnstagedChanges) {
      return '## Diff Review Summary\n\nNo pending changes detected. Working tree is clean.';
    }

    parts.push(`**Files changed:** ${opts.totalFilesChanged}`);
    parts.push(`**Lines added:** +${opts.totalLinesAdded}`);
    parts.push(`**Lines removed:** -${opts.totalLinesRemoved}`);
    parts.push('');

    if (opts.hasStagedChanges) parts.push('✅ Staged changes ready to commit.');
    if (opts.hasUnstagedChanges)
      parts.push('⚠️  Unstaged changes exist — consider staging or stashing them.');

    return parts.join('\n');
  }
}
