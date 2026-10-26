import {
  descendantSessionIds,
  findSessionDirs,
  isSessionId,
  projectionCacheRoot,
  removeProjectionCacheEntries,
  removeSessionDirectories,
  removeUndoStores,
  sessionsRoot,
} from './session-storage.js';
import { enqueuePending, pendingFile, readPending, removePending } from './pending.js';

/**
 * Host half of `@local/session-delete`.
 *
 * The persistence seam intentionally has no deletion API ("logs accumulate
 * under root until removed externally"). This plugin owns that external
 * operation for one Session at a time, behind the authenticated browser
 * connection:
 *
 * 1. the Session must exist in session persistence;
 * 2. running work is stopped first — a scheduled reminder otherwise counts as
 *    activity forever, and a turn keeps its Agent live;
 * 3. a Session with no live Agent and no activity is deleted immediately,
 *    after every target claims write ownership;
 * 4. a Session that is still live (an Agent owns the write handle) joins the
 *    durable pending queue: it is archived immediately and removed on the next
 *    Host start, before Agents resume;
 * 5. Workspace membership, archive membership, and pin membership are cleaned;
 * 6. the Session directory (plus every subagent descendant) and the persisted
 *    projection-cache document are removed.
 *
 * Shared attachments stay untouched: they are content-addressed and may be
 * referenced by surviving Sessions.
 */

export const name = 'session-delete';

export const inject = ['agents', 'connection', 'sessions', 'sessionPersistence', 'workspaceRegistry'];

const ROUTE = '/api/session-delete.delete';
const PURGE_ROUTE = '/api/session-delete.purge';
// Purge before the Web client can restore an archived Session and keep it live.
const STARTUP_PURGE_DELAY_MS = 100;
const STOP_SETTLE_ATTEMPTS = 3;
const STOP_SETTLE_DELAY_MS = 100;

class SessionDeleteError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'SessionDeleteError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/** Project the activity seam's entries into client-safe labels. */
function describeActivity(activity) {
  return activity.map((entry) => ({
    kind: typeof entry?.kind === 'string' && entry.kind !== '' ? entry.kind : 'work',
    items: Array.isArray(entry?.items)
      ? entry.items
        .map((item) => ({
          ...(typeof item?.id === 'string' ? { id: item.id } : {}),
          ...(typeof item?.label === 'string' && item.label !== '' ? { label: item.label } : {}),
        }))
        .filter((item) => item.id !== undefined || item.label !== undefined)
      : [],
  }));
}

/**
 * Ask every composed activity provider what still runs for the Session.
 * This is the declared read-only seam the Workspace registry uses for archive
 * admission; it writes nothing.
 */
async function readActivity(ctx, sessionId) {
  const activity = await ctx.waterfall(
    'workspace/session-activity',
    { sessionId },
    () => Promise.resolve([]),
  );
  return Array.isArray(activity) ? activity : [];
}

/**
 * Ask every composed stop provider to end the Session's work: scheduled
 * reminders are deleted, an active turn is cancelled, and job providers stop
 * what they own. The durable archive set is not written here; the caller
 * decides whether the Session is archived (queued) or deleted.
 */
async function requestStop(ctx, sessionId) {
  if (typeof ctx.parallel !== 'function') return;
  try {
    await ctx.parallel('workspace/session-stop', { sessionId });
  } catch (error) {
    console.warn('[session-delete] session-stop failed for', sessionId, ':', messageOf(error));
  }
}

/** Wait briefly for cancelled work to stop reporting activity. */
async function settleActivity(ctx, sessionId) {
  let activity = await readActivity(ctx, sessionId);
  for (let attempt = 0; attempt < STOP_SETTLE_ATTEMPTS && activity.length > 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, STOP_SETTLE_DELAY_MS));
    activity = await readActivity(ctx, sessionId);
  }
  return activity;
}

/**
 * First target with a live Agent. A Session merely loaded for viewing has no
 * writer of its own, so it does not block deletion: the client switches away
 * after the response. A live Agent owns the persistence write handle and must
 * stay queued until the Host releases it.
 */
