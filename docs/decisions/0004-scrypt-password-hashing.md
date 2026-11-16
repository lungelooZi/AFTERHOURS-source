# 0004. scrypt from Node's standard library for passwords

Date: 2026-11-16 · Status: Accepted

## Context

Argon2id is the current first choice for password hashing, but the common Node packages
are native addons that need a compiler toolchain on Windows and add CI friction. scrypt is
also memory-hard, is recommended by OWASP as an alternative, and ships with Node.

## Decision

Use `crypto.scrypt` with N=2^15, r=8, p=1, a 16-byte random salt and a 64-byte key.
Hashes are stored as `scrypt$N$r$p$salt$hash` so parameters travel with each hash.
Passwords are Unicode-normalised (NFKC) before hashing. Successful logins re-hash
passwords whose stored parameters are weaker than the current ones.

## Consequences

- No native dependencies; installs the same on Windows, macOS and Linux.
- We can raise the cost later and users are upgraded silently as they sign in.
- Logins for unknown emails still run scrypt against a dummy hash, so response time does
  not reveal whether an account exists.
- Tests use cheaper parameters (`FAST_HASH`) to stay fast; production code never does.
