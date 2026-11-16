import { randomUUID } from 'node:crypto';
import type { Run } from '@afterhours/game-engine';
import type { CaseStore, Owner, StoredRun } from './store.ts';

type Row = StoredRun & { userId: string | null; guestTokenHash: string | null };

/** In-memory CaseStore for tests and for running the API without a database. */
export class MemoryCaseStore implements CaseStore {
  private readonly rows = new Map<string, Row>();

  private match(owner: Owner, caseId: string): Row | undefined {
    return [...this.rows.values()].find(
      (r) => r.caseId === caseId && (owner.kind === 'user' ? r.userId === owner.userId : r.guestTokenHash === owner.tokenHash),
    );
  }

  private static out(r: Row): StoredRun {
    return { id: r.id, caseId: r.caseId, state: structuredClone(r.state), version: r.version };
  }

  async findRun(owner: Owner, caseId: string): Promise<StoredRun | null> {
    const row = this.match(owner, caseId);
    return row ? MemoryCaseStore.out(row) : null;
  }

  async createRun(owner: Owner, caseId: string, state: Run): Promise<StoredRun> {
    const existing = this.match(owner, caseId);
    if (existing) return MemoryCaseStore.out(existing);
    const row: Row = {
      id: randomUUID(),
      caseId,
      state: structuredClone(state),
      version: 1,
      userId: owner.kind === 'user' ? owner.userId : null,
      guestTokenHash: owner.kind === 'guest' ? owner.tokenHash : null,
    };
    this.rows.set(row.id, row);
    return MemoryCaseStore.out(row);
  }

  async saveRun(id: string, state: Run, expectedVersion: number): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.version !== expectedVersion) return false;
    row.state = structuredClone(state);
    row.version += 1;
    return true;
  }

  async claimGuestRun(tokenHash: string, userId: string, caseId: string): Promise<boolean> {
    const guest = this.match({ kind: 'guest', tokenHash }, caseId);
    if (!guest || this.match({ kind: 'user', userId }, caseId)) return false;
    guest.userId = userId;
    guest.guestTokenHash = null;
    return true;
  }
}