function firstAgent(ctx, sessionIds) {
  for (const sessionId of sessionIds) {
    if (ctx.agents.get(sessionId) !== undefined) return sessionId;
  }
  return undefined;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Release an idle Agent so its persistence write handle closes and the files
 * can be deleted now. The Host exposes no public release seam; an idle Agent's
 * scope disposer is the only handle left to us. A running Agent, pending input,
 * or a missing disposer returns false, and the caller queues the deletion.
 */
async function releaseIdleAgent(ctx, sessionId) {
  const agent = ctx.agents.get(sessionId);
  if (agent === undefined) return true;
  if (agent.status === 'running') return false;
  if ((agent.inbox?.nextTurn?.length ?? 0) > 0 || (agent.inbox?.nextStep?.length ?? 0) > 0) return false;
  const dispose = agent.scope?.rawDispose;
  if (typeof dispose !== 'function') return false;
  try {
    await dispose();
  } catch (error) {
    console.warn('[session-delete] releasing idle Agent failed for', sessionId, ':', messageOf(error));
    return false;
  }
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (ctx.agents.get(sessionId) === undefined) return true;
    await delay(20);
  }
  return ctx.agents.get(sessionId) === undefined;
}

async function releaseHandles(handles) {
  for (const handle of handles.splice(0)) {
    try {
      await handle.close();
    } catch {
      // The session directory may already be gone; own close is best-effort.
    }
  }
}

/**
 * Drop Workspace accounting, archive membership, and pin membership.
 * Runs before the files disappear, while the registry's header index still
 * knows the Session, so `detachSession` can actually remove it.
 */
async function detachFromRegistries(registry, sessionIds) {
  const warnings = [];
  const targets = new Set(sessionIds);
  for (const workspace of registry.list()) {
    for (const sessionId of workspace.sessionIds) {
      if (!targets.has(sessionId)) continue;
      try {
        await workspace.detachSession(sessionId);
      } catch (error) {
        warnings.push(`workspace ${String(workspace.id)} detach ${sessionId}: ${messageOf(error)}`);
      }
    }
  }
  for (const sessionId of sessionIds) {
    try {
      await registry.unarchiveSession(sessionId);
    } catch (error) {
      warnings.push(`unarchive ${sessionId}: ${messageOf(error)}`);
    }
    try {
      await registry.unpinSession(sessionId);
    } catch (error) {
      warnings.push(`unpin ${sessionId}: ${messageOf(error)}`);
    }
  }
  return warnings;
}

/**
 * Archive the Session immediately and remember it for the next Host start.
 * Enqueueing happens before archiving so a crash between the two leaves the
 * Session visible rather than hidden without a deletion record. `hidden`
 * records whether the archive actually landed; the purge skips entries whose
 * Session the user restored before restarting.
 */
async function queueDeletion(ctx, sessionId, reason, activity) {
  const file = pendingFile();
  const activityView = describeActivity(activity);
  await enqueuePending(file, sessionId, { reason, hidden: false });
  let archived = false;
  try {
    await ctx.workspaceRegistry.archiveSession(sessionId, { stopActivity: true });
    archived = true;
  } catch (error) {
    console.warn('[session-delete] archive before queue failed for', sessionId, ':', messageOf(error));
  }
  if (archived) await enqueuePending(file, sessionId, { hidden: true });
  return { queued: true, sessionId, reason, activity: activityView, archived };
}

/**
 * Remove one Session (and its subagent descendants) from disk.
 *
 * @returns {Promise<object>} either `{ queued: false, deleted, directories,
 *   warnings }` or `{ queued: true, sessionId, reason, activity, archived }`.
 */
