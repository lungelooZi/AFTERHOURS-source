# 0008. Password reset with single-use, hashed tokens

Date: 2026-11-16 · Status: Accepted · Issue: #3

## Context

Players need to recover an account when they forget their password. A reset flow is
a common way into accounts, so it has to resist account enumeration, token theft,
token reuse and email flooding.

## Decision

- **Request** (`POST /auth/password-reset`) always answers `202` with the same body.
  The reset email is sent without awaiting it, so response time does not reveal whether
  the email is registered either.
- **Token**: 32 random bytes, emailed once, stored only as SHA-256 in
  `password_reset_tokens`, valid for 30 minutes (`PASSWORD_RESET_TTL_MINUTES`).
- **Link**: `APP_URL/#reset=<token>`. Fragments are never sent to servers, so the token
  stays out of access logs, proxies and `Referer` headers. The client removes it from the
  address bar and history as soon as it reads it.
- **Confirm** (`POST /auth/password-reset/confirm`) runs one database transaction that
  marks the token used (only if unused and unexpired), marks the user's other open
  tokens used, sets the new password hash and revokes every session. The row lock on
  the token makes concurrent uses of one token serialise: exactly one succeeds.
- A weak new password is rejected **before** the token is touched, so a typo doesn't
  burn the link.
- **Rate limit**: 3 requests per email + IP per hour.
- **Delivery** goes through a `Mailer` interface. Development uses `ConsoleMailer`,
  which prints the email to the API terminal; a real provider will implement the same
  interface.

## Consequences

- Possession of the email inbox is enough to take over an account. That is standard
  for this kind of product; adding a second factor is a later decision.
- Fire-and-forget sending means a delivery failure is only logged. When a real provider
  is added, sending should move to the background job queue planned for Phase 4, with
  retries.
- Expired and used tokens stay in the table. A cleanup job can delete rows older than a
  day once the job queue exists.
