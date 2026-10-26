import {
  isColor,
  isMarkId,
  marksFile,
  readMarks,
  setColor,
  writeMarks,
} from './marks.js';

/**
 * Host half of `@local/sidebar-marks`.
 *
 * The browser half paints the sidebar; this half owns the durable state behind
 * it behind the authenticated browser connection:
 *
 * - `GET  /api/sidebar-marks.state` — every color mark;
 * - `POST /api/sidebar-marks.mark` — set or clear one color mark.
 *
 * Marking is presentation only: the Host stores a color key per Session or
 * Workspace id and nothing else — no ordering, no sessions, no archives.
 */

export const name = 'sidebar-marks';

export const inject = ['connection'];

const STATE_ROUTE = '/api/sidebar-marks.state';
const MARK_ROUTE = '/api/sidebar-marks.mark';

class MarksError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'MarksError';
    this.status = status;
    this.code = code;
  }
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    throw new MarksError(400, 'bad-request', 'the body is not valid JSON');
  }
}

async function handleMark(body) {
  const kind = body !== null && typeof body === 'object' ? body.kind : undefined;
  const id = body !== null && typeof body === 'object' ? body.id : undefined;
  const color = body !== null && typeof body === 'object' ? body.color : undefined;
  if (kind !== 'session' && kind !== 'workspace') {
    throw new MarksError(400, 'bad-request', 'kind must be "session" or "workspace"');
  }
  if (!isMarkId(id)) throw new MarksError(400, 'bad-request', 'id is missing or malformed');
  if (color !== null && !isColor(color)) {
    throw new MarksError(400, 'bad-request', 'color is missing or malformed');
  }
  const file = marksFile();
  const next = setColor(await readMarks(file), kind, id, color);
  await writeMarks(file, next);
  return { ok: true, ...next };
}

export function apply(ctx, config = {}) {
  const stateDispose = ctx.connection.fetch.register({
    path: STATE_ROUTE,
    methods: ['GET'],
    async fetch() {
      return jsonResponse(200, { ok: true, ...(await readMarks(marksFile())) });
    },
  });

  const markDispose = ctx.connection.fetch.register({
    path: MARK_ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      try {
        return jsonResponse(200, await handleMark(await readBody(request)));
      } catch (error) {
        if (error instanceof MarksError) {
          return jsonResponse(error.status, { ok: false, code: error.code, message: error.message });
        }
        console.error('[sidebar-marks] mark failed:', error);
        return jsonResponse(500, {
          ok: false,
          code: 'failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  ctx.effect(() => () => {
    for (const dispose of [stateDispose, markDispose]) {
      void Promise.resolve(dispose()).catch(() => {});
    }
  }, 'sidebar-marks: api routes');
}
