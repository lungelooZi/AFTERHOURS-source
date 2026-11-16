import { createHash, randomBytes } from 'node:crypto';

/** 256 bits of randomness, URL-safe. Given to the client once and never stored. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What we store and look up. A leaked sessions table cannot be replayed as cookies. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
