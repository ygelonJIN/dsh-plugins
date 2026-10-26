import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  COLORS,
  marksFile,
  normalizeMarks,
  readMarks,
  setColor,
  writeMarks,
} from '../marks.js';

/**
 * Storage rules of `@local/sidebar-marks`: the marks document is normalized on
 * both sides of the disk boundary, and a corrupt document is kept beside the
 * file instead of silently dropped.
 */

const ROOT = await mkdtemp(path.join(tmpdir(), 'sidebar-marks-'));
const FILE = marksFile(ROOT);

async function fresh() {
  await rm(FILE, { force: true });
  return readMarks(FILE);
}

// --- normalization -----------------------------------------------------------

{
  const state = normalizeMarks({
    version: 1,
    sessions: {
      'session-aaaa': { color: 'red', updatedAt: 5 },
      'session-bad': { color: 'chartreuse' },
      '': { color: 'blue' },
      'session-typed': { color: 'green', updatedAt: 'later' },
    },
    workspaces: {
      ws1: { color: 'purple' },
      'ws\nbad': { color: 'blue' },
    },
  });
  assert.deepEqual(state.sessions, {
    'session-aaaa': { color: 'red', updatedAt: 5 },
    'session-typed': { color: 'green' },
  });
  assert.deepEqual(state.workspaces, { ws1: { color: 'purple' } });
  assert.equal(COLORS.length, 6);
}

// --- persistence -------------------------------------------------------------

{
  const empty = await fresh();
  assert.deepEqual(empty, { sessions: {}, workspaces: {} });

  const next = setColor(empty, 'session', 'session-aaaa-1111', 'blue');
  await writeMarks(FILE, next);
  const roundtrip = await readMarks(FILE);
  assert.equal(roundtrip.sessions['session-aaaa-1111'].color, 'blue');
  assert.equal(typeof roundtrip.sessions['session-aaaa-1111'].updatedAt, 'number');
  assert.deepEqual(roundtrip.workspaces, {});

  // An empty document removes the file instead of leaving one behind.
  await writeMarks(FILE, setColor(await readMarks(FILE), 'session', 'session-aaaa-1111', null));
  await assert.rejects(readFile(FILE), /ENOENT/);

  // A corrupt document is quarantined, never silently discarded.
  await writeFile(FILE, '{not json');
  const afterCorrupt = await readMarks(FILE);
  assert.deepEqual(afterCorrupt, { sessions: {}, workspaces: {} });
  const { readdir } = await import('node:fs/promises');
  const quarantined = (await readdir(path.dirname(FILE))).filter((name) => name.includes('corrupt'));
  assert.equal(quarantined.length, 1, 'the corrupt document is kept beside the file');

  // A version mismatch is unreadable too.
  await writeFile(FILE, JSON.stringify({ version: 99, sessions: { x: { color: 'red' } } }));
  assert.deepEqual(await readMarks(FILE), { sessions: {}, workspaces: {} });
}

// --- setters -----------------------------------------------------------------

{
  const base = normalizeMarks(null);
  const marked = setColor(base, 'workspace', 'ws-1', 'orange');
  assert.equal(marked.workspaces['ws-1'].color, 'orange');
  assert.deepEqual(base.workspaces, {}, 'the setter never mutates its input');
  assert.throws(() => setColor(base, 'group', 'ws-1', 'orange'), /kind/);
  assert.throws(() => setColor(base, 'workspace', '', 'orange'), /id/);
  assert.throws(() => setColor(base, 'workspace', 'ws-1', 'chartreuse'), /color/);
}

await rm(ROOT, { recursive: true, force: true });
console.log('marks.test.mjs ok');
