import fs from 'node:fs';
import path from 'node:path';

export function loadProjectInstructions(
  workspaceRoot: string,
  fileName: string = 'AGENTFORGE.md',
): string | null {
  const filePath = path.join(workspaceRoot, fileName);
  if (fs.existsSync(filePath)) {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }
  return null;
}
