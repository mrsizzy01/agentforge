import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface FileBackupRecord {
  originalRelativePath: string;
  backupPath: string;
  timestamp: number;
}

export interface SessionRecord {
  id: string;
  task: string;
  createdAt: number;
  completedAt?: number;
  status: 'running' | 'completed' | 'failed' | 'rolled_back';
  backups: FileBackupRecord[];
}

export class SessionManager {
  private workspaceRoot: string;
  private sessionsDir: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.sessionsDir = path.join(this.workspaceRoot, '.agentforge', 'sessions');
  }

  private ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  public createSession(task: string): SessionRecord {
    this.ensureDir(this.sessionsDir);
    const id = `session_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const sessionDir = path.join(this.sessionsDir, id);
    this.ensureDir(sessionDir);
    this.ensureDir(path.join(sessionDir, 'backups'));

    const record: SessionRecord = {
      id,
      task,
      createdAt: Date.now(),
      status: 'running',
      backups: [],
    };

    const sessionFilePath = path.join(sessionDir, 'session.json');
    fs.writeFileSync(sessionFilePath, JSON.stringify(record, null, 2), 'utf-8');

    return record;
  }

  public async recordFileBackup(sessionId: string, relativeFilePath: string): Promise<string | null> {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const sourcePath = path.resolve(this.workspaceRoot, relativeFilePath);
    if (!fs.existsSync(sourcePath)) {
      return null; // File is newly created, no backup needed
    }

    // Only backup once per session to preserve initial original state
    const existing = session.backups.find((b) => b.originalRelativePath === relativeFilePath);
    if (existing) {
      return existing.backupPath;
    }

    const backupSubdir = path.join(this.sessionsDir, sessionId, 'backups');
    this.ensureDir(backupSubdir);

    const safeBackupFilename = `${Date.now()}_${path.basename(relativeFilePath)}`;
    const backupDest = path.join(backupSubdir, safeBackupFilename);

    await fs.promises.copyFile(sourcePath, backupDest);

    const record: FileBackupRecord = {
      originalRelativePath: relativeFilePath,
      backupPath: backupDest,
      timestamp: Date.now(),
    };

    session.backups.push(record);
    this.saveSession(session);

    return backupDest;
  }

  public completeSession(sessionId: string, status: 'completed' | 'failed' = 'completed'): void {
    const session = this.getSession(sessionId);
    if (!session) return;

    session.status = status;
    session.completedAt = Date.now();
    this.saveSession(session);
  }

  public getSession(sessionId: string): SessionRecord | null {
    const sessionFilePath = path.join(this.sessionsDir, sessionId, 'session.json');
    if (!fs.existsSync(sessionFilePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(sessionFilePath, 'utf-8');
      return JSON.parse(content) as SessionRecord;
    } catch {
      return null;
    }
  }

  public listSessions(): SessionRecord[] {
    if (!fs.existsSync(this.sessionsDir)) {
      return [];
    }

    const entries = fs.readdirSync(this.sessionsDir, { withFileTypes: true });
    const sessions: SessionRecord[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sess = this.getSession(entry.name);
        if (sess) {
          sessions.push(sess);
        }
      }
    }

    return sessions.sort((a, b) => b.createdAt - a.createdAt);
  }

  public async rollback(sessionId?: string): Promise<{
    success: boolean;
    restoredFiles: string[];
    error?: string;
  }> {
    let targetSession: SessionRecord | null = null;

    if (sessionId) {
      targetSession = this.getSession(sessionId);
    } else {
      const sessions = this.listSessions();
      targetSession = sessions[0] || null;
    }

    if (!targetSession) {
      return {
        success: false,
        restoredFiles: [],
        error: sessionId ? `Session not found: ${sessionId}` : 'No past sessions available to rollback.',
      };
    }

    const restored: string[] = [];

    for (const backup of targetSession.backups) {
      if (fs.existsSync(backup.backupPath)) {
        const dest = path.resolve(this.workspaceRoot, backup.originalRelativePath);
        this.ensureDir(path.dirname(dest));
        await fs.promises.copyFile(backup.backupPath, dest);
        restored.push(backup.originalRelativePath);
      }
    }

    targetSession.status = 'rolled_back';
    this.saveSession(targetSession);

    return {
      success: true,
      restoredFiles: restored,
    };
  }

  private saveSession(session: SessionRecord): void {
    const sessionFilePath = path.join(this.sessionsDir, session.id, 'session.json');
    fs.writeFileSync(sessionFilePath, JSON.stringify(session, null, 2), 'utf-8');
  }
}
