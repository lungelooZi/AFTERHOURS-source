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

## Update (v0.4, #4)

Sessions now also have a random public `id` and a `last_used_at` time, so players can
see and sign out individual devices (`GET /auth/sessions`, `DELETE /auth/sessions/:id`)
without the token hash ever leaving the server. `last_used_at` is written at most every
5 minutes per session, so authenticated reads stay read-only almost all of the time.
Revocation by id includes `user_id` in the `WHERE` clause; another user's session id
returns `404` rather than `403`, so ids can't be probed.
