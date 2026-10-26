import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { apply } from '../index.js';
import { marksFile, readMarks } from '../marks.js';

/**
 * Exercises the real HTTP route handlers behind `apply()` with a temporary
 * DSH_HOME and stub Cordis services. Validation and persistence are the code
 * under test.
 */

const ROOT = await mkdtemp(path.join(tmpdir(), 'sidebar-marks-route-'));
const PREVIOUS_HOME = process.env.DSH_HOME;
process.env.DSH_HOME = ROOT;

const WS_B = 'ws-bbbbbbbb-2222-4222-8222-222222222222';
const SESSION = 'session-aaaaaaaa-1111-4111-8111-111111111111';

function harness() {
  const routes = new Map();
  const ctx = {
    connection: {
      fetch: {
        register(spec) {
          routes.set(spec.path, spec);
          return () => {};
        },
      },
    },
    effect(callback) {
      callback();
    },
  };
  apply(ctx);
  return routes;
}

async function call(routes, path, body) {
  const route = routes.get(path);
  assert.notEqual(route, undefined, `route ${path} is registered`);
  const request = body === undefined ? undefined : { json: async () => body };
  const response = await route.fetch(request);
  return { status: response.status, payload: await response.json() };
}

{
  const routes = harness();

  // State starts empty.
  const initial = await call(routes, '/api/sidebar-marks.state');
  assert.equal(initial.status, 200);
  assert.deepEqual(initial.payload, { ok: true, sessions: {}, workspaces: {} });

  // One Session mark, one Workspace mark, then clearing one of them.
  const marked = await call(routes, '/api/sidebar-marks.mark', { kind: 'session', id: SESSION, color: 'red' });
  assert.equal(marked.status, 200);
  assert.equal(marked.payload.sessions[SESSION].color, 'red');
  await call(routes, '/api/sidebar-marks.mark', { kind: 'workspace', id: WS_B, color: 'blue' });
  const cleared = await call(routes, '/api/sidebar-marks.mark', { kind: 'session', id: SESSION, color: null });
  assert.deepEqual(cleared.payload.sessions, {});
  assert.equal(cleared.payload.workspaces[WS_B].color, 'blue');
  const stored = await readMarks(marksFile());
  assert.deepEqual(stored.sessions, {});
  assert.equal(stored.workspaces[WS_B].color, 'blue');

  // Validation refuses malformed input with 400 and keeps the file untouched.
  for (const body of [
    null,
    { kind: 'group', id: WS_B, color: 'red' },
    { kind: 'session', id: '', color: 'red' },
    { kind: 'session', id: SESSION, color: 'chartreuse' },
  ]) {
    const refused = await call(routes, '/api/sidebar-marks.mark', body);
    assert.equal(refused.status, 400);
    assert.equal(refused.payload.ok, false);
  }
  assert.equal((await readMarks(marksFile())).sessions[SESSION], undefined);
}

{
  // The file is small, private, and never carries titles or paths.
  const text = await readFile(marksFile(), 'utf8');
  assert.equal(text.includes('title'), false);
  assert.equal(text.includes('/Users'), false);
}

if (PREVIOUS_HOME === undefined) delete process.env.DSH_HOME;
else process.env.DSH_HOME = PREVIOUS_HOME;
await rm(ROOT, { recursive: true, force: true });
console.log('route.test.mjs ok');
