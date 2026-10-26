/**
 * Host half of `@local/session-undo`.
 *
 * Conversation-only undo: preflight reads one Session observation, the client
 * forks at the turn boundary, and the old Session is archived for deletion.
 * Files are never read, snapshotted, or restored; no backup is kept.
 */

import { rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { preflight } from './preflight.js';

export const name = 'session-undo';

export const inject = ['connection', 'sessionQuery'];

function dshHome() {
  const configured = process.env.DSH_HOME;
  if (typeof configured === 'string' && configured.trim() !== '') return path.resolve(configured.trim());
  return path.join(homedir(), '.dsh');
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function apply(ctx) {
  // Drop snapshots left by earlier file-restore builds.
  void rm(path.join(dshHome(), 'undo'), { recursive: true, force: true }).catch(() => {});

  const dispose = ctx.connection.fetch.register({
    path: '/api/session-undo.preflight',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const body = await request.json().catch(() => null);
      const sessionId = body?.sessionId;
      const turn = body?.turn;
      if (typeof sessionId !== 'string' || sessionId === '') {
        return jsonResponse(400, { ok: false, code: 'bad-request', message: 'sessionId is missing' });
      }
      if (!Number.isSafeInteger(turn) || turn < 1) {
        return jsonResponse(400, { ok: false, code: 'bad-request', message: 'turn is missing or malformed' });
      }
      try {
        let timer;
        const work = preflight(ctx, sessionId, turn);
        work.catch(() => {});
        const result = await Promise.race([
          work,
          new Promise((resolve) => { timer = setTimeout(() => resolve(null), 15_000); }),
        ]);
        clearTimeout(timer);
        if (result === null) return jsonResponse(504, { ok: false, code: 'timeout', message: '读取对话超时，请稍后重试。' });
        return jsonResponse(200, result);
      } catch (error) {
        return jsonResponse(500, { ok: false, code: 'failed', message: error instanceof Error ? error.message : String(error) });
      }
    },
  });
  ctx.effect(() => () => {
    void Promise.resolve(dispose()).catch(() => {});
  }, 'session-undo: preflight route');
}
