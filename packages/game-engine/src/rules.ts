import { MAX_NOTES_LENGTH, type Action, type CaseDefinition, type Outcome, type Run } from './types.ts';

// Pure rules: (run, case, action) -> (run, outcome). No I/O, no clock, no randomness,
// so the same code is trivially testable and safe to run on the server.

export const freshRun = (): Run => ({ version: 2, found: [], pinned: [], unlocked: false, solved: [], hints: 0, notes: '', ending: null });

const evidenceIds = (c: CaseDefinition) => new Set(c.evidence.map((e) => e.id));

/**
 * Rebuilds a Run from stored JSON, dropping anything inconsistent with the case
 * (unknown ids, pins of unfound evidence, deductions whose evidence isn't found,
 * oversized notes). Unknown versions start fresh.
 */
export function restoreRun(raw: unknown, c: CaseDefinition): Run {
  const r = raw as Partial<Run> | null;
  if (!r || typeof r !== 'object' || r.version !== 2) return freshRun();
  const known = evidenceIds(c);
  const ids = (v: unknown, allowed: (id: string) => boolean) =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && allowed(x)))] : [];

  const unlocked = r.unlocked === true;
  const found = ids(r.found, (id) => known.has(id) && (unlocked || !c.archive.reveals.includes(id)));
  const solved = ids(r.solved, (id) => c.deductions.some((d) => d.id === id && d.requires.every((e) => found.includes(e))));
  const endings = new Set(c.resolve.channels.map((ch) => ch.ending));
  return {
    version: 2,
    found,
    pinned: ids(r.pinned, (id) => found.includes(id)),
    unlocked,
    solved,
    hints: Number.isInteger(r.hints) ? Math.max(0, Math.min(c.hints.length, r.hints!)) : 0,
    notes: typeof r.notes === 'string' ? r.notes.slice(0, MAX_NOTES_LENGTH) : '',
    ending: typeof r.ending === 'string' && endings.has(r.ending) ? r.ending : null,
  };
}

/** All rescue evidence found and every deduction proven. */
export function ready(run: Run, c: CaseDefinition): boolean {
  return c.rescueRequires.every((id) => run.found.includes(id)) && c.deductions.every((d) => run.solved.includes(d.id));
}

const discover = (run: Run, ids: string[]): Run => ({ ...run, found: [...new Set([...run.found, ...ids])] });
const ok = (run: Run) => ({ run, outcome: { accepted: true } as Outcome });
const no = (run: Run, reason: Extract<Outcome, { accepted: false }>['reason']) => ({ run, outcome: { accepted: false, reason } as Outcome });

export function apply(run: Run, c: CaseDefinition, action: Action): { run: Run; outcome: Outcome } {
  // Notes stay editable after the case closes; nothing else changes.
  if (run.ending && action.type !== 'notes') return no(run, 'case_closed');

  switch (action.type) {
    case 'open': {
      const reveals = c.apps[action.app];
      if (!reveals) return no(run, 'unknown');
      const extra = action.app === 'archive' && run.unlocked ? c.archive.reveals : [];
      return ok(discover(run, [...reveals, ...extra]));
    }
    case 'unlock': {
      if (run.unlocked) return ok(run);
      if (action.password.trim() !== c.archive.password) return no(run, 'wrong_password');
      return ok(discover({ ...run, unlocked: true }, c.archive.reveals));
    }
    case 'pin': {
      if (!run.found.includes(action.evidenceId)) return no(run, 'not_found_yet');
      return ok(run.pinned.includes(action.evidenceId) ? run : { ...run, pinned: [...run.pinned, action.evidenceId] });
    }
    case 'unpin':
      return ok({ ...run, pinned: run.pinned.filter((id) => id !== action.evidenceId) });
    case 'deduce': {
      const d = c.deductions.find((x) => x.id === action.deductionId);
      if (!d) return no(run, 'unknown');
      if (run.solved.includes(d.id)) return ok(run);
      // One reason for every failure, so a wrong guess doesn't reveal which part was wrong.
      const supported = d.requires.every((id) => run.found.includes(id) && action.supporting.includes(id));
      if (action.answer !== d.answer || !supported) return no(run, 'not_established');
      return ok({ ...run, solved: [...run.solved, d.id] });
    }
    case 'hint':
      if (run.hints >= c.hints.length) return no(run, 'no_more_hints');
      return ok({ ...run, hints: run.hints + 1 });
    case 'notes':
      return ok({ ...run, notes: action.text.slice(0, MAX_NOTES_LENGTH) });
    case 'decide': {
      if (!ready(run, c)) return no(run, 'not_ready');
      const channel = c.resolve.channels.find((ch) => ch.id === action.channel);
      if (!channel) return no(run, 'unknown');
      return ok({ ...run, ending: channel.ending });
    }
    default:
      return no(run, 'unknown');
  }
}
