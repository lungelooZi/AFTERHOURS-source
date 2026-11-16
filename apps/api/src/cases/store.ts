import type { Run } from '@afterhours/game-engine';

export type Owner = { kind: 'user'; userId: string } | { kind: 'guest'; tokenHash: string };

export type StoredRun = { id: string; caseId: string; state: unknown; version: number };

/** Persistence for case runs. State is opaque JSON here; the engine validates it on load. */
export interface CaseStore {
  findRun(owner: Owner, caseId: string): Promise<StoredRun | null>;
  /** Creates the owner's run, or returns the existing one if another request created it first. */
  createRun(owner: Owner, caseId: string, state: Run): Promise<StoredRun>;
  /** Saves only if the stored version still equals `expectedVersion`. False means someone else saved first. */
  saveRun(id: string, state: Run, expectedVersion: number): Promise<boolean>;
  /** Moves a guest's run to a user, unless the user already has a run for that case. */
  claimGuestRun(tokenHash: string, userId: string, caseId: string): Promise<boolean>;
}
