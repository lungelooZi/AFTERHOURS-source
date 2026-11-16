import type { Run } from '@afterhours/game-engine';
import type pg from 'pg';
import type { CaseStore, Owner, StoredRun } from './store.ts';

type Row = { id: string; case_id: string; state: unknown; version: number };
const toStored = (r: Row): StoredRun => ({ id: r.id, caseId: r.case_id, state: r.state, version: r.version });

const ownerColumn = (owner: Owner) => (owner.kind === 'user' ? 'user_id' : 'guest_token_hash');
const ownerValue = (owner: Owner) => (owner.kind === 'user' ? owner.userId : owner.tokenHash);

export class PostgresCaseStore implements CaseStore {
  private readonly db: pg.Pool;

  constructor(db: pg.Pool) {
    this.db = db;
  }

  async findRun(owner: Owner, caseId: string): Promise<StoredRun | null> {
    const { rows } = await this.db.query<Row>(
      `SELECT id, case_id, state, version FROM case_runs WHERE ${ownerColumn(owner)} = $1 AND case_id = $2`,
      [ownerValue(owner), caseId],
    );
    return rows[0] ? toStored(rows[0]) : null;
  }

  async createRun(owner: Owner, caseId: string, state: Run): Promise<StoredRun> {
    const column = ownerColumn(owner);
    // Two first requests can race; the partial unique index decides, and the loser reads the winner's row.
    const { rows } = await this.db.query<Row>(
      `INSERT INTO case_runs (${column}, case_id, state) VALUES ($1, $2, $3)
       ON CONFLICT (${column}, case_id) WHERE ${column} IS NOT NULL DO NOTHING
       RETURNING id, case_id, state, version`,
      [ownerValue(owner), caseId, JSON.stringify(state)],
    );
    if (rows[0]) return toStored(rows[0]);
    const existing = await this.findRun(owner, caseId);
    if (!existing) throw new Error('case run vanished during create');
    return existing;
  }

  async saveRun(id: string, state: Run, expectedVersion: number): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE case_runs SET state = $2, version = version + 1, updated_at = now() WHERE id = $1 AND version = $3`,
      [id, JSON.stringify(state), expectedVersion],
    );
    return result.rowCount === 1;
  }

  async claimGuestRun(tokenHash: string, userId: string, caseId: string): Promise<boolean> {
    try {
      const result = await this.db.query(
        `UPDATE case_runs SET user_id = $2, guest_token_hash = NULL, updated_at = now()
          WHERE guest_token_hash = $1 AND case_id = $3
            AND NOT EXISTS (SELECT 1 FROM case_runs WHERE user_id = $2 AND case_id = $3)`,
        [tokenHash, userId, caseId],
      );
      return result.rowCount === 1;
    } catch (err) {
      // A concurrent request created the user's run between the check and the update.
      if ((err as { code?: string }).code === '23505') return false;
      throw err;
    }
  }
}
