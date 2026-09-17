import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext } from '@agentforge/types';
import { WorkspaceFilesystem } from '@agentforge/filesystem';

const SearchFilesInputSchema = z.object({
  query: z.string().min(1).describe('Filename substring to find in workspace'),
});

type SearchFilesInput = z.infer<typeof SearchFilesInputSchema>;

export class SearchFilesTool extends BaseTool<SearchFilesInput, string[]> {
  readonly name = 'search_files';
  readonly description = 'Finds files by filename or relative path across the workspace.';
  readonly category = 'read' as const;
  readonly inputSchema = SearchFilesInputSchema;

  private fs: WorkspaceFilesystem;

  constructor(fsInstance: WorkspaceFilesystem) {
    super();
    this.fs = fsInstance;
  }

  async run(input: SearchFilesInput, _context: ToolContext): Promise<string[]> {
    return this.fs.searchFiles(input.query);
  }
}
