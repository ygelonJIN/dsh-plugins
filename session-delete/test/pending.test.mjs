import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  clearPending,
  enqueuePending,
  pendingFile,
  readPending,
  removePending,
  writePending,
} from '../pending.js';

/** Owned temporary DSH home; cleaned in the finally block below. */
const home = await mkdtemp(path.join(tmpdir(), 'session-delete-pending-'));
const file = pendingFile(home);
const ALPHA = 'session-aaaaaaaa-1111-4111-8111-111111111111';
const BETA = 'session-bbbbbbbb-2222-4222-8222-222222222222';

try {
  // --- missing queue -------------------------------------------------------
  assert.deepEqual(await readPending(file), []);

  // --- insert, dedupe, and update -----------------------------------------
  await enqueuePending(file, ALPHA, { reason: 'in-use' });
  await enqueuePending(file, BETA, { reason: 'active', hidden: false });
  let entries = await readPending(file);
  assert.deepEqual(entries.map((entry) => entry.sessionId), [ALPHA, BETA]);
  assert.equal(entries[0].reason, 'in-use');
  assert.equal(typeof entries[0].requestedAt, 'number');

  const requestedAt = entries[0].requestedAt;
  await enqueuePending(file, ALPHA, { hidden: true });
  entries = await readPending(file);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].hidden, true);
  assert.equal(entries[0].requestedAt, requestedAt);
  assert.equal(entries[0].reason, 'in-use');

  // --- invalid ids are refused --------------------------------------------
  await assert.rejects(() => enqueuePending(file, '../escape'), /refusing unsafe session id/);

  // --- remove one ---------------------------------------------------------
  assert.equal(await removePending(file, ALPHA), true);
  assert.equal(await removePending(file, ALPHA), false);
  assert.deepEqual((await readPending(file)).map((entry) => entry.sessionId), [BETA]);

  // --- malformed entries are dropped, not smuggled through ----------------
  await writePending(file, [
    { sessionId: BETA, reason: 'writer', attempts: 2 },
    { sessionId: '../escape' },
    { sessionId: 42 },
    'not-an-object',
    { reason: 'active' },
  ]);
  entries = await readPending(file);
  assert.deepEqual(entries.map((entry) => entry.sessionId), [BETA]);
  assert.equal(entries[0].attempts, 2);

  // --- empty writes remove the file ---------------------------------------
  await writePending(file, []);
  assert.equal(await readFile(file, 'utf8').then(() => true, () => false), false);

  // --- corruption is quarantined, never silently dropped ------------------
  await enqueuePending(file, BETA, { reason: 'in-use' });
  await writeFile(file, '{not json', 'utf8');
  assert.deepEqual(await readPending(file), []);
  const names = await readdir(path.dirname(file));
  assert.ok(names.some((name) => name.startsWith('pending.json.corrupt-')), 'corrupt file is preserved');
  // The next write starts clean.
  await enqueuePending(file, ALPHA, { reason: 'in-use' });
  assert.deepEqual((await readPending(file)).map((entry) => entry.sessionId), [ALPHA]);

  // --- a version mismatch is quarantined too ------------------------------
  await writeFile(file, JSON.stringify({ version: 99, entries: [] }), 'utf8');
  assert.deepEqual(await readPending(file), []);

  await clearPending(file);
  console.log('session-delete pending tests passed');
} finally {
  await rm(home, { recursive: true, force: true });
}
