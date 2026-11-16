import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing with Node's built-in scrypt (memory-hard, no native addon to build
 * on Windows/CI). Hashes are self-describing so parameters can be raised later and old
 * hashes upgraded on the next successful login.
 *
 * Format: scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>
 */
export type ScryptParams = { N: number; r: number; p: number; keyLength: number };

export const DEFAULT_PARAMS: ScryptParams = { N: 2 ** 15, r: 8, p: 1, keyLength: 64 };

function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  const options: ScryptOptions = { N: params.N, r: params.r, p: params.p, maxmem: 128 * params.N * params.r * 2 };
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize('NFKC'), salt, params.keyLength, options, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string, params: ScryptParams = DEFAULT_PARAMS): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, params);
  return ['scrypt', params.N, params.r, params.p, salt.toString('base64'), key.toString('base64')].join('$');
}

type Parsed = { params: ScryptParams; salt: Buffer; key: Buffer };

function parse(stored: string): Parsed | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [, n, r, p, salt, key] = parts as [string, string, string, string, string, string];
  const N = Number(n), R = Number(r), P = Number(p);
  if (![N, R, P].every(Number.isSafeInteger) || N < 2 || (N & (N - 1)) !== 0) return null;
  const keyBuf = Buffer.from(key, 'base64');
  if (keyBuf.length < 16) return null;
  return { params: { N, r: R, p: P, keyLength: keyBuf.length }, salt: Buffer.from(salt, 'base64'), key: keyBuf };
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  const candidate = await derive(password, parsed.salt, parsed.params);
  return timingSafeEqual(candidate, parsed.key);
}

/** True when a stored hash uses weaker parameters than `target` and should be re-hashed. */
export function needsRehash(stored: string, target: ScryptParams = DEFAULT_PARAMS): boolean {
  const parsed = parse(stored);
  if (!parsed) return true;
  const { N, r, p, keyLength } = parsed.params;
  return N < target.N || r < target.r || p < target.p || keyLength < target.keyLength;
}

/**
 * A valid hash of a random password. Login verifies against this when the email is
 * unknown, so "no such user" and "wrong password" take the same time to answer.
 */
let dummy: Promise<string> | undefined;
export function dummyHash(params: ScryptParams = DEFAULT_PARAMS): Promise<string> {
  dummy ??= hashPassword(randomBytes(32).toString('hex'), params);
  return dummy;
}