async function deleteSession(ctx, requestedId, options = {}) {
  const persistence = ctx.sessionPersistence;
  const snapshot = await persistence.stat(requestedId);
  if (snapshot === undefined) {
    await removePending(pendingFile(), requestedId);
    throw new SessionDeleteError(404, 'not-found', 'the session does not exist');
  }

  const snapshots = await persistence.list();
  const descendants = descendantSessionIds(snapshots, requestedId);
  const targets = [requestedId, ...descendants];
  const warnings = [];

  // Stop first: reminders otherwise count as activity forever, and a running
  // turn would keep its Agent live. This is the same seam the archive path
  // uses, so no reminder can wake the Session afterwards.
  if (options.stopWork !== false) await requestStop(ctx, requestedId);

  const activity = await settleActivity(ctx, requestedId);
  if (activity.length > 0) {
    if (options.fromQueue) {
      return {
        queued: true,
        sessionId: requestedId,
        reason: 'active',
        activity: describeActivity(activity),
        archived: true,
      };
    }
    return { ...(await queueDeletion(ctx, requestedId, 'active', activity)), warnings };
  }

  let liveActor;
  for (const sessionId of targets) {
    if (await releaseIdleAgent(ctx, sessionId)) continue;
    liveActor = sessionId;
    break;
  }
  if (liveActor !== undefined) {
    if (options.fromQueue) {
      return { queued: true, sessionId: liveActor, reason: 'agent', activity: [], archived: true };
    }
    return { ...(await queueDeletion(ctx, requestedId, 'agent', [])), warnings };
  }

  const root = sessionsRoot();
  const onDisk = new Map();
  for (const sessionId of targets) {
    const dirs = await findSessionDirs(root, sessionId);
    if (sessionId === requestedId && dirs.length === 0) {
      await removePending(pendingFile(), requestedId);
      throw new SessionDeleteError(404, 'not-found', 'the session has no files on disk');
    }
    onDisk.set(sessionId, dirs);
  }

  const handles = [];
  try {
    for (const sessionId of targets) {
      // Nothing on disk means nothing to protect (and opening write could
      // materialize a pending log just to delete it again).
      if ((onDisk.get(sessionId) ?? []).length === 0) continue;
      const current = sessionId === requestedId ? snapshot : await persistence.stat(sessionId);
      if (current === undefined || current.formatStatus === 'migration-required') continue;
      try {
        handles.push(await persistence.open(sessionId, 'write'));
      } catch (error) {
        if (error?.name === 'SessionAlreadyOwnedError') {
          if (options.fromQueue) {
            return { queued: true, sessionId, reason: 'writer', activity: [], archived: true };
          }
          return { ...(await queueDeletion(ctx, requestedId, 'writer', [])), warnings };
        }
        if (error?.name === 'SessionPersistenceNotFoundError') {
          await removePending(pendingFile(), requestedId);
          throw new SessionDeleteError(404, 'not-found', `the session ${sessionId} disappeared`);
        }
        throw error;
      }
    }

    const detachWarnings = await detachFromRegistries(ctx.workspaceRegistry, targets);
    warnings.push(...detachWarnings);

    // Windows refuses to unlink an open file; the ownership check already
    // happened, so release before removing there.
    if (process.platform === 'win32') await releaseHandles(handles);

    const directories = await removeSessionDirectories(root, targets);
    try {
      await removeProjectionCacheEntries(projectionCacheRoot(), targets);
    } catch (error) {
      warnings.push(`projection cache: ${messageOf(error)}`);
    }
    warnings.push(...await removeUndoStores(targets));
    await removePending(pendingFile(), requestedId);

    return { queued: false, deleted: targets, directories: directories.length, warnings };
  } finally {
    await releaseHandles(handles);
  }
}

/** One purge at a time; a release that arrives mid-run is covered by the run. */
let purgeInFlight = null;

/**
 * Delete every queued Session that is now deletable.
 *
 * Runs at Host start before Agents resume, and again when an Agent or Session
 * is disposed. Entries whose Session the user restored (unarchived) are
 * dropped; entries still blocked stay queued with an attempt count.
 *
 * @param {object} ctx - Host context with the same injects as `apply`.
 * @returns {Promise<{deleted: string[], kept: string[]}>}
 */
export function purgePending(ctx) {
  if (purgeInFlight !== null) return purgeInFlight;
  purgeInFlight = runPurge(ctx).finally(() => {
    purgeInFlight = null;
  });
  return purgeInFlight;
}

async function runPurge(ctx) {
  const file = pendingFile();
  const entries = await readPending(file);
  if (entries.length === 0) return { deleted: [], kept: [] };

  const archiveState = ctx.workspaceRegistry.archivedSessionIds;
  const archived = Array.isArray(archiveState) ? new Set(archiveState) : undefined;
  const keep = [];
  const deleted = [];
  for (const entry of entries) {
    // The user unarchived the Session before the purge: treat that as cancel.
    if (entry.hidden === true && archived !== undefined && !archived.has(entry.sessionId)) {
      await removePending(file, entry.sessionId);
      continue;
    }
    try {
      const result = await deleteSession(ctx, entry.sessionId, { fromQueue: true });
      if (result.queued) {
        keep.push(entry.sessionId);
        await enqueuePending(file, entry.sessionId, {
          attempts: (entry.attempts ?? 0) + 1,
          lastError: result.reason,
        });
        continue;
      }
      // deleteSession already removed the entry on success.
      deleted.push(entry.sessionId);
    } catch (error) {
      if (error instanceof SessionDeleteError && error.code === 'not-found') {
        await removePending(file, entry.sessionId);
        deleted.push(entry.sessionId);
        continue;
      }
      keep.push(entry.sessionId);
      await enqueuePending(file, entry.sessionId, {
        attempts: (entry.attempts ?? 0) + 1,
        lastError: messageOf(error),
      });
    }
  }
  if (deleted.length > 0) {
    console.info('[session-delete] purged', deleted.length, 'queued session(s)');
  }
  if (keep.length > 0) {
    console.warn('[session-delete] kept', keep.length, 'queued session(s) for the next attempt');
  }
  return { deleted, kept: keep };
}

