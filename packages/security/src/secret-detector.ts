import { SecretMatch } from '@agentforge/types';

interface SecretPattern {
  type: string;
  regex: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  {
    type: 'Anthropic API Key',
    regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g,
  },
  {
    type: 'OpenAI API Key',
    regex: /sk-(?!ant-)[a-zA-Z0-9_-]{20,}/g,
  },
  {
    type: 'GitHub Personal Access Token',
    regex: /gh[pousr]_[A-Za-z0-9_]{36,255}/g,
  },
  {
    type: 'AWS Access Key ID',
    regex: /(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/g,
  },
  {
    type: 'Generic Private Key',
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    type: 'Slack Token',
    regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/g,
  },
  {
    type: 'Google Cloud API Key',
    regex: /AIza[0-9A-Za-z\\-_]{35}/g,
  },
  {
    type: 'Generic Bearer Token',
    regex: /Bearer\s+([a-zA-Z0-9_.-]{25,})/gi,
  },
  {
    type: 'Generic Password Assignment',
    regex: /(?:password|passwd|secret|api_key|apikey|auth_token)\s*[:=]\s*["']([^"'\s]{8,})["']/gi,
  },
];

export class SecretDetector {
  private customPatterns: SecretPattern[] = [];

  constructor(additionalPatterns?: SecretPattern[]) {
    if (additionalPatterns) {
      this.customPatterns = additionalPatterns;
    }
  }

  public findSecrets(text: string): SecretMatch[] {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const matches: SecretMatch[] = [];
    const allPatterns = [...SECRET_PATTERNS, ...this.customPatterns];

    for (const pattern of allPatterns) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        const fullMatch = match[0];
        const secretVal = match[1] || fullMatch;
        const preview =
          secretVal.length > 8
            ? `${secretVal.slice(0, 4)}...${secretVal.slice(-4)}`
            : '[REDACTED]';

        matches.push({
          type: pattern.type,
          preview,
          index: match.index,
          length: fullMatch.length,
        });

        if (!regex.global) break;
      }
    }

    return matches;
  }

  public hasSecrets(text: string): boolean {
    return this.findSecrets(text).length > 0;
  }

  public redactSecrets(text: string, replacement: string = '[REDACTED_SECRET]'): string {
    if (!text || typeof text !== 'string') {
      return text;
    }

    let redacted = text;
    const allPatterns = [...SECRET_PATTERNS, ...this.customPatterns];

    for (const pattern of allPatterns) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      redacted = redacted.replace(regex, (fullMatch, captureGroup) => {
        if (captureGroup) {
          return fullMatch.replace(captureGroup, replacement);
        }
        return replacement;
      });
    }

    return redacted;
  }
}
