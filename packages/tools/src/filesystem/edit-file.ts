import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext } from '@agentforge/types';
import { WorkspaceFilesystem } from '@agentforge/filesystem';

const EditChunkSchema = z.object({
  oldContent: z.string().describe('Exact block of code/text to replace'),
  newContent: z.string().describe('New content to replace with'),
});

const EditFileInputSchema = z.object({
  path: z.string().describe('Relative path to the file inside workspace'),
  edits: z.array(EditChunkSchema).min(1).describe('List of replacement chunks'),
});

type EditFileInput = z.infer<typeof EditFileInputSchema>;

export class EditFileTool extends BaseTool<
  EditFileInput,
  { modified: boolean; chunksApplied: number }
> {
  readonly name = 'edit_file';
  readonly description = 'Performs targeted exact-match replacements on a file in the workspace.';
  readonly category = 'write' as const;
  readonly inputSchema = EditFileInputSchema;
  override readonly requiresConfirmation = true;

  private fs: WorkspaceFilesystem;

  constructor(fsInstance: WorkspaceFilesystem) {
    super();
    this.fs = fsInstance;
  }

  async run(
    input: EditFileInput,
    _context: ToolContext,
  ): Promise<{ modified: boolean; chunksApplied: number }> {
    const res = await this.fs.editFile(input.path, input.edits);
    return {
      modified: res.modified,
      chunksApplied: input.edits.length,
    };
  }
}
