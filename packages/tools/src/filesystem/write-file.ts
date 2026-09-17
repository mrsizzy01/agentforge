import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext } from '@agentforge/types';
import { WorkspaceFilesystem } from '@agentforge/filesystem';

const WriteFileInputSchema = z.object({
  path: z.string().describe('Relative path to the file inside workspace'),
  content: z.string().describe('Complete text content to write'),
});

type WriteFileInput = z.infer<typeof WriteFileInputSchema>;

export class WriteFileTool extends BaseTool<WriteFileInput, { path: string; bytesWritten: number }> {
  readonly name = 'write_file';
  readonly description = 'Writes or overwrites a file with full content inside the workspace.';
  readonly category = 'write' as const;
  readonly inputSchema = WriteFileInputSchema;
  override readonly requiresConfirmation = true;

  private fs: WorkspaceFilesystem;

  constructor(fsInstance: WorkspaceFilesystem) {
    super();
    this.fs = fsInstance;
  }

  async run(input: WriteFileInput, _context: ToolContext): Promise<{ path: string; bytesWritten: number }> {
    await this.fs.writeFile(input.path, input.content);
    return {
      path: input.path,
      bytesWritten: Buffer.byteLength(input.content, 'utf-8'),
    };
  }
}
