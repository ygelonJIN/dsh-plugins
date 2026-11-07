/**
 * Host-half smoke test for @local/cookie-clean.
 *
 * Builds a throwaway Chromium-shaped `Cookies` database and drives both routes
 * through a fake ctx, so the assertions run without the app:
 *
 *   - only `127.0.0.1` + `dsh-auth-*` rows are counted
 *   - the live row (current port) is never deleted
 *   - every stale row is deleted in one pass
 *   - unrelated cookies and other hosts survive
 *
 * Needs `node:sqlite` (Node >= 22.5). Run with the Node the desktop bundles:
 *   /Applications/DeepSeek\ Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node test/smoke.mjs
 */

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let sqlite;
try {
  sqlite = await import('node:sqlite');
} catch {
  console.log('SKIP: node:sqlite needs Node >= 22.5 (the desktop bundles 24.x)');
  process.exit(0);
}

const PORT = 51234;

/** Same recipe as the Host: base64url(sha256(authority)), no padding. */
function cookieName(authority) {
  return 'dsh-auth-' + createHash('sha256').update(authority).digest('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

const CURRENT = cookieName(`127.0.0.1:${PORT}`);

let passed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
  }
}

/** Insert one cookie row shaped like Chromium's, with a realistic value length. */
function seed(db, hostKey, name, valueLength = 173) {
  db.prepare(
    'INSERT INTO cookies (host_key, name, value, encrypted_value, expires_utc) VALUES (?, ?, ?, ?, 0)',
  ).run(hostKey, name, 'v1.' + 'b'.repeat(Math.max(0, valueLength - 3)), Buffer.alloc(0));
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'cookie-clean-'));
  const dataDir = join(root, 'dsh-desktop');
  await mkdir(dataDir, { recursive: true });

  const dbPath = join(dataDir, 'Cookies');
  const db = new sqlite.DatabaseSync(dbPath);
  db.exec(`CREATE TABLE cookies (
    host_key TEXT NOT NULL,
    name TEXT NOT NULL,
    value TEXT,
    encrypted_value BLOB,
    expires_utc INTEGER NOT NULL DEFAULT 0
  )`);
  seed(db, '127.0.0.1', CURRENT);
  seed(db, '127.0.0.1', cookieName('127.0.0.1:11111'));
  seed(db, '127.0.0.1', cookieName('127.0.0.1:22222'));
  seed(db, '127.0.0.1', cookieName('127.0.0.1:33333'));
  seed(db, '127.0.0.1', 'dsh-theme');              // not an auth cookie
  seed(db, 'example.com', cookieName('example.com:80')); // different host, must survive
  db.close();

  process.env.DSH_HOME = join(root, 'home');
  // 仓库路径带空格：直接把 URL 交给 import()，不要用 .pathname 再拼 file URL。
  const host = await import(new URL('../index.js', import.meta.url).href);

  check('cookie name matches the Host recipe', host.__test.cookieName(`127.0.0.1:${PORT}`) === CURRENT,
    host.__test.cookieName(`127.0.0.1:${PORT}`));

  const routes = new Map();
  const ctx = {
    webServer: { port: PORT },
    connection: { fetch: { register: (route) => { routes.set(route.path, route); return () => {}; } } },
    effect: (fn) => fn(),
  };
  host.apply(ctx, { dataDir });

  check('summary route registered', routes.has('/api/cookie-clean.summary'));
  check('run route registered', routes.has('/api/cookie-clean.run'));
  // 共享通道把 route.requestBody 直接交给载体；漏写会让 GET 被拒成 400（0.1.0 踩过）。
  check('GET route declares a body mode', routes.get('/api/cookie-clean.summary')?.requestBody === 'buffered',
    String(routes.get('/api/cookie-clean.summary')?.requestBody));
  check('POST route declares a body mode', routes.get('/api/cookie-clean.run')?.requestBody === 'buffered',
    String(routes.get('/api/cookie-clean.run')?.requestBody));

  const summary = await (await routes.get('/api/cookie-clean.summary').fetch(new Request('http://x/'))).json();
  check('summary ok', summary.ok === true, JSON.stringify(summary));
  check('counts only 127.0.0.1 dsh-auth rows', summary.total === 4, `total=${summary.total}`);
  check('three rows are stale', summary.stale === 3, `stale=${summary.stale}`);
  check('header estimate grows past the bare overhead', summary.headerBytes > 700, `bytes=${summary.headerBytes}`);
  check('level is ok on a small jar', summary.level === 'ok', `level=${summary.level}`);

  const run = await (await routes.get('/api/cookie-clean.run').fetch(new Request('http://x/', { method: 'POST' }))).json();
  check('run deleted the stale rows', run.deleted === 3, `deleted=${run.deleted}`);
  check('run kept the live row', run.total === 1, `total=${run.total}`);
  check('nothing stale left', run.stale === 0, `stale=${run.stale}`);

  const verify = new sqlite.DatabaseSync(dbPath, { readOnly: true });
  const rows = verify.prepare('SELECT host_key, name FROM cookies ORDER BY host_key, name').all();
  verify.close();
  const names = rows.map((row) => `${row.host_key}|${row.name}`);
  check('live cookie still present', names.includes(`127.0.0.1|${CURRENT}`), names.join(', '));
  check('unrelated loopback cookie untouched', names.includes('127.0.0.1|dsh-theme'), names.join(', '));
  check('foreign host untouched', names.some((entry) => entry.startsWith('example.com|')), names.join(', '));
  check('stale names gone',
    !names.some((entry) => entry.startsWith('127.0.0.1|dsh-auth-') && entry !== `127.0.0.1|${CURRENT}`),
    names.join(', '));

  const second = await (await routes.get('/api/cookie-clean.run').fetch(new Request('http://x/', { method: 'POST' }))).json();
  check('second run is a no-op', second.deleted === 0, `deleted=${second.deleted}`);

  await rm(root, { recursive: true, force: true });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exit(1);
}

await main();
