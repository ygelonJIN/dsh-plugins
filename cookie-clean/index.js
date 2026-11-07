/**
 * Host half of @local/cookie-clean.
 *
 * Why this exists
 * ---------------
 * The Electron shell starts the Host on a random loopback port (`--port 0`) and
 * mints one browser-session cookie per launch:
 *
 *     dsh-auth-<base64url(sha256("127.0.0.1:<port>"))>
 *
 * The name is bound to the authority so a cookie cannot be replayed on another
 * port, which is good for the fence and bad for the jar: every launch adds a
 * new name, nothing removes the old ones, and each lives for 30 days
 * (`cookieMaxAgeDays`). Chromium sends *every* cookie for 127.0.0.1 regardless
 * of port, so the Cookie request header grows by ~226 bytes per launch. Around
 * the 70th cookie it crosses Node's 16 KiB `maxHeaderSize`, the Host answers
 * 431, and `connectDesktopWelcome` surfaces that as
 * "desktop welcome: Web authentication failed" — a startup failure that cannot
 * be retried away, because the next launch has the same jar.
 *
 * What this half does
 * -------------------
 * Deletes only the rows whose port no longer exists. The live cookie is
 * recomputed from `webServer.port` with the same recipe the Host uses and is
 * excluded from the DELETE, so cleaning can never sign out the running session.
 * Deleting a dead-port row is semantically a no-op; it only buys back header
 * budget.
 *
 * `node:sqlite` is used directly (Node >= 22.5, the desktop bundles 24). The
 * database is opened with a busy timeout because Chromium keeps it open; a
 * concurrent-writer collision surfaces as SQLITE_BUSY instead of a retry loop.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const inject = ['connection', 'webServer'];

const SUMMARY_ROUTE = '/api/cookie-clean.summary';
const RUN_ROUTE = '/api/cookie-clean.run';

/** Prefix the Host mints; see browser-auth.js in the dsh-client-connection package. */
const PREFIX = 'dsh-auth-';
/** Every session cookie belongs to the loopback authority, whatever the port. */
const HOST_KEY = '127.0.0.1';
/** Node's default `http.maxHeaderSize`; the Host inherits it unchanged. */
const HEADER_LIMIT = 16384;
/** Typical non-cookie request headers for one loopback document fetch. */
const HEADER_OVERHEAD = 700;
/** Above this the warning is no longer theoretical. */
const SAFE_BUDGET = 13000;
/** Fallback per-cookie cost when the jar is empty: name=52, '=', value=173, '; '. */
const DEFAULT_COOKIE_BYTES = 226;

/** Electron resolves userData as `appData/<package name>`; the shell does not override it. */
const APP_ID = '@deepseek-ai/dsh-desktop';

function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh');
}

/** Where the shell keeps its Chromium profile, per platform. */
function defaultDataDir() {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', APP_ID);
  }
  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), APP_ID);
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), APP_ID);
}

/** The root profile keeps `Cookies`; a partitioned profile keeps it under `Network/`. */
function findCookieDb(dataDir) {
  for (const relative of ['Cookies', join('Network', 'Cookies')]) {
    const path = join(dataDir, relative);
    if (existsSync(path)) return path;
  }
  return null;
}

/** Same recipe as the Host: base64url(sha256(authority)), no padding. */
function cookieName(authority) {
  return PREFIX + createHash('sha256').update(authority).digest('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

/** Chromium encrypts `value` into `encrypted_value` on some password stores; either way it is sent. */
const VALUE_LENGTH = 'CASE WHEN length(value) > 0 THEN length(value) ELSE length(encrypted_value) END';

class CookieCleanError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CookieCleanError';
    this.code = code;
  }
}

