# Security Policy

## Security Philosophy

AgentForge is built on a **defense-in-depth** model. Because AgentForge executes real tools on developer machines, security is paramount.

Key safety guarantees:
1. **Workspace Boundary Enforcement**: Filesystem tools will reject any path resolving outside the workspace root (`PathValidator`).
2. **Secret Redaction**: Detected API keys, private keys, access tokens, and passwords are automatically redacted from stdout, stderr, logs, and tool results (`SecretDetector`).
3. **Destructive Command Interception**: Commands attempting filesystem erasure (`rm -rf /`, `del /s /q`), disk formatting, fork bombs, or credential tampering are blocked before execution (`CommandSafetyValidator`).
4. **Permissions & Confirmation**: Operations like file writing, command execution, and git commits require confirmation unless explicitly run in autonomous mode (`PermissionManager`).

## Reporting a Vulnerability

If you discover a security vulnerability in AgentForge:
- **Do not open a public issue.**
- Email details and reproduction steps to `security@agentforge.dev`.
- We will acknowledge receipt within 48 hours and work with you on a patch and responsible disclosure timeline.
