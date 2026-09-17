import { AuditRecord, SecurityVerdict, ToolPermissionCategory } from '@agentforge/types';
import crypto from 'node:crypto';

export class AuditLogger {
  private records: AuditRecord[] = [];
  private maxInMemoryRecords: number;

  constructor(maxInMemoryRecords: number = 1000) {
    this.maxInMemoryRecords = maxInMemoryRecords;
  }

  public log(entry: {
    action: string;
    category: ToolPermissionCategory;
    target?: string;
    verdict: SecurityVerdict;
    reason?: string;
    actor?: 'agent' | 'user' | 'system';
    executionTimeMs?: number;
    success?: boolean;
    metadata?: Record<string, unknown>;
  }): AuditRecord {
    const record: AuditRecord = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      action: entry.action,
      category: entry.category,
      target: entry.target,
      verdict: entry.verdict,
      reason: entry.reason,
      actor: entry.actor || 'agent',
      executionTimeMs: entry.executionTimeMs,
      success: entry.success,
      metadata: entry.metadata,
    };

    this.records.push(record);
    if (this.records.length > this.maxInMemoryRecords) {
      this.records.shift();
    }

    return record;
  }

  public getRecords(): ReadonlyArray<AuditRecord> {
    return [...this.records];
  }

  public getRecent(count: number = 20): AuditRecord[] {
    return this.records.slice(-count);
  }

  public clear(): void {
    this.records = [];
  }
}
