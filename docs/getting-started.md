# Getting Started with AgentForge

This guide walks you through setting up AgentForge and running your first commands.

## Prerequisites

- **Node.js**: >= 20.0.0
- **pnpm**: >= 9.0.0
- **Git**: Installed and available in PATH

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/agentforge/agentforge.git
cd agentforge
pnpm install
pnpm build
```

## Running the Doctor

To verify that your environment, Node version, Git repository, and permissions are correctly configured:

```bash
pnpm --filter @agentforge/cli dev doctor
```

## Initializing a Project

In any existing or new project repository, run:

```bash
agentforge init
```

This creates:
- `.agentforge/config.json`: Local workspace settings.
- `AGENTFORGE.md`: Project-level instructions, conventions, and architectural notes that AgentForge automatically reads before taking action.
