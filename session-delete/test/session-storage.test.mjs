import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  descendantSessionIds,
  findSessionDirs,
  isSessionId,
  removeProjectionCacheEntries,
  removeSessionDirectories,
} from '../session-storage.js';

/** Owned temporary tree; cleaned in the finally block below. */
const root = await mkdtemp(path.join(tmpdir(), 'session-delete-test-'));

async function exists(target) {
  return (await stat(target).catch(() => undefined)) !== undefined;
}

try {
  // --- id validation -------------------------------------------------------
  assert.equal(isSessionId('session-0e9aa5ed-8dc7-48b4-b62d-1b26d6f693f3'), true);
  assert.equal(isSessionId('session-abc'), true);
  // 0.2.2 issues bare UUIDs for Sessions created after the upgrade.
  assert.equal(isSessionId('35c360a0-16ba-4dcc-b152-6766f9e30bf3'), true);
  assert.equal(isSessionId('35C360A0-16BA-4DCC-B152-6766F9E30BF3'), true);
  assert.equal(isSessionId('../escape'), false);
  assert.equal(isSessionId('session-../escape'), false);
  assert.equal(isSessionId('../35c360a0-16ba-4dcc-b152-6766f9e30bf3'), false);
  assert.equal(isSessionId('35c360a0-16ba-4dcc-b152-6766f9e30bf3/../x'), false);
  assert.equal(isSessionId('35c360a0-16ba-4dcc-b152'), false);
  assert.equal(isSessionId('session-'), false);
  assert.equal(isSessionId(42), false);

  // --- fixture -------------------------------------------------------------
  const sessions = path.join(root, 'sessions');
  const cache = path.join(root, 'cache');
  // A child spawned after the 0.2.2 upgrade: bare UUID, no `session-` prefix.
  const BARE = '35c360a0-16ba-4dcc-b152-6766f9e30bf3';
  const alphaOne = path.join(sessions, '--proj-a--', 'session-alpha');
  const alphaTwo = path.join(sessions, '--proj-b--', 'session-alpha');
  const beta = path.join(sessions, '--proj-a--', 'session-beta');
  const bareChild = path.join(sessions, '--proj-a--', BARE);
  for (const dir of [alphaOne, alphaTwo, beta, bareChild]) {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'session.v4.jsonl.zstd'), 'log');
  }
  await mkdir(cache, { recursive: true });
  await writeFile(path.join(cache, 'session-alpha.json'), '{}');
  await writeFile(path.join(cache, 'session-beta.json'), '{}');
  await writeFile(path.join(cache, `${BARE}.json`), '{}');

  // A directory symlink must never be followed or removed.
  const outside = path.join(root, 'outside');
  await mkdir(outside, { recursive: true });
  await writeFile(path.join(outside, 'keep.txt'), 'keep');
  const linkProject = path.join(sessions, '--proj-c--');
  await mkdir(linkProject, { recursive: true });
  await symlink(outside, path.join(linkProject, 'session-linked'));

  // --- discovery -----------------------------------------------------------
  assert.deepEqual((await findSessionDirs(sessions, 'session-alpha')).sort(), [alphaOne, alphaTwo].sort());
  assert.deepEqual(await findSessionDirs(sessions, 'session-missing'), []);
  assert.deepEqual(await findSessionDirs(path.join(root, 'nope'), 'session-alpha'), []);
  assert.deepEqual(await findSessionDirs(sessions, 'session-linked'), []);

  // --- removal -------------------------------------------------------------
  const removed = await removeSessionDirectories(sessions, ['session-alpha']);
  assert.equal(removed.length, 2);
  assert.equal(await exists(alphaOne), false);
  assert.equal(await exists(alphaTwo), false);
  assert.equal(await exists(beta), true);
  assert.equal(await exists(path.join(outside, 'keep.txt')), true);
  assert.equal(await exists(path.join(linkProject, 'session-linked')), true);

  // A second pass over an absent Session is a no-op.
  assert.deepEqual(await removeSessionDirectories(sessions, ['session-alpha']), []);

  // --- bare UUID Sessions (0.2.2 and later) --------------------------------
  assert.deepEqual(await findSessionDirs(sessions, BARE), [bareChild]);
  assert.deepEqual(await removeSessionDirectories(sessions, [BARE]), [bareChild]);
  assert.equal(await exists(bareChild), false);

  // --- projection cache ----------------------------------------------------
  const cached = await removeProjectionCacheEntries(cache, ['session-alpha', BARE, 'session-gone']);
  assert.deepEqual(cached.sort(), [path.join(cache, `${BARE}.json`), path.join(cache, 'session-alpha.json')].sort());
  assert.equal(await exists(path.join(cache, 'session-beta.json')), true);
  assert.deepEqual(await readdir(cache), ['session-beta.json']);

  // --- subagent descendants ------------------------------------------------
  const snapshots = [
    { header: { id: 'session-root', origin: undefined } },
    { header: { id: 'session-child', origin: 'subagent', parentSession: 'session-root' } },
    { header: { id: 'session-grandchild', origin: 'subagent', parentSession: 'session-child' } },
    { header: { id: 'session-fork', parentSession: 'session-root' } },
    { header: { id: 'session-unrelated', parentSession: 'session-elsewhere' } },
  ];
  assert.deepEqual(
    descendantSessionIds(snapshots, 'session-root').sort(),
    ['session-child', 'session-grandchild'],
  );
  assert.deepEqual(descendantSessionIds(snapshots, 'session-unrelated'), []);

  console.log('session-delete storage tests passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
