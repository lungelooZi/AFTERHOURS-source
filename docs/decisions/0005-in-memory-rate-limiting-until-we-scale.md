# 0005. In-memory rate limiting until we run more than one instance

Date: 2026-11-16 · Status: Accepted

## Context

Login needs protection against password guessing (one account) and credential spraying
(many accounts from one address). The initial proposal included Redis.

## Decision

Use a sliding-window limiter held in process memory, behind an `AttemptLimiter`
interface, with two keys:

- `ip + email`: 5 failures per 15 minutes (reset on success).
- `ip`: 50 failures per 15 minutes (never reset by a success, so an attacker cannot clear
  it by signing in to their own account).

A background sweep drops expired keys so memory is bounded.

Redis is not added yet. It will arrive with real-time rooms (presence and pub/sub across
instances), at which point the limiter gets a Redis implementation of the same interface.

## Consequences

- Correct for a single API instance; with N instances an attacker would get N times the
  budget. This is the trigger for moving to Redis.
- Limits reset when the process restarts.
- `TRUST_PROXY` must be set correctly in deployment, otherwise every request appears to
  come from the proxy's IP and the IP limit would lock everyone out together.