export function apply(ctx, config = {}) {
  const dispose = ctx.connection.fetch.register({
    path: ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse(400, { ok: false, code: 'bad-request', message: 'the body is not valid JSON' });
      }
      const sessionId = body !== null && typeof body === 'object' ? body.sessionId : undefined;
      if (!isSessionId(sessionId)) {
        return jsonResponse(400, { ok: false, code: 'bad-request', message: 'sessionId is missing or malformed' });
      }
      try {
        const result = await deleteSession(ctx, sessionId);
        for (const warning of result.warnings ?? []) console.warn('[session-delete]', warning);
        if (result.queued) {
          return jsonResponse(202, {
            ok: true,
            queued: true,
            deleteAfterRestart: true,
            sessionId: result.sessionId,
            reason: result.reason,
            activity: result.activity,
            archived: result.archived,
            warnings: result.warnings ?? [],
          });
        }
        return jsonResponse(200, { ok: true, queued: false, ...result });
      } catch (error) {
        if (error instanceof SessionDeleteError) {
          return jsonResponse(error.status, {
            ok: false,
            code: error.code,
            message: error.message,
            ...(error.details ?? {}),
          });
        }
        console.error('[session-delete] delete failed:', error);
        return jsonResponse(500, {
          ok: false,
          code: 'failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });
  ctx.effect(() => () => {
    void Promise.resolve(dispose()).catch(() => {});
  }, 'session-delete: api route');

  // A page load can finish a queued deletion without waiting for a Host
  // restart; the periodic tick covers a Host that stays open while a Session
  // becomes idle. Both are no-ops when the queue is empty.
  const purgeDispose = ctx.connection.fetch.register({
    path: PURGE_ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch() {
      try {
        const result = await purgePending(ctx);
        return jsonResponse(200, { ok: true, ...result });
      } catch (error) {
        return jsonResponse(500, { ok: false, code: 'failed', message: messageOf(error) });
      }
    },
  });
  ctx.effect(() => () => {
    void Promise.resolve(purgeDispose()).catch(() => {});
  }, 'session-delete: purge route');

  ctx.effect(() => {
    const timer = setInterval(() => {
      void purgePending(ctx).catch((error) => {
        console.warn('[session-delete] periodic purge failed:', messageOf(error));
      });
    }, 60_000);
    timer.unref?.();
    return () => clearInterval(timer);
  }, 'session-delete: periodic purge');

  const purgeDelay = Number.isFinite(config.purgeDelayMs)
    ? Math.max(0, config.purgeDelayMs)
    : STARTUP_PURGE_DELAY_MS;
  if (config.purgeOnStart !== false) {
    ctx.effect(() => {
      let disposed = false;
      const timers = new Set();
      const attempt = (retriesLeft) => {
        if (disposed) return;
        void purgePending(ctx).catch((error) => {
          console.warn('[session-delete] startup purge failed:', messageOf(error));
          if (disposed || retriesLeft <= 0) return;
          const timer = setTimeout(() => {
            timers.delete(timer);
            attempt(retriesLeft - 1);
          }, 250);
          timer.unref?.();
          timers.add(timer);
        });
      };
      const first = setTimeout(() => {
        timers.delete(first);
        attempt(4);
      }, purgeDelay);
      // Never keep the Host process alive for a purge retry.
      first.unref?.();
      timers.add(first);
      return () => {
        disposed = true;
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
      };
    }, 'session-delete: startup purge');
  }

  // A live Agent normally lives until Host shutdown, but if some composition
  // does release one, its Session becomes deletable immediately.
  if (typeof ctx.on === 'function') {
    ctx.effect(() => {
      const disposers = [
        ctx.on('agent/disposed', () => {
          void purgePending(ctx).catch(() => {});
        }),
        ctx.on('session/disposed', () => {
          void purgePending(ctx).catch(() => {});
        }),
      ];
      return () => {
        for (const close of disposers) {
          try {
            close?.();
          } catch {
            // A disposed listener is already gone.
          }
        }
      };
    }, 'session-delete: purge retries');
  }
}
