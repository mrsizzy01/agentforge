# AgentForge

> **Open-source AI agents for real software development.**  
> *Understand. Build. Test. Ship.*

[![CI](https://github.com/agentforge/agentforge/actions/workflows/ci.yml/badge.svg)](https://github.com/agentforge/agentforge/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-orange.svg)](https://pnpm.io/)

AgentForge is not a simple chatbot. It is an extensible, developer-first AI agent platform designed to plug directly into real software repositories to analyze architecture, plan modifications, write clean code, execute tests, and safely interact with Git.

---

## Architecture Overview

```
AgentForge Monorepo
├── apps/
│   ├── cli/              # Professional developer terminal CLI (Commander)
│   └── web/              # Developer dashboard & visual runtime (Phase 6)
│
├── packages/
│   ├── core/             # Central coordinator, runtime lifecycle & structured logging
│   ├── security/         # Sandboxing, path traversal guard, secret detection, permissions
│   ├── tools/            # BaseTool framework, tool registry & execution pipeline
│   ├── filesystem/       # Safe, bounded workspace filesystem operations
│   ├── terminal/         # Sandboxed process execution, timeout & dangerous command blocker
│   ├── git/              # Native Git status, diff, log, staging & commit automation
│   ├── config/           # Configuration manager (dot-notation, Zod validation, AGENTFORGE.md)
│   └── types/            # Shared TypeScript contracts & schemas
```

---

## Key Features (Phase 1: Foundation)

- **Defense-in-Depth Security**: Workspace path-traversal blocker, secret detection & redaction, dangerous command inspection (`rm -rf`, disk wipes, fork bombs), and human-in-the-loop permission tiers (`readonly`, `safe`, `interactive`, `autonomous`).
- **Sandboxed Filesystem**: Atomic file writes, targeted multi-chunk code edits, file size safeguards, binary detection, and recursive search.
- **Safe Terminal Execution**: Cross-platform process execution with configurable timeouts, buffer limit protections, and secret scrubbing on stdout/stderr.
- **Native Git Integration**: Structured branch/status detection, unified diffs, commit log parsing, and commit generation with message checks.
- **Modular Tool Registry**: 12 built-in tools with full JSON Schema / OpenAPI schema export, ready for LLM function calling.
- **System Diagnostics**: Built-in `agentforge doctor` verifying Node, Git, Workspace permissions, and tool health.

---

## Installation & Setup

### Prerequisites
- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Git

### Getting Started

```bash
# Clone the repository
git clone https://github.com/agentforge/agentforge.git
cd agentforge

# Install dependencies
pnpm install

# Build all packages and CLI
pnpm build

# Run system healthcheck
pnpm --filter @agentforge/cli dev doctor
```

---

## CLI Usage

### Initializing a Project

Initialize `.agentforge/config.json` and a project conventions file `AGENTFORGE.md`:

```bash
agentforge init
```

### Running Diagnostics

```bash
agentforge doctor
```

### Inspecting Tools & JSON Schemas

```bash
# List all registered tools
agentforge tools list

# Inspect JSON Schema of a specific tool
agentforge tools inspect read_file
```

### Configuration Management

```bash
# View current configuration
agentforge config list

# Set local provider
agentforge config set provider.type ollama
agentforge config set provider.model llama3
```

### Git Integration

```bash
# Check repository status
agentforge git status

# View working tree diff
agentforge git diff

# Create a commit
agentforge git commit -m "feat: implement security path validator"
```

---

## Safety & Security Policy

AgentForge adheres to strict safety boundaries:
1. **Never writes outside workspace root**: Directory traversal attempts (`../`) are detected and blocked.
2. **Never executes destructive commands**: Commands like `rm -rf /`, formatting utilities, or fork bombs are intercepted and blocked before execution.
3. **Never leaks secrets**: API keys (`sk-...`), private keys (`-----BEGIN PRIVATE KEY-----`), and `.env` credentials are automatically redacted from outputs and logs.
4. **Human Confirmation**: By default (`interactive`), state-modifying actions request explicit developer approval.

See [SECURITY.md](SECURITY.md) and [docs/security.md](docs/security.md) for full details.

---

## Development & Testing

```bash
# Run all unit and integration test suites
pnpm test

# Check types across all packages
pnpm typecheck

# Lint codebase
pnpm lint

# Format codebase
pnpm format
```

---

## Roadmap

- [x] **Phase 1 — Foundation**: Monorepo, Security, Safe Filesystem, Terminal, Git, Tool Pipeline, CLI.
- [ ] **Phase 2 — LLM Providers**: Multi-provider abstraction (OpenAI, Anthropic, Ollama, LM Studio, Mistral), streaming, function calling.
- [ ] **Phase 3 — Autonomous Agent Loop**: Planner, context manager, reflection, validation & repair loop.
- [ ] **Phase 4 — Repository Intelligence**: Framework detector, language detection, AST parser, symbol extraction.
- [ ] **Phase 5 — Persistent Memory**: Long-term memory, session state, project context compression.
- [ ] **Phase 6 — Web Dashboard**: Real-time agent timeline, file diffs, live terminal.
- [ ] **Phase 7 — Ecosystem**: Plugin system, custom tools, VS Code extension.

---

## Contributing & License

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

Distributed under the [Apache-2.0 License](LICENSE).
