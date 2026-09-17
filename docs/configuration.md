# Configuration Guide

AgentForge uses a hierarchical configuration system.

## Configuration Precedence

Settings are merged in the following order of precedence (highest priority first):
1. Command-line flags (e.g. `--non-interactive`, `--cwd`)
2. Local workspace configuration: `<project>/.agentforge/config.json`
3. Global user configuration: `~/.agentforge/config.json`
4. Environment variables (`AGENTFORGE_*`, `OPENAI_API_KEY`)
5. Built-in defaults

## Configuration File Schema

```json
{
  "version": "0.1.0",
  "telemetry": false,
  "logLevel": "info",
  "security": {
    "permissionLevel": "interactive",
    "allowedDirectories": [],
    "blockedCommands": [],
    "sensitiveFilePatterns": [
      "**/.env*",
      "**/id_rsa*",
      "**/*.pem",
      "**/*.key"
    ],
    "maxFileSizeBytes": 5242880,
    "commandTimeoutMs": 60000
  },
  "provider": {
    "type": "openai",
    "model": "gpt-4o",
    "temperature": 0.2
  },
  "customInstructionsFile": "AGENTFORGE.md"
}
```

## CLI Configuration Commands

```bash
# View configuration
agentforge config list

# Set local provider
agentforge config set provider.type ollama
agentforge config set provider.model codellama

# Set global default
agentforge config set security.permissionLevel safe --global
```
