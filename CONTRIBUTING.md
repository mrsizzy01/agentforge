# Contributing to AgentForge

Thank you for your interest in contributing to **AgentForge**! We are committed to building an open, robust, and reliable AI agent infrastructure for software engineers.

## Development Workflow

1. **Fork and clone** the repository.
2. Ensure you have **Node.js >= 20** and **pnpm >= 9** installed.
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Build the monorepo:
   ```bash
   pnpm build
   ```
5. Run tests:
   ```bash
   pnpm test
   ```

## Commit Guidelines

We use **Conventional Commits**:
- `feat:` for new features or capabilities
- `fix:` for bug fixes
- `docs:` for documentation additions or improvements
- `refactor:` for internal code cleanup without behavioral changes
- `test:` for adding or updating tests
- `chore:` for tooling or configuration maintenance

## Pull Request Process

1. Create a descriptive feature branch: `git checkout -b feat/my-new-tool`
2. Add unit tests for any new behavior or security checks.
3. Verify all quality gates pass locally before submitting:
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```
4. Submit a Pull Request targeting the `main` branch.
