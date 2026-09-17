import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext } from '@agentforge/types';

const InputSchema = z.object({
  url: z.string().url().describe('HTTP or HTTPS URL to read and extract documentation from'),
  maxLength: z
    .number()
    .optional()
    .describe('Maximum text length to return in characters (defaults to 25000)'),
});

type Input = z.infer<typeof InputSchema>;

export interface ReadUrlOutput {
  url: string;
  status: number;
  contentType: string;
  content: string;
  length: number;
}

export class ReadUrlTool extends BaseTool<Input, ReadUrlOutput> {
  public readonly name = 'read_url';
  public readonly description =
    'Fetches documentation, articles, or API specifications from a public web URL and extracts clean Markdown content with SSRF protection.';
  public readonly category = 'read' as const;
  public readonly inputSchema = InputSchema;
  public readonly requiresConfirmation = false;

  /**
   * SSRF Protection: Ensure target hostname does not resolve to private / loopback / cloud metadata IP addresses.
   */
  public static isSafeUrl(targetUrl: string): { safe: boolean; reason?: string } {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return { safe: false, reason: 'Invalid URL format.' };
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { safe: false, reason: `Forbidden protocol: ${parsed.protocol}. Only http and https are allowed.` };
    }

    const host = parsed.hostname.toLowerCase();

    // Loopback & local hosts
    if (host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '::1') {
      return { safe: false, reason: 'Access to localhost and loopback interfaces is blocked for security.' };
    }

    // Cloud metadata services
    if (
      host === '169.254.169.254' ||
      host === 'metadata.google.internal' ||
      host === 'metadata.internal' ||
      host === 'instance-data'
    ) {
      return { safe: false, reason: 'Access to cloud instance metadata endpoints is strictly blocked.' };
    }

    // Private IPv4 ranges (RFC 1918)
    const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const b0 = parseInt(ipv4Match[1], 10);
      const b1 = parseInt(ipv4Match[2], 10);

      if (b0 === 10) return { safe: false, reason: 'Access to private 10.0.0.0/8 network is blocked.' };
      if (b0 === 172 && b1 >= 16 && b1 <= 31)
        return { safe: false, reason: 'Access to private 172.16.0.0/12 network is blocked.' };
      if (b0 === 192 && b1 === 168)
        return { safe: false, reason: 'Access to private 192.168.0.0/16 network is blocked.' };
      if (b0 === 0 || b0 === 127) return { safe: false, reason: 'Access to reserved network range is blocked.' };
    }

    return { safe: true };
  }

  /**
   * Convert raw HTML text into clean, readable Markdown without external dependencies.
   */
  public static htmlToMarkdown(html: string): string {
    let text = html;

    // Strip scripts, styles, iframes, SVGs
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    text = text.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
    text = text.replace(/<!--[\s\S]*?-->/g, '');

    // Convert headings
    text = text.replace(/<h1\b[^>]*>(.*?)<\/h1>/gi, '\n# $1\n');
    text = text.replace(/<h2\b[^>]*>(.*?)<\/h2>/gi, '\n## $1\n');
    text = text.replace(/<h3\b[^>]*>(.*?)<\/h3>/gi, '\n### $1\n');
    text = text.replace(/<h4\b[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n');

    // Convert code blocks and inline code
    text = text.replace(/<pre\b[^>]*><code\b[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
    text = text.replace(/<code\b[^>]*>(.*?)<\/code>/gi, '`$1`');

    // Convert links
    text = text.replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');

    // Convert lists and paragraphs
    text = text.replace(/<li\b[^>]*>(.*?)<\/li>/gi, '\n- $1');
    text = text.replace(/<p\b[^>]*>(.*?)<\/p>/gi, '\n\n$1\n\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');

    // Strip remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode standard HTML entities
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');

    // Normalize multiple consecutive blank lines
    return text.replace(/\n{3,}/g, '\n\n').trim();
  }

  public async run(input: Input, context: ToolContext): Promise<ReadUrlOutput> {
    const safetyCheck = ReadUrlTool.isSafeUrl(input.url);
    if (!safetyCheck.safe) {
      throw new Error(`Security Error (SSRF Protection): ${safetyCheck.reason}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const signal = context.abortSignal || controller.signal;

    try {
      const response = await fetch(input.url, {
        method: 'GET',
        headers: {
          'User-Agent': 'AgentForge-DocReader/1.0 (+https://github.com/mrsizzy01/agentforge)',
          Accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9',
        },
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status} ${response.statusText} when fetching ${input.url}`);
      }

      const contentType = response.headers.get('content-type') || 'text/plain';
      const rawText = await response.text();

      let content: string;
      if (contentType.includes('text/html')) {
        content = ReadUrlTool.htmlToMarkdown(rawText);
      } else {
        content = rawText;
      }

      const max = input.maxLength || 25000;
      if (content.length > max) {
        content =
          content.slice(0, max) +
          `\n\n[INFO] Content truncated (${rawText.length} characters total, display limited to ${max})`;
      }

      return {
        url: input.url,
        status: response.status,
        contentType,
        content,
        length: content.length,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
