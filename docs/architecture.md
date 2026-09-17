# AgentForge Architecture

AgentForge is built as a modular TypeScript monorepo where each package has a single, well-defined responsibility.

## Monorepo Layout

```
packages/
├── types/         # Pure TypeScript contracts, Zod schemas, and data structures
├── security/      # Sandboxing, path traversal protection, secret detection & permissions
├── filesystem/    # Sandboxed workspace filesystem with atomic writes and search
├── terminal/      # Safe process execution, timeouts, buffer control
├── git/           # Native Git client for status, diff, log, and commits
├── config/        # Hierarchical configuration loader and AGENTFORGE.md parser
├── tools/         # Tool base class, registry, and execution pipeline
└── core/          # Central runtime coordinator, error hierarchy, and structured logger

apps/
└── cli/           # Commander-based terminal interface
```

## Tool Execution Lifecycle

Every tool call undergoes a strict multi-step execution pipeline:

```
[Tool Call Request]
        │
        ▼
[Security Validation Hook]  ──► (Blocks dangerous patterns)
        │
        ▼
[Permission Evaluation]     ──► (Checks 'readonly', 'safe', 'interactive', 'autonomous')
        │
        ▼
[Human Confirmation]       ──► (Required if sensitive or in interactive mode)
        │
        ▼
[Tool Execution]           ──► (Runs bounded in workspace)
        │
        ▼
[Secret Redaction]         ──► (Masks API keys & passwords from results)
        │
        ▼
[Security Audit Log]       ──► (Records timestamp, verdict, metrics)
        │
        ▼
[Structured Result]
```
