import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext, SearchMatch } from '@agentforge/types';
import { WorkspaceFilesystem } from '@agentforge/filesystem';

const SearchCodeInputSchema = z.object({
  pattern: z.string().min(1).describe('Text string or regex to search inside code files'),
  isRegex: z.boolean().default(false).describe('Whether pattern is a regular expression'),
  caseSensitive: z.boolean().default(false).describe('Case-sensitive matching'),
  maxResults: z.number().int().positive().default(50).describe('Maximum number of matching lines'),
});

type SearchCodeInput = z.infer<typeof SearchCodeInputSchema>;

export class SearchCodeTool extends BaseTool<SearchCodeInput, SearchMatch[]> {
  readonly name = 'search_code';
  readonly description = 'Searches text and code patterns across all files in workspace with line numbers.';
  readonly category = 'read' as const;
  readonly inputSchema = SearchCodeInputSchema;

  private fs: WorkspaceFilesystem;

  constructor(fsInstance: WorkspaceFilesystem) {
    super();
    this.fs = fsInstance;
  }

  async run(input: SearchCodeInput, _context: ToolContext): Promise<SearchMatch[]> {
    return this.fs.searchCode(input.pattern, {
      isRegex: input.isRegex,
      caseSensitive: input.caseSensitive,
      maxResults: input.maxResults,
    });
  }
}
