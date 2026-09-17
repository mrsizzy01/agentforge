import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext, FileInfo } from '@agentforge/types';
import { WorkspaceFilesystem } from '@agentforge/filesystem';

const ListDirInputSchema = z.object({
  path: z.string().default('.').describe('Directory path relative to workspace root'),
  recursive: z.boolean().default(false).describe('Whether to list recursively'),
  maxDepth: z.number().int().positive().optional().describe('Maximum recursion depth'),
});

type ListDirInput = z.infer<typeof ListDirInputSchema>;

export class ListDirectoryTool extends BaseTool<ListDirInput, FileInfo[]> {
  readonly name = 'list_directory';
  readonly description = 'Lists files and directories within a workspace directory path.';
  readonly category = 'read' as const;
  readonly inputSchema = ListDirInputSchema;

  private fs: WorkspaceFilesystem;

  constructor(fsInstance: WorkspaceFilesystem) {
    super();
    this.fs = fsInstance;
  }

  async run(input: ListDirInput, _context: ToolContext): Promise<FileInfo[]> {
    return this.fs.listDirectory(input.path, {
      recursive: input.recursive,
      maxDepth: input.maxDepth,
    });
  }
}
