# 0007. Serve the API through the web server (same origin)

Date: 2026-11-16 · Status: Accepted · Issue: #2

## Context

The game is served from `localhost:3000` and the API from `localhost:4000`. Browsers
treat different ports as different origins. For the game to call the API with the
`httpOnly` session cookie (ADR-0003) we had two options:

1. **CORS with credentials.** The API sends `Access-Control-Allow-Origin` /
   `Allow-Credentials`, every non-simple request costs a preflight, and the cookie must
   become `SameSite=None; Secure`, which weakens the CSRF protection we rely on.
2. **Same-origin proxy.** The web server forwards `/api/*` to the API, so the browser
   only ever talks to one origin.

## Decision

Option 2. `apps/web/server.mjs` forwards `/api/<path>` to `API_URL/<path>`:

- Method, path, query, body, cookies and `Set-Cookie` pass through unchanged; hop-by-hop
  headers are dropped.
- The proxy is the edge, so it **overwrites** `X-Forwarded-For` with the socket address.
  Appending to a client-supplied value would let anyone pick the IP that the login rate
  limiter sees.
- The API trusts `X-Forwarded-For` only from configured proxies (`TRUST_PROXY=loopback`
  in development).
- API unreachable → `502`, no answer within 10 s → `504`, both as
  `{ "error": { "code": "api_unavailable" } }` so the client shows one friendly message.

## Consequences

- Cookies stay `SameSite=Lax`; no CORS configuration exists to get wrong.
- Production uses the same shape: one public origin, with the reverse proxy (or this
  server) routing `/api`.
- Each API call has one extra local hop. Negligible next to the database round trip.
- The API must not be exposed directly while `TRUST_PROXY` is set, or a client could
  connect from a trusted address range. In development it binds to `127.0.0.1`.
