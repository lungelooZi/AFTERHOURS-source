// Talks to the case API. The browser holds no answers: it sends actions and renders
// the PlayerView the server returns (#5, ADR-0009).
import type { Action, Outcome, PlayerView, Rejection } from '../../../packages/game-engine/src/index.ts';

export type { Action, Outcome, PlayerView };

export type Result<T> = { ok: true; value: T } | { ok: false; code: string; message: string };
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const REJECTIONS: Record<Rejection, string> = {
  wrong_password: 'Incorrect key. Check the recovered files.',
  not_established: 'Not established yet. Reconsider your conclusion and select all supporting documents.',
  not_found_yet: 'You have not recovered that document yet.',
  not_ready: 'Recover the key documents and verify all three deductions before making contact.',
  case_closed: 'This case is closed. Restart it to play again.',
  no_more_hints: 'All hints are already revealed.',
  unknown: 'That did not work. Please try again.',
};

/** The sentence to show when the game refuses an action. Never more specific than the server's reason. */
export function rejectionMessage(outcome: Outcome): string {
  return outcome.accepted ? '' : (REJECTIONS[outcome.reason] ?? REJECTIONS.unknown);
}

export function errorMessage(code: string): string {
  switch (code) {
    case 'api_unavailable':
      return 'The case server is offline. Start it with "npm run dev", then reload.';
    case 'rate_limited':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'conflict':
      return 'Your case changed in another window. Please try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export function createCaseClient(fetchFn: FetchLike = (url, init) => fetch(url, init), caseId = 'case-001', base = '/api') {
  async function call<T>(method: string, path: string, body?: unknown): Promise<Result<T>> {
    let res: Response;
    try {
      res = await fetchFn(`${base}/cases/${caseId}${path}`, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      return { ok: false, code: 'api_unavailable', message: errorMessage('api_unavailable') };
    }
    const data = (await res.json().catch(() => ({}))) as T & { error?: { code?: string } };
    if (res.ok) return { ok: true, value: data };
    const code = data.error?.code ?? (res.status >= 500 ? 'api_unavailable' : 'unknown');
    return { ok: false, code, message: errorMessage(code) };
  }

  return {
    async load(): Promise<Result<PlayerView>> {
      const r = await call<{ view: PlayerView }>('GET', '');
      return r.ok ? { ok: true, value: r.value.view } : r;
    },
    act: (action: Action) => call<{ view: PlayerView; outcome: Outcome }>('POST', '/actions', action),
    async restart(): Promise<Result<PlayerView>> {
      const r = await call<{ view: PlayerView }>('POST', '/restart');
      return r.ok ? { ok: true, value: r.value.view } : r;
    },
  };
}
