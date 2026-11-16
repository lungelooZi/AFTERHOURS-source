import { describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, verifyPassword } from '../src/auth/password.ts';
import { FAST_HASH } from './helpers.ts';

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('lighthouse-1998-tunnel', FAST_HASH);
    expect(await verifyPassword('lighthouse-1998-tunnel', hash)).toBe(true);
    expect(await verifyPassword('lighthouse-1998-tunnel ', hash)).toBe(false);
  });

  it('salts every hash so equal passwords never share a hash', async () => {
    const [a, b] = await Promise.all([hashPassword('same password!', FAST_HASH), hashPassword('same password!', FAST_HASH)]);
    expect(a).not.toBe(b);
  });

  it('treats Unicode-equivalent passwords as the same password', async () => {
    const composed = 'café-password'; // é as one code point
    const decomposed = 'café-password'; // e + combining accent
    expect(await verifyPassword(decomposed, await hashPassword(composed, FAST_HASH))).toBe(true);
  });

  it('rejects malformed or tampered hashes instead of throwing', async () => {
    for (const bad of ['', 'plain', 'scrypt$3$8$1$c2FsdA==$aGFzaA==', 'bcrypt$whatever', 'scrypt$1024$8$1$c2FsdA==$']) {
      expect(await verifyPassword('anything', bad)).toBe(false);
    }
  });

  it('flags hashes made with weaker parameters for upgrade', async () => {
    const weak = await hashPassword('upgrade me please', FAST_HASH);
    expect(needsRehash(weak, FAST_HASH)).toBe(false);
    expect(needsRehash(weak, { ...FAST_HASH, N: 2 ** 15 })).toBe(true);
    expect(needsRehash('garbage')).toBe(true);
  });
});
