import { lstat, readdir, rm, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

/**
 * On-disk half of `@local/session-delete`.
 *
 * Session logs are JSONL artifacts under `<DSH_HOME>/sessions`, one directory
 * per Session inside a directory named after the (escaped) working directory.
 * The persistence seam has no deletion API, so this module reproduces only the
 * path rules needed to remove a finalized Session and its projections:
 *
 *   <root>/<project>/<session-id>/
 *   <DSH_HOME>/storages/session_projcache/sessions/<session-id>.json
 *
 * It never touches shared attachments (content-addressed and possibly reused by
 * surviving Sessions) or the spill/cache directories.
 */

export const SESSION_ID_PATTERN = /^session-[A-Za-z0-9-]{1,160}$/;

export function isSessionId(value) {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value);
}

export function dshHome() {
  const configured = process.env.DSH_HOME;
  if (typeof configured === 'string' && configured.trim() !== '') {
    return path.resolve(configured.trim());
  }
  return path.join(homedir(), '.dsh');
}

export function sessionsRoot() {
  return path.join(dshHome(), 'sessions');
}

export function projectionCacheRoot() {
  return path.join(dshHome(), 'storages', 'session_projcache', 'sessions');
}

/** Root of the optional session-undo snapshot stores. */
export function undoStoreRoot() {
  return path.join(dshHome(), 'undo', 'sessions');
}

/**
 * Drop the undo snapshot store that may belong to each Session. The undo
 * plugin is optional, so a missing directory is not an error.
 * @returns {Promise<string[]>} warnings for failures other than absence.
 */
export async function removeUndoStores(sessionIds) {
  const warnings = [];
  for (const sessionId of sessionIds) {
    if (!isSessionId(sessionId)) continue;
    try {
      await rm(path.join(undoStoreRoot(), sessionId), { recursive: true, force: true });
    } catch (error) {
      warnings.push(`undo store ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return warnings;
}

/**
 * Locate every project directory that owns a directory named `sessionId`.
 *
 * A leftover copy (manual duplicating, a crashed rename) is treated as part of
 * the same Session, so every match is returned. Symbolic links are refused:
 * deleting through a link would remove an unrelated directory.
 */
export async function findSessionDirs(root, sessionId) {
  if (!isSessionId(sessionId)) {
    throw new Error(`refusing unsafe session id: ${String(sessionId)}`);
  }
  let projects;
  try {
    projects = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return [];
    throw error;
  }
  const dirs = [];
  for (const project of projects) {
    if (!project.isDirectory()) continue;
    const candidate = path.join(root, project.name, sessionId);
    const info = await lstat(candidate).catch(() => undefined);
    if (info === undefined || !info.isDirectory() || info.isSymbolicLink()) continue;
    dirs.push(candidate);
  }
  return dirs;
}

/** Remove every on-disk directory belonging to the given Sessions. */
export async function removeSessionDirectories(root, sessionIds) {
  const removed = [];
  for (const sessionId of sessionIds) {
    for (const dir of await findSessionDirs(root, sessionId)) {
      await rm(dir, { recursive: true, force: true });
      removed.push(dir);
    }
  }
  return removed;
}

/** Drop the persisted projection-cache document for each Session. */
export async function removeProjectionCacheEntries(root, sessionIds) {
  const removed = [];
  for (const sessionId of sessionIds) {
    if (!isSessionId(sessionId)) continue;
    const file = path.join(root, `${sessionId}.json`);
    try {
      await unlink(file);
      removed.push(file);
    } catch (error) {
      if (error === null || typeof error !== 'object' || error.code !== 'ENOENT') throw error;
    }
  }
  return removed;
}

/**
 * Session ids of the subagent descendants of `rootId`.
 *
 * Only headers marked `origin: 'subagent'` are followed, so ordinary forks
 * (which carry `parentSession` for lineage) stay independent records.
 */
export function descendantSessionIds(snapshots, rootId) {
  const childrenByParent = new Map();
  for (const snapshot of snapshots) {
    const header = snapshot === null || snapshot === undefined ? undefined : snapshot.header;
    if (header === null || typeof header !== 'object') continue;
    if (header.origin !== 'subagent') continue;
    const parent = header.parentSession;
    if (typeof parent !== 'string' || parent === '') continue;
    const children = childrenByParent.get(parent);
    if (children === undefined) childrenByParent.set(parent, [header.id]);
    else children.push(header.id);
  }
  const descendants = [];
  const seen = new Set([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const parent = queue.shift();
    const children = childrenByParent.get(parent);
    if (children === undefined) continue;
    for (const child of children) {
      if (seen.has(child)) continue;
      seen.add(child);
      descendants.push(child);
      queue.push(child);
    }
  }
  return descendants;
}
