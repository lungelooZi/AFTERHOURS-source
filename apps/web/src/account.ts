// Account client for the AFTERHOURS API. No DOM code here, so it can be unit-tested
// with a fake fetch and reused by any interface.

export type User = { id: string; email: string; displayName: string; role: 'player' | 'creator' | 'admin'; createdAt: string };

export type Failure = { ok: false; code: string; message: string };
export type Result<T> = { ok: true; value: T } | Failure;

type ApiError = { error?: { code?: string; message?: string; details?: unknown } };
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const FIELD_LABELS: Record<string, string> = { email: 'Email', password: 'Password', displayName: 'Display name' };

/** Turns an API error into a sentence a player can act on. */
export function messageFor(code: string, details?: unknown): string {
  switch (code) {
    case 'invalid_credentials':
      return 'That email and password do not match an account.';
    case 'email_taken':
      return 'An account with that email already exists. Try signing in instead.';
    case 'rate_limited': {
      const seconds = (details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds ?? 60;
      const minutes = Math.ceil(seconds / 60);
      return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
    }
    case 'validation_failed': {
      const fields = (details ?? {}) as Record<string, string[] | undefined>;
      const parts = Object.entries(fields)
        .filter(([, messages]) => messages?.length)
        .map(([field, messages]) => `${FIELD_LABELS[field] ?? field}: ${messages![0]}`);
      return parts.length ? parts.join(' ') : 'Some details are missing or invalid.';
    }
    case 'unauthenticated':
      return 'Your session has ended. Please sign in again.';
    case 'api_unavailable':
      return 'The account service is offline right now. You can keep playing as a guest.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export function createAccountClient(fetchFn: FetchLike = (url, init) => fetch(url, init), base = '/api') {
  async function call<T>(method: string, path: string, body?: unknown): Promise<Result<T>> {
    let res: Response;
    try {
      res = await fetchFn(base + path, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      return { ok: false, code: 'api_unavailable', message: messageFor('api_unavailable') };
    }
    if (res.status === 204) return { ok: true, value: null as T };
    const data = (await res.json().catch(() => ({}))) as T & ApiError;
    if (res.ok) return { ok: true, value: data };
    const code = data.error?.code ?? (res.status >= 500 ? 'api_unavailable' : 'unknown');
    return { ok: false, code, message: messageFor(code, data.error?.details) };
  }

  return {
    /** The signed-in user, or null for guests. Treats an unreachable API as a guest. */
    async me(): Promise<User | null> {
      const result = await call<{ user: User }>('GET', '/auth/me');
      return result.ok ? result.value.user : null;
    },
    async signIn(email: string, password: string): Promise<Result<User>> {
      const result = await call<{ user: User }>('POST', '/auth/login', { email, password });
      return result.ok ? { ok: true, value: result.value.user } : result;
    },
    async signUp(displayName: string, email: string, password: string): Promise<Result<User>> {
      const result = await call<{ user: User }>('POST', '/auth/register', { displayName, email, password });
      return result.ok ? { ok: true, value: result.value.user } : result;
    },
    signOut: () => call<null>('POST', '/auth/logout'),
    signOutEverywhere: () => call<null>('POST', '/auth/logout-all'),
  };
}

export type AccountClient = ReturnType<typeof createAccountClient>;
