import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext } from '@agentforge/types';
import { WorkspaceFilesystem } from '@agentforge/filesystem';

export interface PatchChunk {
  search: string;
  replace: string;
}

const ApplyPatchInputSchema = z.object({
  path: z.string().describe('Relative path to the target file in the workspace'),
  patch: z
    .string()
    .describe(
      'Patch text containing one or more blocks in the format:\n<<<<<<< SEARCH\n[exact code to find]\n=======\n[replacement code]\n>>>>>>> REPLACE',
    ),
});

export type ApplyPatchInput = z.infer<typeof ApplyPatchInputSchema>;

export interface ApplyPatchOutput {
  applied: boolean;
  chunksApplied: number;
  message: string;
  path: string;
}

export class ApplyPatchTool extends BaseTool<ApplyPatchInput, ApplyPatchOutput> {
  readonly name = 'apply_patch';
  readonly description =
    'Surgically applies code modifications to a file using SEARCH/REPLACE blocks. Recommended for editing existing code without rewriting whole files.';
  readonly category = 'write' as const;
  readonly inputSchema = ApplyPatchInputSchema;
  override readonly requiresConfirmation = true;

  private fs: WorkspaceFilesystem;

  constructor(fsInstance: WorkspaceFilesystem) {
    super();
    this.fs = fsInstance;
  }

  /**
   * Parse SEARCH/REPLACE blocks from the patch string.
   */
  public static parsePatchBlocks(patchText: string): PatchChunk[] {
    const chunks: PatchChunk[] = [];
    const normalized = patchText.replace(/\r\n/g, '\n');

    const searchMarker = '<<<<<<< SEARCH';
    const dividerMarker = '=======';
    const replaceMarker = '>>>>>>> REPLACE';

    let currentIndex = 0;

    while (currentIndex < normalized.length) {
      const searchStart = normalized.indexOf(searchMarker, currentIndex);
      if (searchStart === -1) break;

      const searchBodyStart = searchStart + searchMarker.length;
      // Skip the newline immediately following <<<<<<< SEARCH if present
      const adjustedSearchBodyStart =
        normalized[searchBodyStart] === '\n' ? searchBodyStart + 1 : searchBodyStart;

      const dividerStart = normalized.indexOf(dividerMarker, adjustedSearchBodyStart);
      if (dividerStart === -1) {
        throw new Error(
          'Malformed patch: found "<<<<<<< SEARCH" without matching "=======" divider.',
        );
      }

      const searchBlock = normalized.slice(adjustedSearchBodyStart, dividerStart);
      // Strip trailing newline before divider if present
      const cleanSearch = searchBlock.endsWith('\n') ? searchBlock.slice(0, -1) : searchBlock;

      const replaceBodyStart = dividerStart + dividerMarker.length;
      const adjustedReplaceBodyStart =
        normalized[replaceBodyStart] === '\n' ? replaceBodyStart + 1 : replaceBodyStart;

      const replaceEnd = normalized.indexOf(replaceMarker, adjustedReplaceBodyStart);
      if (replaceEnd === -1) {
        throw new Error(
          'Malformed patch: found "=======" without matching ">>>>>>> REPLACE" marker.',
        );
      }

      const replaceBlock = normalized.slice(adjustedReplaceBodyStart, replaceEnd);
      const cleanReplace = replaceBlock.endsWith('\n') ? replaceBlock.slice(0, -1) : replaceBlock;

      chunks.push({
        search: cleanSearch,
        replace: cleanReplace,
      });

      currentIndex = replaceEnd + replaceMarker.length;
    }

    if (chunks.length === 0) {
      throw new Error(
        'No valid <<<<<<< SEARCH / ======= / >>>>>>> REPLACE blocks found in patch text.',
      );
    }

    return chunks;
  }

  /**
   * Apply replacement chunk to content using robust matching strategies:
   * 1. Exact match
   * 2. Normalized newline match (CRLF / LF)
   * 3. Trimmed trailing whitespace per line
   */
  public static applyChunk(content: string, chunk: PatchChunk, chunkIndex: number): string {
    // Strategy 1: Exact match
    if (content.includes(chunk.search)) {
      const occurrences = content.split(chunk.search).length - 1;
      if (occurrences > 1) {
        throw new Error(
          `Chunk #${chunkIndex + 1} failed: SEARCH block matches ${occurrences} times in file. Provide more surrounding context lines to make it unique.`,
        );
      }
      return content.replace(chunk.search, chunk.replace);
    }

    // Strategy 2: Normalized newline match (LF)
    const normContent = content.replace(/\r\n/g, '\n');
    const normSearch = chunk.search.replace(/\r\n/g, '\n');
    const normReplace = chunk.replace.replace(/\r\n/g, '\n');

    if (normContent.includes(normSearch)) {
      const occurrences = normContent.split(normSearch).length - 1;
      if (occurrences > 1) {
        throw new Error(
          `Chunk #${chunkIndex + 1} failed: SEARCH block matches ${occurrences} times after newline normalization. Provide more surrounding context lines.`,
        );
      }
      const replacedNorm = normContent.replace(normSearch, normReplace);
      // Preserve original line endings if file was CRLF
      return content.includes('\r\n') ? replacedNorm.replace(/\n/g, '\r\n') : replacedNorm;
    }

    // Strategy 3: Trimmed lines match (ignoring trailing whitespace)
    const contentLines = normContent.split('\n');
    const searchLines = normSearch.split('\n');

    if (searchLines.length > 0 && searchLines.length <= contentLines.length) {
      const trimmedSearch = searchLines.map((l) => l.trimEnd());
      const matchIndices: number[] = [];

      for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
        let matches = true;
        for (let j = 0; j < searchLines.length; j++) {
          if (contentLines[i + j].trimEnd() !== trimmedSearch[j]) {
            matches = false;
            break;
          }
        }
        if (matches) {
          matchIndices.push(i);
        }
      }

      if (matchIndices.length === 1) {
        const start = matchIndices[0];
        const before = contentLines.slice(0, start);
        const after = contentLines.slice(start + searchLines.length);
        const replacedLines = [...before, ...normReplace.split('\n'), ...after];
        const result = replacedLines.join('\n');
        return content.includes('\r\n') ? result.replace(/\n/g, '\r\n') : result;
      }

      if (matchIndices.length > 1) {
        throw new Error(
          `Chunk #${chunkIndex + 1} failed: SEARCH block matches ${matchIndices.length} locations when ignoring trailing whitespace. Add more unique context.`,
        );
      }
    }

    throw new Error(
      `Chunk #${chunkIndex + 1} failed: SEARCH block was not found in target file.\nSearch target preview:\n${chunk.search.slice(0, 300)}...`,
    );
  }

  async run(input: ApplyPatchInput, _context: ToolContext): Promise<ApplyPatchOutput> {
    const chunks = ApplyPatchTool.parsePatchBlocks(input.patch);
    let content = await this.fs.readFile(input.path);

    for (let i = 0; i < chunks.length; i++) {
      content = ApplyPatchTool.applyChunk(content, chunks[i], i);
    }

    await this.fs.writeFile(input.path, content);

    return {
      applied: true,
      chunksApplied: chunks.length,
      message: `Successfully applied ${chunks.length} patch chunk(s) to ${input.path}`,
      path: input.path,
    };
  }
}
