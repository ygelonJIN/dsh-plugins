import { mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dshHome, isSessionId } from './session-storage.js';

/**
 * Durable "delete when possible" queue for `@local/session-delete`.
 *
 * A Session that still has a live Agent (or another writer) cannot be removed
 * in this process: the Agent owns the persistence write handle and the Host
 * exposes no release seam, so the file must stay until the next Host start.
 * The queue remembers those ids across restarts; the Host purges it before it
 * resumes Agents. Entries are plain ids plus bookkeeping — never titles or
 * message content.
 *
 * The file lives outside the profile so a queued delete survives a profile
 * reload: `<DSH_HOME>/storages/session-delete/pending.json`.
 */

/** Queue schema version; a mismatched version is treated as unreadable. */
const VERSION = 1;

/**
 * @param {string} [home] - DSH home override (tests); defaults to the Host home.
 * @returns {string} absolute pending-queue path.
 */
export function pendingFile(home = dshHome()) {
  return path.join(home, 'storages', 'session-delete', 'pending.json');
}

/** @param {unknown} value */
function isEntry(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return isSessionId(value.sessionId);
}

/**
 * Normalize one stored entry, dropping fields with the wrong type.
 * @param {any} value
 */
function normalizeEntry(value) {
  const entry = { sessionId: value.sessionId };
  if (typeof value.reason === 'string' && value.reason !== '') entry.reason = value.reason;
  if (typeof value.requestedAt === 'number' && Number.isFinite(value.requestedAt)) {
    entry.requestedAt = value.requestedAt;
  }
  if (typeof value.hidden === 'boolean') entry.hidden = value.hidden;
  if (Number.isInteger(value.attempts) && value.attempts >= 0) entry.attempts = value.attempts;
  if (typeof value.lastError === 'string' && value.lastError !== '') entry.lastError = value.lastError;
  return entry;
}

/**
 * Read the queue. Missing files are empty; an unreadable or corrupt document is
 * preserved beside the queue (never silently discarded) and treated as empty.
 * @param {string} file - absolute queue path.
 * @returns {Promise<Array<object>>} normalized entries in file order.
 */
export async function readPending(file) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return [];
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    await quarantine(file);
    return [];
  }
  if (parsed === null || typeof parsed !== 'object' || parsed.version !== VERSION) {
    await quarantine(file);
    return [];
  }
  const list = Array.isArray(parsed.entries) ? parsed.entries : [];
  const seen = new Set();
  const entries = [];
  for (const value of list) {
    if (!isEntry(value)) continue;
    const entry = normalizeEntry(value);
    if (seen.has(entry.sessionId)) continue;
    seen.add(entry.sessionId);
    entries.push(entry);
  }
  return entries;
}

/**
 * Replace the queue atomically. An empty queue removes the file instead of
 * leaving an empty document behind.
 * @param {string} file - absolute queue path.
 * @param {Array<object>} entries - entries to persist.
 */
export async function writePending(file, entries) {
  const kept = [];
  const seen = new Set();
  for (const value of entries) {
    if (!isEntry(value) || seen.has(value.sessionId)) continue;
    seen.add(value.sessionId);
    kept.push(normalizeEntry(value));
  }
  if (kept.length === 0) {
    await rm(file, { force: true });
    return;
  }
  const dir = path.dirname(file);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}-${Date.now().toString(36)}`;
  await writeFile(temporary, `${JSON.stringify({ version: VERSION, entries: kept })}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporary, file);
}

/**
 * Insert or update one id. A repeat request keeps the original `requestedAt`,
 * refreshes the reason, and merges supplied fields.
 * @param {string} file - absolute queue path.
 * @param {string} sessionId - Session to remember.
 * @param {object} [fields] - reason, hidden, activity, attempts, lastError.
 * @returns {Promise<Array<object>>} the persisted queue.
 */
export async function enqueuePending(file, sessionId, fields = {}) {
  if (!isSessionId(sessionId)) throw new Error(`refusing unsafe session id: ${String(sessionId)}`);
  const entries = await readPending(file);
  const index = entries.findIndex((entry) => entry.sessionId === sessionId);
  const existing = index === -1 ? { sessionId, requestedAt: Date.now() } : entries[index];
  const merged = normalizeEntry({ ...existing, ...fields, sessionId });
  if (index === -1) entries.push(merged);
  else entries[index] = merged;
  await writePending(file, entries);
  return entries;
}

/**
 * Drop one id from the queue. Missing ids and files resolve.
 * @param {string} file - absolute queue path.
 * @param {string} sessionId - Session to forget.
 * @returns {Promise<boolean>} whether an entry was removed.
 */
export async function removePending(file, sessionId) {
  const entries = await readPending(file);
  const next = entries.filter((entry) => entry.sessionId !== sessionId);
  if (next.length === entries.length) return false;
  await writePending(file, next);
  return true;
}

/**
 * Move an unreadable queue document aside so the next write starts clean while
 * the operator can still inspect what was there.
 * @param {string} file - absolute queue path.
 */
async function quarantine(file) {
  const target = `${file}.corrupt-${new Date().toISOString().replaceAll(':', '-')}`;
  try {
    await rename(file, target);
    console.warn('[session-delete] unreadable pending queue moved to', target);
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return;
    throw error;
  }
}

/** Remove the queue file entirely (used by tests and manual cleanup). */
export async function clearPending(file) {
  await unlink(file).catch((error) => {
    if (error === null || typeof error !== 'object' || error.code !== 'ENOENT') throw error;
  });
}