/** Open the jar with a short busy timeout and close it no matter what the callback does. */
async function withDb(dbPath, fn) {
  let sqlite;
  try {
    sqlite = await import('node:sqlite');
  } catch (error) {
    throw new CookieCleanError(
      'no-sqlite',
      `node:sqlite is unavailable in this runtime (${error instanceof Error ? error.message : String(error)}); the desktop bundles Node >= 22.5`,
    );
  }
  let db;
  try {
    db = new sqlite.DatabaseSync(dbPath);
  } catch (error) {
    throw new CookieCleanError('open-failed', `cannot open ${dbPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    db.exec('PRAGMA busy_timeout = 3000');
    const table = db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'cookies'").get();
    if (table === undefined) throw new CookieCleanError('not-a-cookie-db', `${dbPath} has no cookies table`);
    return fn(db);
  } finally {
    try { db.close(); } catch { /* already closed by a failed statement */ }
  }
}

/** One snapshot of the jar, restricted to the rows this plugin owns. */
function readRows(db) {
  return db.prepare(
    `SELECT name, ${VALUE_LENGTH} AS valueBytes
       FROM cookies
      WHERE host_key = ? AND name LIKE ?`,
  ).all(HOST_KEY, PREFIX + '%');
}

function summarize(rows, current) {
  let headerBytes = HEADER_OVERHEAD;
  let staleBytes = 0;
  let stale = 0;
  for (const row of rows) {
    const name = String(row.name);
    const valueBytes = Number(row.valueBytes) || 0;
    // "name=value; " — the separator is part of the header too.
    const cost = name.length + 1 + valueBytes + 2;
    headerBytes += cost;
    if (name !== current) {
      stale += 1;
      staleBytes += cost;
    }
  }
  const perCookie = rows.length > 0
    ? Math.round((headerBytes - HEADER_OVERHEAD) / rows.length)
    : DEFAULT_COOKIE_BYTES;
  return {
    total: rows.length,
    stale,
    staleBytes,
    headerBytes,
    perCookie,
    // How many more launches fit before the soft budget, at the observed cost.
    runsLeft: Math.max(0, Math.floor((SAFE_BUDGET - headerBytes) / Math.max(perCookie, 1))),
  };
}

function level(headerBytes) {
  if (headerBytes >= SAFE_BUDGET) return 'danger';
  if (headerBytes >= 8000) return 'warn';
  return 'ok';
}

async function readSummary(dataDir, authority, current) {
  const dbPath = findCookieDb(dataDir);
  if (dbPath === null) {
    throw new CookieCleanError('no-db', `no Chromium cookie database under ${dataDir}`);
  }
  return withDb(dbPath, (db) => {
    const stats = summarize(readRows(db), current);
    return {
      ok: true,
      dataDir,
      dbPath,
      authority,
      current,
      limit: HEADER_LIMIT,
      overhead: HEADER_OVERHEAD,
      safeBudget: SAFE_BUDGET,
      level: level(stats.headerBytes),
      ...stats,
    };
  });
}

/** Delete stale rows in one immediate transaction so a busy Chromium either yields or reports. */
async function cleanStale(dataDir, authority, current) {
  const dbPath = findCookieDb(dataDir);
  if (dbPath === null) {
    throw new CookieCleanError('no-db', `no Chromium cookie database under ${dataDir}`);
  }
  return withDb(dbPath, (db) => {
    const before = summarize(readRows(db), current);
    let deleted = 0;
    if (before.stale > 0) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = db.prepare(
          'DELETE FROM cookies WHERE host_key = ? AND name LIKE ? AND name <> ?',
        ).run(HOST_KEY, PREFIX + '%', current);
        db.exec('COMMIT');
        deleted = Number(result.changes) || 0;
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch { /* transaction already gone */ }
        throw new CookieCleanError(
          'busy',
          `the cookie database is in use (${error instanceof Error ? error.message : String(error)}); retry once the current request settles`,
        );
      }
    }
    const after = summarize(readRows(db), current);
    return { ok: true, dbPath, authority, current, deleted, ...after, limit: HEADER_LIMIT };
  });
}

/** Keep the last run on disk so "did it actually clean" is answerable after a restart. */
async function journal(record) {
  try {
    const dir = join(dshHome(), 'storages', 'cookie-clean');
    await mkdir(dir, { recursive: true });
    const path = join(dir, 'last.json');
    await writeFile(path, JSON.stringify(record, null, 2) + '\n', 'utf8');
    return path;
  } catch {
    return null;
  }
}

function json(status, body) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export function apply(ctx, config = {}) {
  const dataDir = typeof config.dataDir === 'string' && config.dataDir.length > 0
    ? config.dataDir
    : defaultDataDir();

  /** Read the live authority at request time: the port is fixed only after listen. */
  const authorityOf = () => {
    const port = ctx.webServer?.port;
    if (!Number.isSafeInteger(port) || port <= 0) {
      throw new CookieCleanError('no-port', 'the web server has not started yet');
    }
    return `${HOST_KEY}:${port}`;
  };

  const fail = (error) => {
    if (error instanceof CookieCleanError) {
      return json(error.code === 'busy' ? 409 : 500, { ok: false, code: error.code, message: error.message });
    }
    console.error('[cookie-clean] failed:', error);
    return json(500, {
      ok: false,
      code: 'failed',
      message: error instanceof Error ? error.message : String(error),
    });
  };

  ctx.effect(() => ctx.connection.fetch.register({
    path: SUMMARY_ROUTE,
    methods: ['GET'],
    // 必须显式声明：共享通道的 requestBodyMode 会把 undefined 交给载体，GET 也会被拒成 400。
    // self-check / workspace-ledger 的 GET 路由同样都写了这一行。
    requestBody: 'buffered',
    async fetch() {
      try {
        const authority = authorityOf();
        return json(200, await readSummary(dataDir, authority, cookieName(authority)));
      } catch (error) {
        return fail(error);
      }
    },
  }), 'cookie-clean: summary route');

  ctx.effect(() => ctx.connection.fetch.register({
    path: RUN_ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch() {
      try {
        const authority = authorityOf();
        const result = await cleanStale(dataDir, authority, cookieName(authority));
        const logPath = await journal({
          at: Date.now(),
          deleted: result.deleted,
          remaining: result.total,
          stale: result.stale,
          headerBytes: result.headerBytes,
          authority: result.authority,
          dbPath: result.dbPath,
        });
        return json(200, { ...result, logPath });
      } catch (error) {
        return fail(error);
      }
    },
  }), 'cookie-clean: run route');
}

export const __test = { cookieName, defaultDataDir, summarize };
