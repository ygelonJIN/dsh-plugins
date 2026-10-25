import {
  descendantSessionIds,
  findSessionDirs,
  isSessionId,
  projectionCacheRoot,
  removeProjectionCacheEntries,
  removeSessionDirectories,
  sessionsRoot,
} from './session-storage.js';

/**
 * Host half of `@local/session-delete`.
 *
 * The persistence seam intentionally has no deletion API ("logs accumulate
 * under root until removed externally"). This plugin owns that external
 * operation for one Session at a time, behind the authenticated browser
 * connection:
 *
 * 1. the Session must exist in session persistence;
 * 2. neither it nor any subagent descendant may be live in this process;
 * 3. the `workspace/session-activity` waterfall must report no running work
 *    (turn, subagent, job, or scheduled reminder) — the same admission the
 *    archive path uses, so a reminder can never wake a deleted Session;
 * 4. write ownership is claimed for every current-format target, excluding a
 *    concurrent writer in this or another process;
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

async function deleteSession(ctx, requestedId) {
  const persistence = ctx.sessionPersistence;
  const snapshot = await persistence.stat(requestedId);
  if (snapshot === undefined) {
    throw new SessionDeleteError(404, 'not-found', 'the session does not exist');
  }

  const snapshots = await persistence.list();
  const descendants = descendantSessionIds(snapshots, requestedId);
  const targets = [requestedId, ...descendants];

  for (const sessionId of targets) {
    if (ctx.sessions.get(sessionId) !== undefined) {
      throw new SessionDeleteError(409, 'in-use', `the session ${sessionId} is open in this Host`);
    }
    if (ctx.agents.get(sessionId) !== undefined) {
      throw new SessionDeleteError(409, 'in-use', `the session ${sessionId} has a live Agent`);
    }
  }

  const activity = await readActivity(ctx, requestedId);
  if (activity.length > 0) {
    throw new SessionDeleteError(409, 'active', 'the session still has running work', {
      activity: describeActivity(activity),
    });
  }

  const root = sessionsRoot();
  const onDisk = new Map();
  for (const sessionId of targets) {
    const dirs = await findSessionDirs(root, sessionId);
    if (sessionId === requestedId && dirs.length === 0) {
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
          throw new SessionDeleteError(409, 'in-use', `the session ${sessionId} is owned by a writer`);
        }
        if (error?.name === 'SessionPersistenceNotFoundError') {
          throw new SessionDeleteError(404, 'not-found', `the session ${sessionId} disappeared`);
        }
        throw error;
      }
    }

    const warnings = await detachFromRegistries(ctx.workspaceRegistry, targets);

    // Windows refuses to unlink an open file; the ownership check already
    // happened, so release before removing there.
    if (process.platform === 'win32') await releaseHandles(handles);

    const directories = await removeSessionDirectories(root, targets);
    try {
      await removeProjectionCacheEntries(projectionCacheRoot(), targets);
    } catch (error) {
      warnings.push(`projection cache: ${messageOf(error)}`);
    }

    return { deleted: targets, directories: directories.length, warnings };
  } finally {
    await releaseHandles(handles);
  }
}

export function apply(ctx) {
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
        for (const warning of result.warnings) console.warn('[session-delete]', warning);
        return jsonResponse(200, { ok: true, ...result });
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
}
