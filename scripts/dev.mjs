// Starts the API and the game together: `npm run dev` (Postgres, using apps/api/.env)
// or `npm run dev:memory` (no database; everything is lost when you stop it).
// Plain Node instead of a helper package, so it works the same on Windows, macOS and Linux.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const memory = process.argv.includes('--memory');
const colours = { api: '\x1b[36m', web: '\x1b[35m' };

function start(name, cwd, args, env = {}) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `${colours[name]}[${name}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    let partial = '';
    stream.on('data', (chunk) => {
      const lines = (partial + chunk).split('\n');
      partial = lines.pop();
      for (const line of lines) process.stdout.write(prefix + line + '\n');
    });
  }
  child.on('exit', (code) => {
    console.log(`${prefix}stopped (exit code ${code}). Stopping everything.`);
    shutdown(code ?? 1);
  });
  return child;
}

// Only pass --env-file when the file exists: Node's watch mode crashes trying to watch a missing one.
// Watch only the API's own code: plain --watch also follows node_modules, so an `npm install`
// would restart the API and wipe all progress in memory mode (#11).
const envFile = existsSync('apps/api/.env') ? ['--env-file=.env'] : [];
const children = [
  start('api', 'apps/api', [...envFile, '--watch-path=src', 'src/server.ts'], memory ? { STORE: 'memory', TRUST_PROXY: 'loopback' } : {}),
  start('web', 'apps/web', ['server.mjs']),
];

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
console.log(`Starting AFTERHOURS (${memory ? 'no database' : 'Postgres'}). Open http://localhost:3000 — press Ctrl+C to stop.`);
