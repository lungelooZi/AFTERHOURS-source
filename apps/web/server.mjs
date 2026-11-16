import { createServer, request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { pathToFileURL } from 'node:url';

/** Static files the client may load. Anything not listed here is a 404. */
const routes = {
  '/': ['public/index.html', 'text/html'],
  '/style.css': ['public/style.css', 'text/css'],
  '/app.js': ['src/app.ts', 'text/javascript'],
  '/journal-ui.js': ['src/journal-ui.ts', 'text/javascript'],
  '/account.js': ['src/account.ts', 'text/javascript'],
  '/account-ui.js': ['src/account-ui.ts', 'text/javascript'],
  '/case-client.js': ['src/case-client.ts', 'text/javascript'],
};

// Connection-level headers must not be forwarded by a proxy (RFC 9110 §7.6.1).
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host']);

const strip = (headers) => Object.fromEntries(Object.entries(headers).filter(([name]) => !HOP_BY_HOP.has(name.toLowerCase())));

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

/**
 * Forwards /api/* to the platform API so the browser talks to a single origin and the
 * httpOnly session cookie works without CORS (see docs/decisions/0007).
 */
function proxyToApi(req, res, apiUrl, timeoutMs) {
  const incoming = new URL(req.url, 'http://localhost');
  const target = new URL(incoming.pathname.slice('/api'.length) || '/', apiUrl);
  target.search = incoming.search;

  // This server is the edge: it overwrites, never appends to, X-Forwarded-For. Appending
  // would let a client send a fake address and dodge the API's per-IP login limits.
  const forwardedFor = req.socket.remoteAddress ?? '';
  const upstream = httpRequest(target, {
    method: req.method,
    headers: { ...strip(req.headers), 'x-forwarded-for': forwardedFor, 'x-forwarded-proto': 'http', 'x-forwarded-host': req.headers.host ?? '' },
    timeout: timeoutMs,
  });

  upstream.on('response', (apiRes) => {
    res.writeHead(apiRes.statusCode ?? 502, strip(apiRes.headers));
    apiRes.pipe(res);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
  upstream.on('error', (err) => {
    if (res.headersSent) return res.destroy();
    const timedOut = err.message === 'timeout';
    sendJson(res, timedOut ? 504 : 502, {
      error: { code: 'api_unavailable', message: timedOut ? 'The API took too long to respond.' : 'The API is not reachable.' },
    });
  });
  req.pipe(upstream);
}

export function createWebServer({ apiUrl = process.env.API_URL ?? 'http://127.0.0.1:4000', proxyTimeoutMs = 10_000 } = {}) {
  return createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/api' || pathname.startsWith('/api/')) return proxyToApi(req, res, apiUrl, proxyTimeoutMs);

    const route = routes[pathname];
    if (!route) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    try {
      let body = await readFile(new URL(route[0], import.meta.url), 'utf8');
      if (route[0].endsWith('.ts')) body = stripTypeScriptTypes(body);
      res.writeHead(200, { 'Content-Type': `${route[1]}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(500);
      res.end('Unable to load application');
    }
  });
}

// Start only when run directly (`node server.mjs`), not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  createWebServer().listen(port, '127.0.0.1', () => console.log(`AFTERHOURS ready at http://localhost:${port}`));
}
