import { apply, cases, freshRun, restoreRun, toPlayerView, type CaseDefinition, type Outcome, type PlayerView } from '@afterhours/game-engine';
import { z } from 'zod';
import type { AttemptLimiter } from '../auth/rate-limiter.ts';
import { generateSessionToken, hashToken } from '../auth/tokens.ts';
import type { User } from '../auth/types.ts';
import { AppError, errors } from '../errors.ts';
import type { CaseStore, Owner, StoredRun } from './store.ts';

const evidenceId = z.string().min(1).max(64);
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open'), app: z.enum(['messages', 'files', 'archive']) }),
  z.object({ type: z.literal('unlock'), password: z.string().max(64) }),
  z.object({ type: z.literal('pin'), evidenceId }),
  z.object({ type: z.literal('unpin'), evidenceId }),
  z.object({ type: z.literal('deduce'), deductionId: z.string().max(64), answer: z.string().max(200), supporting: z.array(evidenceId).max(20) }),
  z.object({ type: z.literal('hint') }),
  z.object({ type: z.literal('notes'), text: z.string().max(10_000) }),
  z.object({ type: z.literal('decide'), channel: z.string().max(64) }),
]);

/** Who is playing: a signed-in user, or a guest identified by the ah_guest cookie. */
export type Caller = { user: User | null; guestToken: string | undefined; ip: string | null };

export type CaseResponse = {
  view: PlayerView;
  /** New guest token to store in the cookie. */
  setGuestToken?: string;
  /** The guest cookie is no longer needed (its run now belongs to the signed-in user). */
  clearGuestToken?: boolean;
};

const GUEST_TOKEN = /^[\w-]{43}$/;
const MAX_SAVE_ATTEMPTS = 3;

/**
 * Runs cases on the server. The browser sends actions; this applies the game-engine
 * rules to the stored run and returns only the redacted PlayerView, so answers never
 * leave the server until the player has earned them (#5, ADR-0009).
 */
export class CaseService {
  private readonly store: CaseStore;
  private readonly guestLimiter: AttemptLimiter;
  private readonly guessLimiter: AttemptLimiter;

  /**
   * guestLimiter: new guests per IP. guessLimiter: wrong archive passwords per run, so the
   * 4-digit key can't be brute-forced through the API.
   */
  constructor(options: { store: CaseStore; guestLimiter: AttemptLimiter; guessLimiter: AttemptLimiter }) {
    this.store = options.store;
    this.guestLimiter = options.guestLimiter;
    this.guessLimiter = options.guessLimiter;
  }

  private definition(caseId: string): CaseDefinition {
    const found = cases.get(caseId);
    if (!found) throw errors.notFound('Case');
    return found;
  }

  /** Finds or creates the caller's run, moving guest progress into the account on first sign-in. */
  private async resolveRun(caller: Caller, c: CaseDefinition): Promise<{ stored: StoredRun; extra: Omit<CaseResponse, 'view'> }> {
    if (caller.user) {
      const extra: Omit<CaseResponse, 'view'> = {};
      if (caller.guestToken) {
        await this.store.claimGuestRun(hashToken(caller.guestToken), caller.user.id, c.id);
        extra.clearGuestToken = true;
      }
      const owner: Owner = { kind: 'user', userId: caller.user.id };
      const stored = (await this.store.findRun(owner, c.id)) ?? (await this.store.createRun(owner, c.id, freshRun()));
      return { stored, extra };
    }

    const token = caller.guestToken && GUEST_TOKEN.test(caller.guestToken) ? caller.guestToken : undefined;
    if (token) {
      const existing = await this.store.findRun({ kind: 'guest', tokenHash: hashToken(token) }, c.id);
      if (existing) return { stored: existing, extra: {} };
    }
    // Each new guest is a database row, so creating them is rate limited per IP.
    const key = caller.ip ?? 'unknown';
    const wait = this.guestLimiter.retryAfter(key);
    if (wait > 0) throw errors.rateLimited(wait);
    this.guestLimiter.recordFailure(key);
    const newToken = token ?? generateSessionToken();
    const stored = await this.store.createRun({ kind: 'guest', tokenHash: hashToken(newToken) }, c.id, freshRun());
    return { stored, extra: newToken === caller.guestToken ? {} : { setGuestToken: newToken } };
  }

  async getView(caller: Caller, caseId: string): Promise<CaseResponse> {
    const c = this.definition(caseId);
    const { stored, extra } = await this.resolveRun(caller, c);
    return { view: toPlayerView(restoreRun(stored.state, c), c), ...extra };
  }

  async act(caller: Caller, caseId: string, input: unknown): Promise<CaseResponse & { outcome: Outcome }> {
    const c = this.definition(caseId);
    const parsed = actionSchema.safeParse(input);
    if (!parsed.success) throw errors.validation(z.flattenError(parsed.error).fieldErrors);

    // Optimistic concurrency: re-read and re-apply if another tab saved in between.
    for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
      const { stored, extra } = await this.resolveRun(caller, c);
      if (parsed.data.type === 'unlock') {
        const wait = this.guessLimiter.retryAfter(stored.id);
        if (wait > 0) throw errors.rateLimited(wait);
      }
      const run = restoreRun(stored.state, c);
      const result = apply(run, c, parsed.data);
      if (!result.outcome.accepted && result.outcome.reason === 'wrong_password') this.guessLimiter.recordFailure(stored.id);
      if (result.run === run || (await this.store.saveRun(stored.id, result.run, stored.version))) {
        return { view: toPlayerView(result.run, c), outcome: result.outcome, ...extra };
      }
    }
    throw new AppError(409, 'conflict', 'Your case changed in another window. Please try again.');
  }

  async restart(caller: Caller, caseId: string): Promise<CaseResponse> {
    const c = this.definition(caseId);
    for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
      const { stored, extra } = await this.resolveRun(caller, c);
      if (await this.store.saveRun(stored.id, freshRun(), stored.version)) return { view: toPlayerView(freshRun(), c), ...extra };
    }
    throw new AppError(409, 'conflict', 'Your case changed in another window. Please try again.');
  }
}
