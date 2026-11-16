import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };

describe('loadConfig', () => {
  it('applies safe defaults', () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({ env: 'development', host: '127.0.0.1', port: 4000, trustProxy: false });
    expect(c.sessionTtlMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(c.login).toEqual({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });
  });

  it.each([
    ['false', false],
    ['true', true],
    ['loopback', 'loopback'],
    ['10.0.0.0/8,127.0.0.1', '10.0.0.0/8,127.0.0.1'],
  ])('parses TRUST_PROXY=%s', (value, expected) => {
    expect(loadConfig({ ...base, TRUST_PROXY: value }).trustProxy).toEqual(expected);
  });

  it('fails fast with a readable message', () => {
    expect(() => loadConfig({ ...base, PORT: 'abc' })).toThrow(/Invalid configuration[\s\S]*- PORT:/);
    expect(() => loadConfig({})).toThrow(/- DATABASE_URL: required when STORE=postgres/);
  });

  it('STORE=memory needs no database', () => {
    expect(loadConfig({ STORE: 'memory' })).toMatchObject({ store: 'memory', databaseUrl: undefined });
    expect(loadConfig(base).store).toBe('postgres');
  });
});
