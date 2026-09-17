import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext } from '@agentforge/types';
import { WorkspaceFilesystem } from '@agentforge/filesystem';

const DeleteFileInputSchema = z.object({
  path: z.string().describe('Relative path to the file or directory to delete'),
});

type DeleteFileInput = z.infer<typeof DeleteFileInputSchema>;

export class DeleteFileTool extends BaseTool<DeleteFileInput, { deleted: boolean; path: string }> {
  readonly name = 'delete_file';
  readonly description = 'Safely deletes a file or directory within the workspace.';
  readonly category = 'write' as const;
  readonly inputSchema = DeleteFileInputSchema;
  override readonly requiresConfirmation = true;

  private fs: WorkspaceFilesystem;

  constructor(fsInstance: WorkspaceFilesystem) {
    super();
    this.fs = fsInstance;
  }

  async run(input: DeleteFileInput, _context: ToolContext): Promise<{ deleted: boolean; path: string }> {
    await this.fs.deleteFile(input.path);
    return {
      deleted: true,
      path: input.path,
    };
  }
}
