import { case001 } from '@afterhours/game-engine';
import { describe, expect, it } from 'vitest';
import { GUEST_COOKIE } from '../src/cases/routes.ts';
import { MemoryCaseStore } from '../src/cases/memory-store.ts';
import { CaseService } from '../src/cases/service.ts';
import { SlidingWindowLimiter } from '../src/auth/rate-limiter.ts';
import { alice, makeApp } from './helpers.ts';

type App = Awaited<ReturnType<typeof makeApp>>['app'];
type Res = Awaited<ReturnType<App['inject']>>;

/** A tiny cookie jar so each test reads like a browser session. */
function browser(app: App) {
  const jar = new Map<string, string>();
  const remember = (res: Res) => {
    for (const c of res.cookies) c.value ? jar.set(c.name, c.value) : jar.delete(c.name);
    return res;
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  return {
    jar,
    get: async (url: string) => remember(await app.inject({ method: 'GET', url, headers: { cookie: cookie() } })),
    post: async (url: string, payload?: object) => remember(await app.inject({ method: 'POST', url, payload, headers: { cookie: cookie() } })),
    act: async (action: object) => remember(await app.inject({ method: 'POST', url: '/cases/case-001/actions', payload: action, headers: { cookie: cookie() } })),
  };
}

const solveEverything = async (b: ReturnType<typeof browser>) => {
  await b.act({ type: 'open', app: 'messages' });
  await b.act({ type: 'open', app: 'files' });
  await b.act({ type: 'unlock', password: '1998' });
  for (const d of case001.deductions) await b.act({ type: 'deduce', deductionId: d.id, answer: d.answer, supporting: d.requires });
};

describe('guest play', () => {
  it('the first visit creates a guest run and an httpOnly guest cookie; later visits reuse it', async () => {
    const { app } = await makeApp();
    const b = browser(app);
    const first = await b.get('/cases/case-001');
    expect(first.statusCode).toBe(200);
    expect(first.cookies.find((c) => c.name === GUEST_COOKIE)).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    await b.act({ type: 'open', app: 'messages' });
    const again = await b.get('/cases/case-001');
    expect(again.cookies).toHaveLength(0);
    expect(again.json().view.progress.found).toBe(2);
  });

  it('a fresh view contains no answers', async () => {
    const { app } = await makeApp();
    const body = (await browser(app).get('/cases/case-001')).body;
    expect(body).not.toContain('1998');
    for (const d of case001.deductions) expect(body).not.toContain(d.explanation);
    expect(body).not.toContain(case001.resolve.prompt);
  });

  it('game rejections are 200 with an outcome; malformed actions are 400; unknown cases 404', async () => {
    const { app } = await makeApp();
    const b = browser(app);
    const wrong = await b.act({ type: 'unlock', password: '2000' });
    expect(wrong.statusCode).toBe(200);
    expect(wrong.json().outcome).toEqual({ accepted: false, reason: 'wrong_password' });
    expect(wrong.json().view.archive.unlocked).toBe(false);
    expect((await b.act({ type: 'teleport' })).statusCode).toBe(400);
    expect((await b.act({ type: 'open', app: 'camera' })).statusCode).toBe(400);
    expect((await b.get('/cases/case-999')).statusCode).toBe(404);
  });

  it('players are isolated from each other', async () => {
    const { app } = await makeApp();
    const a = browser(app);
    const b = browser(app);
    await a.act({ type: 'open', app: 'messages' });
    expect((await b.get('/cases/case-001')).json().view.progress.found).toBe(0);
  });

  it('a forged or malformed guest cookie gets a new guest, not someone else’s run', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/cases/case-001', headers: { cookie: `${GUEST_COOKIE}=../../etc` } });
    expect(res.cookies.find((c) => c.name === GUEST_COOKIE)?.value).toMatch(/^[\w-]{43}$/);
  });

  it('limits how many new guests one IP can create', async () => {
    const { app } = await makeApp({ guestLimit: 2 });
    for (let i = 0; i < 2; i++) expect((await browser(app).get('/cases/case-001')).statusCode).toBe(200);
    const res = await browser(app).get('/cases/case-001');
    expect(res.statusCode).toBe(429);
  });

  it('the archive password cannot be brute-forced: 10 wrong guesses, then 429', async () => {
    const { app, clock } = await makeApp();
    const b = browser(app);
    for (let i = 0; i < 10; i++) expect((await b.act({ type: 'unlock', password: String(1000 + i) })).statusCode).toBe(200);
    const blocked = await b.act({ type: 'unlock', password: '1998' });
    expect(blocked.statusCode).toBe(429);
    expect((await b.act({ type: 'open', app: 'messages' })).statusCode).toBe(200);
    clock.advance(10 * 60_000 + 1);
    expect((await b.act({ type: 'unlock', password: '1998' })).json().view.archive.unlocked).toBe(true);
  });

  it('can play the whole case and reach an ending, then restart', async () => {
    const { app } = await makeApp();
    const b = browser(app);
    await solveEverything(b);
    const ready = (await b.get('/cases/case-001')).json().view;
    expect(ready.resolve.ready).toBe(true);
    const end = (await b.act({ type: 'decide', channel: 'private' })).json();
    expect(end.view.ending.title).toBe('SIGNAL RECEIVED / MAYA IS SAFE');
    const restarted = await b.post('/cases/case-001/restart');
    expect(restarted.json().view.progress).toMatchObject({ found: 0, solved: 0, closed: false });
  });
});

