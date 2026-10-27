import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { apply, purgePending } from '../index.js';
import { enqueuePending, pendingFile } from '../pending.js';

/**
 * Exercises the real HTTP route handler behind `apply()` and the pending-queue
 * purge with a temporary DSH_HOME and stub Cordis services. The persistence and
 * Workspace contracts are stubbed; path handling, ordering, refusal codes,
 * queueing, and file removal are the code under test.
 */

const ROOT = await mkdtemp(path.join(tmpdir(), 'session-delete-route-'));
const PREVIOUS_HOME = process.env.DSH_HOME;
process.env.DSH_HOME = ROOT;

const TARGET = 'session-aaaaaaaa-1111-4111-8111-111111111111';
const CHILD = 'session-bbbbbbbb-2222-4222-8222-222222222222';

function snapshot(id, extra = {}) {
  return {
    header: { version: 4, id, createdAt: 1, isSeeded: false, ...extra },
    formatStatus: 'current',
    revision: 'rev-1',
  };
}

async function makeTree() {
  const sessions = path.join(ROOT, 'sessions');
  const targetDir = path.join(sessions, '--proj--', TARGET);
  const childDir = path.join(sessions, '--proj--', CHILD);
  const cacheDir = path.join(ROOT, 'storages', 'session_projcache', 'sessions');
  for (const dir of [targetDir, childDir, cacheDir]) await mkdir(dir, { recursive: true });
  await writeFile(path.join(targetDir, 'session.v4.jsonl.zstd'), 'target');
  await writeFile(path.join(childDir, 'session.v4.jsonl.zstd'), 'child');
  await writeFile(path.join(cacheDir, `${TARGET}.json`), '{}');
  await writeFile(path.join(cacheDir, `${CHILD}.json`), '{}');
  return { targetDir, childDir, cacheDir };
}

async function exists(target) {
  return (await stat(target).catch(() => undefined)) !== undefined;
}

async function queueEntries() {
  let text;
  try {
    text = await readFile(pendingFile(), 'utf8');
  } catch {
    return [];
  }
  return JSON.parse(text).entries;
}

/**
 * Build one captured route plus the stub services a scenario needs.
 * @param options - `live`, `activity`, `activityClearsOnStop`, `openError`,
 *   `formatStatus`, `archived`.
 */
