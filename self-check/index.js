/**
 * Host half of @local/self-check.
 *
 * The panel itself ships in ./client. This half exists for one reason: the
 * browser cannot read `<DSH_HOME>/storages/self-check/*.json`, and the two
 * host-only plugins (workspace-ledger, approval-alert) have no client half to
 * write `localStorage['dsh.self-check']`. The route below hands those records
 * to the panel, so a denied notification permission or a renamed Service is
 * visible in Settings instead of only in a JSON file.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const inject = ['connection'];

const DIR = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'storages', 'self-check');

/** display name in the panel → file stem written by the host half. */
const HOST = [
  ['@local/workspace-ledger', 'workspace-ledger'],
  ['@local/approval-alert', 'approval-alert'],
];

/** Normalize one on-disk record; unknown shape counts as "no result". */
function record(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const misses = Array.isArray(value.misses) ? value.misses : [];
  return {
    ok: value.ok === true,
    misses: misses.map((miss) => ({
      anchor: typeof miss?.anchor === 'string' ? miss.anchor : '',
      impact: typeof miss?.impact === 'string' ? miss.impact : '',
      ...(typeof miss?.hint === 'string' ? { hint: miss.hint } : {}),
    })),
    at: typeof value.at === 'number' ? value.at : 0,
  };
}

export function apply(ctx) {
  ctx.connection.fetch.register({
    path: '/api/self-check.host',
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async () => {
      const files = {};
      const missing = [];
      for (const [name, stem] of HOST) {
        try {
          const value = record(JSON.parse(await readFile(join(DIR, stem + '.json'), 'utf8')));
          if (value === null) throw new Error('unexpected self-check shape');
          files[name] = value;
        } catch {
          missing.push(name);
        }
      }
      return Response.json({ dir: DIR, files, missing }, {
        status: 200,
        headers: { 'cache-control': 'no-store' },
      });
    },
  });
}