describe('accounts', () => {
  it('signing up keeps the guest’s progress and retires the guest cookie', async () => {
    const { app } = await makeApp();
    const b = browser(app);
    await b.act({ type: 'open', app: 'messages' });
    await b.post('/auth/register', alice);
    const res = await b.get('/cases/case-001');
    expect(res.json().view.progress.found).toBe(2);
    expect(res.cookies.find((c) => c.name === GUEST_COOKIE)?.value).toBe('');
    expect(b.jar.has(GUEST_COOKIE)).toBe(false);

    // Progress now follows the account to a new browser.
    const other = browser(app);
    await other.post('/auth/login', { email: alice.email, password: alice.password });
    expect((await other.get('/cases/case-001')).json().view.progress.found).toBe(2);
  });

  it('existing account progress is never overwritten by a guest run', async () => {
    const { app } = await makeApp();
    const owner = browser(app);
    await owner.post('/auth/register', alice);
    await owner.act({ type: 'open', app: 'files' }); // account: 2 found
    await owner.post('/auth/logout');

    await owner.act({ type: 'open', app: 'messages' }); // now a guest
    await owner.act({ type: 'unlock', password: '1998' }); // guest: 3 found
    await owner.post('/auth/login', { email: alice.email, password: alice.password });
    const view = (await owner.get('/cases/case-001')).json().view;
    expect(view.apps.files).toHaveLength(2);
    expect(view.apps.messages).toHaveLength(0);
  });
});

describe('concurrency', () => {
  /** A store whose next N saves report that someone else saved first. */
  class ContendedStore extends MemoryCaseStore {
    conflicts: number;
    constructor(conflicts: number) {
      super();
      this.conflicts = conflicts;
    }
    override async saveRun(id: string, state: Parameters<MemoryCaseStore['saveRun']>[1], v: number) {
      if (this.conflicts-- > 0) return false;
      return super.saveRun(id, state, v);
    }
  }
  const caller = { user: null, guestToken: 'g'.repeat(43), ip: '203.0.113.1' };
  const serviceWith = (store: MemoryCaseStore) =>
    new CaseService({ store, guestLimiter: new SlidingWindowLimiter(100, 60_000), guessLimiter: new SlidingWindowLimiter(10, 60_000) });

  it('retries when another tab saved first', async () => {
    const service = serviceWith(new ContendedStore(2));
    const result = await service.act(caller, 'case-001', { type: 'open', app: 'messages' });
    expect(result.outcome.accepted).toBe(true);
    expect(result.view.progress.found).toBe(2);
  });

  it('gives up with 409 after repeated conflicts', async () => {
    const service = serviceWith(new ContendedStore(99));
    await expect(service.act(caller, 'case-001', { type: 'open', app: 'messages' })).rejects.toMatchObject({ status: 409, code: 'conflict' });
  });

  it('two parallel actions on one run both land', async () => {
    const store = new MemoryCaseStore();
    const service = serviceWith(store);
    await Promise.all([
      service.act(caller, 'case-001', { type: 'open', app: 'messages' }),
      service.act(caller, 'case-001', { type: 'open', app: 'files' }),
    ]);
    expect((await service.getView(caller, 'case-001')).view.progress.found).toBe(4);
  });
});
