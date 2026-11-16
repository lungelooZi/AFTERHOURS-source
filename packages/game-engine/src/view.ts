import { ready } from './rules.ts';
import type { AppId, CaseDefinition, Evidence, Run } from './types.ts';

/**
 * Everything a player is allowed to see. Built from the run so that each piece of
 * text is included only once the player has earned it: evidence once found, answers
 * and explanations once solved, the final prompt once ready, the ending once chosen.
 */
export type PlayerView = {
  caseId: string;
  title: string;
  progress: { found: number; totalEvidence: number; solved: number; totalDeductions: number; closed: boolean };
  apps: Record<AppId, Evidence[]>;
  archive: { unlocked: boolean };
  pinned: Evidence[];
  deductions: (
    | { id: string; question: string; solved: false; options: string[] }
    | { id: string; question: string; solved: true; answer: string; explanation: string }
  )[];
  timeline: ({ known: true; day: string; time: string; text: string } | { known: false })[];
  hints: { revealed: string[]; remaining: number };
  notes: string;
  resolve: { ready: false } | { ready: true; prompt: string; channels: { id: string; label: string }[] };
  ending: { title: string; text: string } | null;
};

export function toPlayerView(run: Run, c: CaseDefinition): PlayerView {
  const found = (id: string) => run.found.includes(id);
  const evidence = (ids: string[]) => c.evidence.filter((e) => ids.includes(e.id) && found(e.id)).map((e) => ({ ...e }));
  const isReady = ready(run, c);

  return {
    caseId: c.id,
    title: c.title,
    progress: {
      found: run.found.length,
      totalEvidence: c.evidence.length,
      solved: run.solved.length,
      totalDeductions: c.deductions.length,
      closed: run.ending !== null,
    },
    apps: {
      messages: evidence(c.apps.messages),
      files: evidence(c.apps.files),
      archive: run.unlocked ? evidence([...c.apps.archive, ...c.archive.reveals]) : [],
    },
    archive: { unlocked: run.unlocked },
    pinned: run.pinned.flatMap((id) => evidence([id])),
    deductions: c.deductions.map((d) =>
      run.solved.includes(d.id)
        ? { id: d.id, question: d.question, solved: true as const, answer: d.answer, explanation: d.explanation }
        : { id: d.id, question: d.question, solved: false as const, options: [...d.options] },
    ),
    timeline: c.timeline.map((t) =>
      t.requires.every(found) ? { known: true as const, day: t.day, time: t.time, text: t.text } : { known: false as const },
    ),
    hints: { revealed: c.hints.slice(0, run.hints), remaining: c.hints.length - run.hints },
    notes: run.notes,
    resolve: isReady && !run.ending
      ? { ready: true, prompt: c.resolve.prompt, channels: c.resolve.channels.map(({ id, label }) => ({ id, label })) }
      : { ready: false },
    ending: run.ending ? { ...c.endings[run.ending]! } : null,
  };
}
