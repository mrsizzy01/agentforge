# Changelog

All notable changes to AgentForge will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Phase 1: Foundation

### Added

- Modular monorepo architecture using pnpm workspaces and TypeScript project references.
- `@agentforge/types`: Core data structures, tool schemas, and security interfaces.
- `@agentforge/security`: Path traversal blocker, secret detector & redaction engine, command safety analyzer, permission manager, and security audit logger.
- `@agentforge/config`: Configuration manager supporting workspace, global, and environment overrides with Zod validation.
- `@agentforge/filesystem`: Sandboxed workspace filesystem with atomic writes, targeted chunk edits, and search.
- `@agentforge/terminal`: Safe process runner with timeout management and buffer controls.
- `@agentforge/git`: Native Git client for status, unified diffs, commit logs, and safe commits.
- `@agentforge/tools`: BaseTool system, ToolRegistry with JSON Schema / OpenAPI export, and audited ToolExecutor.
- `@agentforge/core`: Central AgentForgeRuntime coordinator and secret-scrubbed logger.
- `@agentforge/cli`: Developer terminal CLI with `doctor`, `init`, `config`, `tools`, `git`, and `version` commands.
- Comprehensive unit test suites across all packages.
- Complete Open Source documentation and GitHub Actions CI workflow.
