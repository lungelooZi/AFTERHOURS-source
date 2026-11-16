// Shapes shared by every case. A CaseDefinition contains the answers and must only
// ever be loaded on the server; players receive a PlayerView (see view.ts).

export type AppId = 'messages' | 'files' | 'archive';
export type EndingId = string;

export type Evidence = { id: string; title: string; source: string; text: string };

export type Deduction = {
  id: string;
  question: string;
  options: string[];
  answer: string;
  /** Evidence the player must have found and selected as support. */
  requires: string[];
  explanation: string;
};

export type TimelineEvent = { time: string; day: string; requires: string[]; text: string };

export type CaseDefinition = {
  id: string;
  title: string;
  evidence: Evidence[];
  /** Which evidence each desktop app reveals when opened. */
  apps: Record<AppId, string[]>;
  archive: { password: string; reveals: string[] };
  deductions: Deduction[];
  timeline: TimelineEvent[];
  hints: string[];
  /** Evidence that must be found (as well as every deduction solved) before the final decision. */
  rescueRequires: string[];
  resolve: { prompt: string; channels: { id: string; label: string; ending: EndingId }[] };
  endings: Record<EndingId, { title: string; text: string }>;
};

/** A player's progress through one case. Stored server-side; never trusted from a client. */
export type Run = {
  version: 2;
  found: string[];
  pinned: string[];
  unlocked: boolean;
  solved: string[];
  hints: number;
  notes: string;
  ending: EndingId | null;
};

export type Action =
  | { type: 'open'; app: AppId }
  | { type: 'unlock'; password: string }
  | { type: 'pin'; evidenceId: string }
  | { type: 'unpin'; evidenceId: string }
  | { type: 'deduce'; deductionId: string; answer: string; supporting: string[] }
  | { type: 'hint' }
  | { type: 'notes'; text: string }
  | { type: 'decide'; channel: string };

/** Why an action changed nothing. Deliberately coarse: it must not reveal answers. */
export type Rejection =
  | 'wrong_password'
  | 'not_established'
  | 'not_found_yet'
  | 'not_ready'
  | 'case_closed'
  | 'no_more_hints'
  | 'unknown';

export type Outcome = { accepted: true } | { accepted: false; reason: Rejection };

export const MAX_NOTES_LENGTH = 4000;
