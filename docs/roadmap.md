# AgentForge Engineering Roadmap

AgentForge is developed methodically across structured engineering phases.

## Phase 1 — Foundation (Completed)

- [x] Monorepo architecture with pnpm workspaces and TypeScript project references.
- [x] Defense-in-depth security package (PathValidator, SecretDetector, CommandSafetyValidator, PermissionManager, AuditLogger).
- [x] WorkspaceFilesystem with atomic writes, targeted chunk edits, and search.
- [x] ProcessExecutor with timeout handling and safety filtering.
- [x] Native Git client with structured porcelain parser and safe committing.
- [x] Tool registry, BaseTool architecture, and audited execution pipeline.
- [x] Professional developer CLI with `doctor`, `init`, `config`, `tools`, `git`, and diagnostics.
- [x] Comprehensive test suites and Open Source governance.

## Phase 2 — LLM Providers (Upcoming)

- [ ] Provider agnostic abstraction interface (`LLMProvider`).
- [ ] Implementations: OpenAI, Anthropic, Google Gemini, Mistral, Ollama, LM Studio.
- [ ] Streaming response support with real-time chunk consumption.
- [ ] Tool/function calling schema translation.
- [ ] Provider failover and retry logic.

## Phase 3 — Autonomous Agent Loop

- [ ] Planner engine: break tasks into ordered milestones and actions.
- [ ] Context manager: progressive contextualization, history compression.
- [ ] Observe -> Validate -> Repair feedback loop.
- [ ] Dynamic execution error recovery.
- [ ] Human approval interactive confirmation step.

## Phase 4 — Repository Intelligence

- [ ] Language & framework detectors (Node, React, Angular, Nest, Python, etc.).
- [ ] AST parsing and symbol graph extraction.
- [ ] Dependency relationship tree analysis.

## Phase 5 — Project Memory

- [ ] AGENTFORGE.md auto-synchronization and contextual injection.
- [ ] Long-term architectural decision storage.
- [ ] Session persistence across runs.

## Phase 6 — Web Dashboard

- [ ] Real-time task progress and agent timeline.
- [ ] Live visual file diff viewer.
- [ ] Web-based terminal execution activity.

## Phase 7 — Developer Ecosystem

- [ ] Plugin architecture for community tools.
- [ ] VS Code extension integration.
- [ ] CI/CD autonomous action mode.
