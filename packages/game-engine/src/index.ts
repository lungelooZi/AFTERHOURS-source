export * from './types.ts';
export { freshRun, restoreRun, ready, apply } from './rules.ts';
export { toPlayerView, type PlayerView } from './view.ts';
export { case001 } from './cases/case-001.ts';

import { case001 } from './cases/case-001.ts';
import type { CaseDefinition } from './types.ts';

/** Every playable case, by id. */
export const cases: ReadonlyMap<string, CaseDefinition> = new Map([[case001.id, case001]]);
