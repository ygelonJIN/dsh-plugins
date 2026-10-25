import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { apply } from '../index.js';

/**
 * Exercises the real HTTP route handler behind `apply()` with a temporary
 * DSH_HOME and stub Cordis services. The persistence and Workspace contracts
 * are stubbed; path handling, ordering, refusal codes, and file removal are the
 * code under test.
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

/**
 * Build one captured route plus the stub services a scenario needs.
 * @param options - `activity`, `live`, `openError`, `formatStatus`.
 */
function harness(options = {}) {
  const calls = [];
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
  const registry = {
    list: () => [workspace],
    async unarchiveSession(id) {
      calls.push(['unarchive', id]);
    },
    async unpinSession(id) {
      calls.push(['unpin', id]);
    },
  };
  let route = null;
  const ctx = {
    connection: {
      fetch: {
        register(candidate) {
          route = candidate;
          return () => Promise.resolve();
        },
      },
    },
    effect(callback) {
      callback();
    },
    sessionPersistence: persistence,
    sessions: { get: (id) => (options.live === true && id === TARGET ? {} : undefined) },
    agents: { get: () => undefined },
    workspaceRegistry: registry,
    async waterfall() {
      return options.activity ?? [];
    },
  };
  apply(ctx);
  assert.ok(route !== null, 'the plugin registers its route');

  async function post(body) {
    const response = await route.fetch(new Request('http://local/api/session-delete.delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() };
  }
  return { calls, post };
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
  }

  // --- refuses a live Session ---------------------------------------------
  {
    await resetTree();
    const tree = await makeTree();
    const { post } = harness({ live: true });
    const result = await post({ sessionId: TARGET });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'in-use');
    assert.equal(await exists(tree.targetDir), true);
  }

  // --- refuses running work and reports it --------------------------------
  {
    await resetTree();
    const tree = await makeTree();
    const activity = [{ kind: 'turn', items: [{ id: 'turn-1', label: 'Turn 2' }] }];
    const { calls, post } = harness({ activity });
    const result = await post({ sessionId: TARGET });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'active');
    assert.deepEqual(result.body.activity, activity);
    assert.deepEqual(calls, []);
    assert.equal(await exists(tree.targetDir), true);
  }

  // --- refuses another writer ---------------------------------------------
  {
    await resetTree();
    const tree = await makeTree();
    const { calls, post } = harness({ openError: 'SessionAlreadyOwnedError' });
    const result = await post({ sessionId: TARGET });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'in-use');
    assert.deepEqual(calls, []);
    assert.equal(await exists(tree.targetDir), true);
  }

  // --- success: target plus subagent child, registries, cache -------------
  {
    await resetTree();
    const tree = await makeTree();
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
    // Registry cleanup happens before files disappear and covers both Sessions.
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

  console.log('session-delete route tests passed');
} finally {
  process.env.DSH_HOME = PREVIOUS_HOME;
  await rm(ROOT, { recursive: true, force: true });
}
