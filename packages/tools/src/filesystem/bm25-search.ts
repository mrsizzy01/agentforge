import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext } from '@agentforge/types';
import { WorkspaceFilesystem } from '@agentforge/filesystem';

const InputSchema = z.object({
  query: z.string().describe('Search query in natural language or code terms (e.g. "JWT token expiration", "user auth")'),
  limit: z.number().int().positive().optional().describe('Maximum number of ranked files to return (default: 5)'),
  fileExtensions: z.array(z.string()).optional().describe('Optional list of file extensions to include, e.g. [".ts", ".js"]'),
});

type Input = z.infer<typeof InputSchema>;

export interface BM25SearchResult {
  path: string;
  score: number;
  matchingTerms: string[];
  snippet?: string;
  line: number;
}

export interface BM25SearchOutput {
  query: string;
  totalIndexedFiles: number;
  matches: BM25SearchResult[];
}

export class BM25SearchTool extends BaseTool<Input, BM25SearchOutput> {
  public readonly name = 'bm25_search';
  public readonly description =
    'Fast in-memory probabilistic BM25 search over the codebase. Handles camelCase/snake_case code tokenization to find relevant files from natural language descriptions in milliseconds.';
  public readonly category = 'read' as const;
  public readonly inputSchema = InputSchema;
  public readonly requiresConfirmation = false;

  private fs: WorkspaceFilesystem;

  constructor(fs: WorkspaceFilesystem) {
    super();
    this.fs = fs;
  }

  /**
   * Code-aware tokenizer that splits camelCase, PascalCase, snake_case, and kebab-case.
   */
  public static tokenizeCode(text: string): string[] {
    const rawTokens = text.split(/[^A-Za-z0-9_]+/);
    const result: string[] = [];

    for (const token of rawTokens) {
      if (!token) continue;

      // Split on underscore
      const parts = token.split('_');
      for (const part of parts) {
        if (!part) continue;

        // Split camelCase and PascalCase
        const subParts = part.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' ');
        for (const sp of subParts) {
          const lower = sp.toLowerCase();
          if (lower.length > 1) {
            result.push(lower);
          }
        }
      }
    }

    return result;
  }

  public async run(input: Input, _context: ToolContext): Promise<BM25SearchOutput> {
    const limit = input.limit || 5;
    const allowedExts = input.fileExtensions || [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.mjs',
      '.cjs',
      '.py',
      '.go',
      '.rs',
      '.json',
      '.md',
    ];

    const allFiles = await this.fs.listDirectory('.', { recursive: true });
    const targetFiles = allFiles.filter(
      (f) => f.isFile && allowedExts.some((ext) => f.name.endsWith(ext)),
    );

    if (targetFiles.length === 0) {
      return {
        query: input.query,
        totalIndexedFiles: 0,
        matches: [],
      };
    }

    // 1. Index documents in-memory
    interface DocumentEntry {
      path: string;
      content: string;
      tokens: string[];
      termFreqs: Map<string, number>;
      length: number;
    }

    const documents: DocumentEntry[] = [];
    const docFreq: Map<string, number> = new Map(); // Number of docs containing term
    let totalLength = 0;

    for (const file of targetFiles) {
      const normalizedPath = file.relativePath.replace(/\\/g, '/');
      let content = '';
      try {
        content = await this.fs.readFile(normalizedPath);
      } catch {
        continue;
      }

      const tokens = BM25SearchTool.tokenizeCode(content);
      const termFreqs: Map<string, number> = new Map();

      for (const t of tokens) {
        termFreqs.set(t, (termFreqs.get(t) || 0) + 1);
      }

      for (const term of termFreqs.keys()) {
        docFreq.set(term, (docFreq.get(term) || 0) + 1);
      }

      totalLength += tokens.length;
      documents.push({
        path: normalizedPath,
        content,
        tokens,
        termFreqs,
        length: tokens.length,
      });
    }

    const N = documents.length;
    if (N === 0) {
      return { query: input.query, totalIndexedFiles: 0, matches: [] };
    }

    const avgdl = totalLength / N;
    const k1 = 1.5;
    const b = 0.75;

    const queryTokens = BM25SearchTool.tokenizeCode(input.query);
    if (queryTokens.length === 0) {
      return { query: input.query, totalIndexedFiles: N, matches: [] };
    }

    // 2. Score documents using Okapi BM25
    const scored: Array<{ doc: DocumentEntry; score: number; matchedTerms: string[] }> = [];

    for (const doc of documents) {
      let score = 0;
      const matchedTerms: string[] = [];

      for (const q of queryTokens) {
        const tf = doc.termFreqs.get(q) || 0;
        if (tf > 0) {
          matchedTerms.push(q);
          const nq = docFreq.get(q) || 0;
          // IDF with smoothing
          const idf = Math.log(1 + (N - nq + 0.5) / (nq + 0.5));
          const denom = tf + k1 * (1 - b + (b * doc.length) / avgdl);
          score += (idf * (tf * (k1 + 1))) / denom;
        }
      }

      if (score > 0) {
        scored.push({ doc, score, matchedTerms });
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // 3. Format top results with relevant snippets
    const topMatches = scored.slice(0, limit);
    const matches: BM25SearchResult[] = [];

    for (const item of topMatches) {
      const lines = item.doc.content.split(/\r?\n/);
      let bestLine = 1;
      let maxHits = 0;

      for (let i = 0; i < lines.length; i++) {
        const lineLower = lines[i].toLowerCase();
        const hits = item.matchedTerms.filter((term) => lineLower.includes(term)).length;
        if (hits > maxHits) {
          maxHits = hits;
          bestLine = i + 1;
        }
      }

      // Extract 3-line snippet around bestLine
      const startLine = Math.max(1, bestLine - 1);
      const endLine = Math.min(lines.length, bestLine + 1);
      const snippet = lines.slice(startLine - 1, endLine).join('\n');

      matches.push({
        path: item.doc.path,
        score: Math.round(item.score * 100) / 100,
        matchingTerms: Array.from(new Set(item.matchedTerms)),
        snippet,
        line: bestLine,
      });
    }

    return {
      query: input.query,
      totalIndexedFiles: N,
      matches,
    };
  }
}
