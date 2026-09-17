# Security Architecture

Security is not an afterthought in AgentForge; it is embedded at every layer of the runtime.

## Core Safeguards

### 1. Workspace Boundary Protection
All file operations pass through `PathValidator`. Any path containing relative path traversal (`../`), symlink escapes, or absolute paths outside the declared workspace root is rejected with an `Access denied` security error.

### 2. Secret Redaction Engine
`SecretDetector` continuously scans tool outputs, terminal logs, and system events. Detected secrets (such as OpenAI keys, Anthropic keys, AWS credentials, GitHub tokens, and private keys) are automatically sanitized into `[REDACTED_SECRET]`.

### 3. Dangerous Command Blocker
Commands attempting destructive system operations are analyzed prior to execution:
- `rm -rf /` or recursive wildcard deletions
- Disk formatting tools (`format`, `mkfs`, `diskpart`)
- Fork bombs (`:(){ :|:& };:`)
- Raw disk writes (`dd if=...`)
- System shutdown / reboot

Destructive operations are blocked unconditionally.

### 4. Permission Levels
- **readonly**: Only file and git reads are allowed. Writes and terminal executions are strictly blocked.
- **safe**: Reads are allowed. Writes and terminal commands require user confirmation. Dangerous commands are blocked.
- **interactive** (default): Reads execute automatically; destructive or system-level actions require confirmation.
- **autonomous**: Fully automated execution within safe boundaries; strictly dangerous operations remain blocked.
