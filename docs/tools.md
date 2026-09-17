# Tool Reference

AgentForge provides a built-in suite of 12 tools for Phase 1. Each tool defines a Zod input schema and can export OpenAPI/JSON Schema for model function calling.

## Filesystem Tools

- **`read_file`**: Reads text files safely with size limits and line-range slicing.
- **`write_file`**: Writes or overwrites a file atomically inside the workspace.
- **`edit_file`**: Performs targeted text replacements (old content -> new content) with uniqueness verification.
- **`delete_file`**: Safely deletes a file or directory within workspace boundaries.
- **`list_directory`**: Lists files and folders with depth control and ignore patterns (`node_modules`, `.git`, `dist`).
- **`search_files`**: Finds files by name across the workspace.
- **`search_code`**: Fast text search across files returning matching line numbers and columns.

## Terminal Tools

- **`run_command`**: Runs shell commands with timeouts, buffer controls, and destructive command filtering.

## Git Tools

- **`git_status`**: Provides structured status (branch, modified files, staged files, untracked files).
- **`git_diff`**: Generates unified diffs for working tree or staged changes.
- **`git_log`**: Fetches recent commit history with author, date, and commit messages.
- **`git_commit`**: Stages files and creates commits with message validation.
