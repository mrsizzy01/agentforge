import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext } from '@agentforge/types';
import { WorkspaceFilesystem } from '@agentforge/filesystem';

const ReadFileInputSchema = z.object({
  path: z.string().describe('Relative path to the file inside workspace'),
  startLine: z.number().int().positive().optional().describe('Optional 1-indexed starting line'),
  endLine: z.number().int().positive().optional().describe('Optional 1-indexed ending line'),
});

type ReadFileInput = z.infer<typeof ReadFileInputSchema>;

export class ReadFileTool extends BaseTool<ReadFileInput, string> {
  readonly name = 'read_file';
  readonly description = 'Reads text content from a file within the project workspace.';
  readonly category = 'read' as const;
  readonly inputSchema = ReadFileInputSchema;

  private fs: WorkspaceFilesystem;

  constructor(fsInstance: WorkspaceFilesystem) {
    super();
    this.fs = fsInstance;
  }

  async run(input: ReadFileInput, _context: ToolContext): Promise<string> {
    return this.fs.readFile(input.path, {
      startLine: input.startLine,
      endLine: input.endLine,
    });
  }
}
