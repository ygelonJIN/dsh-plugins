import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';

/**
 * Durable marks for `@local/sidebar-marks`.
 *
 * The sidebar shows one kind of mark, keyed by the ids the Host already owns:
 * a color mark on Sessions (`session-…`) and Workspaces (registry id).
 *
 * Only ids and a color key are stored — never titles, paths, or message
 * content. The file lives outside the profile so marks survive a profile
 * reload: `<DSH_HOME>/storages/sidebar-marks/marks.json`.
 */

/** File schema version; a mismatched version is treated as unreadable. */
export const VERSION = 1;

/** Palette keys in picker order. */
export const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];

/** @returns {string} the DSH home directory. */
export function dshHome() {
  const configured = process.env.DSH_HOME;
  if (typeof configured === 'string' && configured.trim() !== '') {
    return path.resolve(configured.trim());
  }
  return path.join(homedir(), '.dsh');
}

/**
 * @param {string} [home] - DSH home override (tests).
 * @returns {string} absolute marks path.
 */
export function marksFile(home = dshHome()) {
  return path.join(home, 'storages', 'sidebar-marks', 'marks.json');
}

/** @param {unknown} value */
export function isMarkId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f]/.test(value);
}

/** @param {unknown} value */
export function isColor(value) {
  return typeof value === 'string' && COLORS.includes(value);
}

/** @param {unknown} value */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Normalize one stored mark entry, dropping fields with the wrong type.
 * @param {any} value
 * @returns {{ color: string, updatedAt?: number } | null}
 */
function normalizeEntry(value) {
  if (!isRecord(value) || !isColor(value.color)) return null;
  const entry = { color: value.color };
  if (typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)) entry.updatedAt = value.updatedAt;
  return entry;
}

/**
 * Normalize a stored marks document into the runtime shape.
 * @param {any} parsed
 * @returns {{ sessions: object, workspaces: object }}
 */
export function normalizeMarks(parsed) {
  const state = { sessions: {}, workspaces: {} };
  if (!isRecord(parsed)) return state;
  for (const [kind, target] of [['sessions', state.sessions], ['workspaces', state.workspaces]]) {
    const source = parsed[kind];
    if (!isRecord(source)) continue;
    for (const [id, value] of Object.entries(source)) {
      if (!isMarkId(id)) continue;
      const entry = normalizeEntry(value);
      if (entry === null) continue;
      target[id] = entry;
    }
  }
  return state;
}

/**
 * Read the marks document. Missing files are empty; an unreadable or corrupt
 * document is preserved beside it (never silently discarded) and treated as
 * empty.
 * @param {string} file - absolute marks path.
 * @returns {Promise<{ sessions: object, workspaces: object }>}
 */
export async function readMarks(file) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return normalizeMarks(null);
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    await quarantine(file);
    return normalizeMarks(null);
  }
  if (!isRecord(parsed) || parsed.version !== VERSION) {
    await quarantine(file);
    return normalizeMarks(null);
  }
  return normalizeMarks(parsed);
}

/**
 * Replace the marks document atomically. A document without any mark removes
 * the file instead of leaving an empty document behind.
 * @param {string} file - absolute marks path.
 * @param {object} state - normalized marks.
 */
export async function writeMarks(file, state) {
  const normalized = normalizeMarks(state);
  const empty = Object.keys(normalized.sessions).length === 0
    && Object.keys(normalized.workspaces).length === 0;
  if (empty) {
    await rm(file, { force: true });
    return;
  }
  const dir = path.dirname(file);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}-${Date.now().toString(36)}`;
  await writeFile(temporary, `${JSON.stringify({ version: VERSION, ...normalized })}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporary, file);
}

/**
 * Set or clear one color mark. A `null` color drops the entry.
 * @param {object} state - normalized marks.
 * @param {'session'|'workspace'} kind - which collection the id belongs to.
 * @param {string} id - Session or Workspace id.
 * @param {string|null} color - palette key, or `null` to clear.
 * @returns {object} the next state (a copy).
 */
export function setColor(state, kind, id, color) {
  if (kind !== 'session' && kind !== 'workspace') throw new Error(`refusing unknown mark kind: ${String(kind)}`);
  if (!isMarkId(id)) throw new Error(`refusing unsafe mark id: ${String(id)}`);
  if (color !== null && !isColor(color)) throw new Error(`refusing unknown color: ${String(color)}`);
  const key = kind === 'session' ? 'sessions' : 'workspaces';
  const next = {
    sessions: { ...state.sessions },
    workspaces: { ...state.workspaces },
  };
  if (color === null) delete next[key][id];
  else next[key][id] = { color, updatedAt: Date.now() };
  return next;
}

/**
 * Move an unreadable marks document aside so the next write starts clean while
 * the operator can still inspect what was there.
 * @param {string} file - absolute marks path.
 */
async function quarantine(file) {
  const target = `${file}.corrupt-${new Date().toISOString().replaceAll(':', '-')}`;
  try {
    await rename(file, target);
    console.warn('[sidebar-marks] unreadable marks moved to', target);
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return;
    throw error;
  }
}
