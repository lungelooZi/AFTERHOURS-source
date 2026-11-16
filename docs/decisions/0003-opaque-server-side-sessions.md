# 0003. Opaque server-side sessions instead of JWTs

Date: 2026-11-16 · Status: Accepted

## Context

Players sign in from the browser; creators and integrations will call the API directly.
We need sign-out that takes effect immediately, "sign out everywhere", and role changes
(for example demoting an abusive creator) that apply without waiting for a token to expire.

## Decision

- On sign-in the server generates 32 random bytes, returns them once, and stores only
  their SHA-256 hash in `sessions` with an expiry (default 7 days).
- Browsers receive the token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in
  production). API clients may send `Authorization: Bearer <token>`.
- Every request looks the session up and joins the user, so the role is always current.

## Consequences

- Revocation is a single `UPDATE`; there is no denylist to maintain.
- A leaked database dump does not contain usable tokens.
- One indexed primary-key lookup per authenticated request. Acceptable now; if it becomes
  hot we can cache in Redis with short TTLs.
- CSRF: `SameSite=Lax` blocks cross-site POSTs carrying the cookie, and the API only
  accepts `application/json` bodies (form posts get `415`). We will add a CSRF token if we
  ever need cross-site embedding.
