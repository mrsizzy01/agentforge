import { CommandSafetyAnalysis } from '@agentforge/types';

interface DangerousRule {
  pattern: RegExp;
  reason: string;
  blocked: boolean; // true = completely blocked; false = requires confirmation
}

const DANGEROUS_RULES: DangerousRule[] = [
  // System destruction & disk formatting
  {
    pattern: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\s+[/\\](?:\s|$)/i,
    reason: 'Root directory deletion attempt (rm -rf /).',
    blocked: true,
  },
  {
    pattern: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\s+[*~]/i,
    reason: 'Unrestricted wildcard/home recursive deletion.',
    blocked: true,
  },
  {
    pattern: /(?:^|[\s;|&])(?:format\s+[a-zA-Z]:(?:\s|$)|(?:mkfs(?:\.[a-z0-9]+)?|diskpart)\b)/i,
    reason: 'Filesystem/disk format utility execution.',
    blocked: true,
  },
  {
    pattern: /\bdd\s+if=/i,
    reason: 'Direct raw disk write operation (dd).',
    blocked: true,
  },
  {
    pattern: /\b(?:del|erase|rd|rmdir)\s+\/[sq]\s+[a-zA-Z]:\\/i,
    reason: 'System drive root deletion attempt.',
    blocked: true,
  },
  {
    pattern: /:\(\)\{\s*:\|:&\s*\};:/,
    reason: 'Fork bomb exploit attempt.',
    blocked: true,
  },
  // System control
  {
    pattern: /\b(?:shutdown|reboot|poweroff|init\s+[06])\b/i,
    reason: 'Machine shutdown/reboot command.',
    blocked: true,
  },
  // Untrusted remote code execution
  {
    pattern: /\b(?:curl|wget|fetch)\s+[^|]+\|\s*(?:ba|z|da|k)?sh\b/i,
    reason: 'Piping remote web content directly into a shell interpreter.',
    blocked: true,
  },
  // Credential tampering / exfiltration
  {
    pattern: />>\s*(?:\/etc\/passwd|\/etc\/shadow|\/etc\/sudoers)/i,
    reason: 'Attempt to overwrite critical system security files.',
    blocked: true,
  },
  // Operations requiring explicit confirmation (safe to run once confirmed)
  {
    pattern: /\b(?:npm|pnpm|yarn|bun)\s+(?:publish|login)\b/i,
    reason: 'Package manager publishing or credential login.',
    blocked: false,
  },
  {
    pattern: /\bgit\s+push\s+(?:--force|-f)\b/i,
    reason: 'Force push to remote Git repository.',
    blocked: false,
  },
  {
    pattern: /\bgit\s+reset\s+--hard\b/i,
    reason: 'Hard reset will discard all uncommitted changes in Git working tree.',
    blocked: false,
  },
  {
    pattern: /\b(?:drop\s+database|truncate\s+table)\b/i,
    reason: 'Destructive database schema operation.',
    blocked: false,
  },
];

export class CommandSafetyValidator {
  private customBlockedPatterns: RegExp[] = [];

  constructor(customBlockedPatterns: string[] = []) {
    this.customBlockedPatterns = customBlockedPatterns.map(
      (p) => new RegExp(p, 'i'),
    );
  }

  public analyze(command: string): CommandSafetyAnalysis {
    if (!command || typeof command !== 'string') {
      return {
        classification: 'dangerous',
        command: '',
        reasons: ['Command must be a non-empty string.'],
        isBlocked: true,
        requiresConfirmation: false,
      };
    }

    const trimmed = command.trim();
    const reasons: string[] = [];
    let isBlocked = false;
    let requiresConfirmation = false;

    // Check user-configured blocked patterns
    for (const pattern of this.customBlockedPatterns) {
      if (pattern.test(trimmed)) {
        reasons.push(`Command matches custom blocked pattern: ${pattern.source}`);
        isBlocked = true;
      }
    }

    // Check built-in dangerous rules
    for (const rule of DANGEROUS_RULES) {
      if (rule.pattern.test(trimmed)) {
        reasons.push(rule.reason);
        if (rule.blocked) {
          isBlocked = true;
        } else {
          requiresConfirmation = true;
        }
      }
    }

    if (isBlocked) {
      return {
        classification: 'dangerous',
        command: trimmed,
        reasons,
        isBlocked: true,
        requiresConfirmation: false,
      };
    }

    if (requiresConfirmation) {
      return {
        classification: 'needs_approval',
        command: trimmed,
        reasons,
        isBlocked: false,
        requiresConfirmation: true,
      };
    }

    return {
      classification: 'safe',
      command: trimmed,
      reasons: [],
      isBlocked: false,
      requiresConfirmation: false,
    };
  }
}