function harness(options = {}) {
  const calls = [];
  const agentMap = new Map();
  if (options.live === true) agentMap.set(TARGET, { status: 'running', inbox: { nextTurn: [], nextStep: [] } });
  if (options.idleAgent === true) {
    agentMap.set(TARGET, {
      status: 'idle',
      inbox: { nextTurn: [], nextStep: [] },
      scope: { rawDispose: async () => { agentMap.delete(TARGET); } },
    });
  }
  if (options.idleAgent === 'no-dispose') {
    agentMap.set(TARGET, { status: 'idle', inbox: { nextTurn: [], nextStep: [] } });
  }
  if (options.idleAgent === 'throws') {
    agentMap.set(TARGET, {
      status: 'idle',
      inbox: { nextTurn: [], nextStep: [] },
      scope: { rawDispose: async () => { throw new Error('boom'); } },
    });
  }
  const base = snapshot(TARGET, options.header ?? {});
  if (options.formatStatus !== undefined) base.formatStatus = options.formatStatus;
  const child = snapshot(CHILD, { origin: 'subagent', parentSession: TARGET });
  if (options.formatStatus !== undefined) child.formatStatus = options.formatStatus;
  const snapshots = new Map([[TARGET, base], [CHILD, child]]);
  const persistence = {
    async stat(id) {
      return snapshots.get(id);
    },
    async list() {
      return [...snapshots.values()];
    },
    async open(id) {
      if (options.openError !== undefined) {
        const error = new Error('writer held');
        error.name = options.openError;
        throw error;
      }
      calls.push(['open', id]);
      return {
        async close() {
          calls.push(['close', id]);
        },
      };
    },
  };
  const workspace = {
    id: 'workspace-1',
    sessionIds: [TARGET, CHILD, 'session-unrelated'],
    async detachSession(id) {
      calls.push(['detach', id]);
    },
  };
  const archived = new Set(options.archived ?? []);
  const registry = {
    list: () => [workspace],
    get archivedSessionIds() {
      return [...archived];
    },
    async archiveSession(id, archiveOptions) {
      calls.push(['archive', id, archiveOptions]);
      archived.add(id);
    },
    async unarchiveSession(id) {
      calls.push(['unarchive', id]);
      archived.delete(id);
    },
    async unpinSession(id) {
      calls.push(['unpin', id]);
    },
  };
  let route = null;
  let stopped = false;
  const ctx = {
    connection: {
      fetch: {
        register(candidate) {
          if (candidate.path === '/api/session-delete.delete') route = candidate;
          return () => Promise.resolve();
        },
      },
    },
    effect(callback) {
      callback();
    },
    on() {
      return () => {};
    },
    sessionPersistence: persistence,
    sessions: { get: (id) => ((options.live === true || options.sessionsOnly === true) && id === TARGET ? {} : undefined) },
    agents: { get: (id) => agentMap.get(id) },
    workspaceRegistry: registry,
    async parallel(name, payload) {
      calls.push(['stop', payload.sessionId]);
      stopped = true;
    },
    async waterfall() {
      const activity = options.activity ?? [];
      if (stopped && options.activityClearsOnStop !== false) return [];
      return activity;
    },
  };
  apply(ctx, { purgeOnStart: false });
  assert.ok(route !== null, 'the plugin registers its route');

  async function post(body) {
    const response = await route.fetch(new Request('http://local/api/session-delete.delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() };
  }
  return { calls, post, ctx, archived };
}

async function resetTree() {
  for (const entry of await readdir(ROOT)) {
    await rm(path.join(ROOT, entry), { recursive: true, force: true });
  }
}

try {
  // --- rejects a malformed or missing identity -----------------------------
  {
    await resetTree();
    const tree = await makeTree();
    const { calls, post } = harness();
    assert.deepEqual(await post({ sessionId: '../escape' }), {
      status: 400,
      body: { ok: false, code: 'bad-request', message: 'sessionId is missing or malformed' },
    });
    assert.deepEqual(calls, []);
    assert.equal(await exists(tree.targetDir), true);
  }

  // --- unknown Session, then unknown files --------------------------------
  {
    await resetTree();
    const { post } = harness();
    const missing = await post({ sessionId: 'session-cccccccc-3333-4333-8333-333333333333' });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'not-found');
  }
  {
    await resetTree();
    // Session exists in persistence but has no directory on disk.
    const { post } = harness();
    const result = await post({ sessionId: TARGET });
    assert.equal(result.status, 404);
    assert.equal(result.body.code, 'not-found');
    assert.deepEqual(await queueEntries(), []);
  }

  // --- live Session: archived now and queued for the next start -----------
  {
    await resetTree();
    const tree = await makeTree();
    const { calls, post } = harness({ live: true });
    const result = await post({ sessionId: TARGET });
    assert.equal(result.status, 202);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.queued, true);
    assert.equal(result.body.deleteAfterRestart, true);
    assert.equal(result.body.reason, 'agent: running');
    assert.deepEqual(calls.filter(([verb]) => verb === 'stop'), [['stop', TARGET]]);
    assert.deepEqual(calls.filter(([verb]) => verb === 'archive'), [['archive', TARGET, { stopActivity: true }]]);
    assert.equal(await exists(tree.targetDir), true);
    const entries = await queueEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].sessionId, TARGET);
    assert.equal(entries[0].reason, 'agent: running');
    assert.equal(entries[0].hidden, true);
  }

  // --- an idle Agent with no release seam: queued with the exact reason ----
  {
    await resetTree();
    const tree = await makeTree();
    const { post } = harness({ idleAgent: 'no-dispose' });
    const result = await post({ sessionId: TARGET });
    assert.equal(result.status, 202);
    assert.equal(result.body.reason, 'agent: no-dispose');
    assert.equal(await exists(tree.targetDir), true);
    assert.equal((await queueEntries())[0].reason, 'agent: no-dispose');
  }

  // --- a release that throws and keeps the Agent: queued with its message --
  {
    await resetTree();
    const tree = await makeTree();
    const { post } = harness({ idleAgent: 'throws' });
    const result = await post({ sessionId: TARGET });
    assert.equal(result.status, 202);
    assert.equal(result.body.reason, 'agent: dispose-threw: boom');
    assert.equal(await exists(tree.targetDir), true);
  }

  // --- loaded for viewing only: deleted immediately ------------------------
  {
    await resetTree();
    const tree = await makeTree();
    const { calls, post } = harness({ sessionsOnly: true });
    const result = await post({ sessionId: TARGET });
    assert.equal(result.status, 200);
    assert.equal(result.body.queued, false);
    assert.equal(await exists(tree.targetDir), false);
    assert.deepEqual(await queueEntries(), []);
    assert.deepEqual(calls.filter(([verb]) => verb === 'archive'), []);
  }

  // --- an idle live Agent is released and the Session deleted now ----------
  {
    await resetTree();
    const tree = await makeTree();
    const { calls, post } = harness({ idleAgent: true });
    const result = await post({ sessionId: TARGET });
    assert.equal(result.status, 200);
    assert.equal(result.body.queued, false);
    assert.equal(await exists(tree.targetDir), false);
    assert.deepEqual(await queueEntries(), []);
    assert.deepEqual(calls.filter(([verb]) => verb === 'archive'), []);
  }

  // --- reminders: stopped, then deleted immediately -----------------------
  {
    await resetTree();
    const tree = await makeTree();
    const activity = [{ kind: 'schedule', items: [{ id: 'schedule-1', label: 'Daily review' }] }];
    const { calls, post } = harness({ activity, activityClearsOnStop: true });
    const result = await post({ sessionId: TARGET });
    assert.equal(result.status, 200);
    assert.equal(result.body.queued, false);
    assert.deepEqual(result.body.deleted, [TARGET, CHILD]);
    assert.deepEqual(calls.filter(([verb]) => verb === 'stop'), [['stop', TARGET]]);
    assert.equal(await exists(tree.targetDir), false);
    assert.deepEqual(await queueEntries(), []);
  }

  // --- another writer: queued instead of refused --------------------------
  {
    await resetTree();
    const tree = await makeTree();
    const { calls, post } = harness({ openError: 'SessionAlreadyOwnedError' });
    const result = await post({ sessionId: TARGET });
    assert.equal(result.status, 202);
    assert.equal(result.body.reason, 'writer');
    assert.equal(await exists(tree.targetDir), true);
    assert.deepEqual(calls.filter(([verb]) => verb === 'archive').map(([, id]) => id), [TARGET]);
    assert.equal((await queueEntries())[0].reason, 'writer');
  }

  // --- success: target plus subagent child, registries, cache -------------
  {
    await resetTree();
    const tree = await makeTree();
    const undoDir = path.join(ROOT, 'undo', 'sessions', TARGET);
    await mkdir(undoDir, { recursive: true });
    await writeFile(path.join(undoDir, 'state.json'), '{}');
    const { calls, post } = harness();
    const result = await post({ sessionId: TARGET });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.deleted, [TARGET, CHILD]);
    assert.equal(result.body.ok, true);
    assert.deepEqual(result.body.warnings, []);
    assert.equal(result.body.directories, 2);
    assert.equal(await exists(tree.targetDir), false);
    assert.equal(await exists(tree.childDir), false);
    assert.deepEqual(await readdir(tree.cacheDir), []);
    assert.equal(await exists(undoDir), false);
    assert.deepEqual(calls.filter(([verb]) => verb === 'detach'), [
      ['detach', TARGET],
      ['detach', CHILD],
    ]);
    assert.deepEqual(calls.filter(([verb]) => verb === 'unarchive'), [
      ['unarchive', TARGET],
      ['unarchive', CHILD],
    ]);
    assert.deepEqual(calls.filter(([verb]) => verb === 'unpin'), [
      ['unpin', TARGET],
      ['unpin', CHILD],
    ]);
    assert.deepEqual(calls.filter(([verb]) => verb === 'close'), [
      ['close', TARGET],
      ['close', CHILD],
    ]);
  }

  // --- a historical-format Session skips the write claim but is removed ---
  {
    await resetTree();
    const tree = await makeTree();
    const { calls, post } = harness({ formatStatus: 'migration-required' });
    const result = await post({ sessionId: TARGET });
    assert.equal(result.status, 200);
    assert.deepEqual(calls.filter(([verb]) => verb === 'open'), []);
    assert.equal(await exists(tree.targetDir), false);
  }

  // --- purge: archived queued Session is removed --------------------------
  {
    await resetTree();
    const tree = await makeTree();
    await enqueuePending(pendingFile(), TARGET, { reason: 'in-use', hidden: true });
    const { calls, ctx } = harness({ archived: [TARGET] });
    const result = await purgePending(ctx);
    assert.deepEqual(result.deleted, [TARGET]);
    assert.equal(await exists(tree.targetDir), false);
    assert.equal(await exists(tree.childDir), false);
    assert.deepEqual(await queueEntries(), []);
    assert.ok(calls.some(([verb]) => verb === 'detach'));
  }

  // --- purge: an unarchived queued Session counts as cancelled ------------
  {
    await resetTree();
    const tree = await makeTree();
    await enqueuePending(pendingFile(), TARGET, { reason: 'in-use', hidden: true });
    const { ctx } = harness({ archived: [] });
    const result = await purgePending(ctx);
    assert.deepEqual(result.deleted, []);
    assert.deepEqual(result.kept, []);
    assert.equal(await exists(tree.targetDir), true);
    assert.deepEqual(await queueEntries(), []);
  }

  // --- purge: a still-live queued Session stays queued --------------------
  {
    await resetTree();
    const tree = await makeTree();
    await enqueuePending(pendingFile(), TARGET, { reason: 'in-use', hidden: true });
    const { ctx } = harness({ live: true, archived: [TARGET] });
    const result = await purgePending(ctx);
    assert.deepEqual(result.deleted, []);
    assert.deepEqual(result.kept, [TARGET]);
    assert.equal(await exists(tree.targetDir), true);
    const entries = await queueEntries();
    assert.equal(entries[0].attempts, 1);
    assert.equal(entries[0].lastError, 'agent: running');
  }

  console.log('session-delete route tests passed');
} finally {
  process.env.DSH_HOME = PREVIOUS_HOME;
  await rm(ROOT, { recursive: true, force: true });
}
