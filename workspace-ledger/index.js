import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Read-only ledger for the composer stats bar.
 *
 * `workspace` is the git working tree measured against HEAD (untracked files
 * count as additions), so it survives reloads and Session switches and needs
 * no persistence of its own. `session` sums the per-turn summaries the
 * workspace-changes recorder still holds for one live Session; those numbers
 * are runtime-only, so a disposed Session reports them as missing instead of
 * zero.
 */

export const name = 'workspace-ledger';

export const inject = ['connection', 'sessionQuery', 'subprocess'];

const LEDGER_PATH = '/api/workspace-ledger.summary';

/** Shared self-check record: the Settings → Plugins tab reads these files. */
const SELF_CHECK_DIR = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'storages', 'self-check');

/** Persist this plugin's one-shot self-check result; never throws. */
async function writeSelfCheck(label, misses) {
  await mkdir(SELF_CHECK_DIR, { recursive: true });
  await writeFile(
    join(SELF_CHECK_DIR, label + '.json'),
    JSON.stringify({ ok: misses.length === 0, misses, at: Date.now() }, null, 2),
    { mode: 0o600 },
  );
}

const GIT_TIMEOUT_MS = 15000;
const GIT_STDOUT_BYTES = 8 * 1024 * 1024;
const GIT_STDERR_BYTES = 8 * 1024;
const TERMINATE_GRACE_MS = 1000;
const UNTRACKED_MAX_FILES = 400;
const UNTRACKED_MAX_BYTES = 512 * 1024;

function ledgerJson(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function gitEnv() {
  return {
    GIT_CONFIG_COUNT: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    LC_ALL: 'C',
  };
}

async function runGit(subprocess, executable, args, cwd, signal) {
  const timeout = AbortSignal.timeout(GIT_TIMEOUT_MS);
  const combined = AbortSignal.any([signal, timeout]);
  const handle = subprocess.spawn({
    argv: [executable, ...args],
    cwd,
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes: GIT_STDOUT_BYTES },
      stderr: { maxBytes: GIT_STDERR_BYTES },
    },
    graceMs: TERMINATE_GRACE_MS,
    signal: combined,
    env: gitEnv(),
  });
  const outcome = await handle.done;
  const stdout = handle.collected.stdout?.readFrom(0) ?? { text: '', lossy: false };
  const stderr = handle.collected.stderr?.readFrom(0)?.text ?? '';
  return { exitCode: outcome.exitCode, stdout: stdout.text, stderr, truncated: stdout.lossy };
}

/**
 * Resolve git once. On macOS the Xcode stub at /usr/bin/git opens an installer
 * dialog instead of running, so it counts as absent until developer tools are
 * selected — the same guard workspace-changes applies.
 */
async function resolveGit(subprocess, signal) {
  let executable;
  try {
    executable = await subprocess.resolveExecutable('git', undefined, signal);
  } catch {
    return null;
  }
  if (process.platform !== 'darwin' || executable !== '/usr/bin/git') return executable;
  try {
    const handle = subprocess.spawn({
      argv: ['/usr/bin/xcode-select', '-p'],
      cwd: homedir(),
      stdio: { stdin: 'ignore', stdout: { maxBytes: 4096 }, stderr: { maxBytes: 4096 } },
      graceMs: TERMINATE_GRACE_MS,
      signal,
    });
    const outcome = await handle.done;
    return outcome.exitCode === 0 ? executable : null;
  } catch {
    return null;
  }
}

/** Parse `git diff --numstat` output; a `-` side marks a binary file. */
function parseNumstat(text) {
  let added = 0;
  let deleted = 0;
  let files = 0;
  let binary = 0;
  for (const line of text.split('\n')) {
    if (line.length === 0) continue;
    const first = line.indexOf('\t');
    if (first < 0) continue;
    const second = line.indexOf('\t', first + 1);
    if (second < 0) continue;
    const rawAdded = line.slice(0, first);
    const rawDeleted = line.slice(first + 1, second);
    files += 1;
    if (rawAdded === '-' || rawDeleted === '-') {
      binary += 1;
      continue;
    }
    const add = Number(rawAdded);
    const del = Number(rawDeleted);
    if (Number.isFinite(add)) added += add;
    if (Number.isFinite(del)) deleted += del;
  }
  return { added, deleted, files, binary };
}

/** Count a new file's lines; a binary or oversized file contributes no lines. */
async function countLines(absolutePath) {
  try {
    const info = await stat(absolutePath);
    if (!info.isFile()) return { binary: true };
    if (info.size > UNTRACKED_MAX_BYTES) return { binary: true };
    const bytes = await readFile(absolutePath);
    if (bytes.includes(0)) return { binary: true };
    let lines = 0;
    for (let index = 0; index < bytes.length; index += 1) if (bytes[index] === 10) lines += 1;
    if (bytes.length > 0 && bytes[bytes.length - 1] !== 10) lines += 1;
    return { binary: false, lines };
  } catch {
    return { binary: false, lines: 0 };
  }
}

async function workspaceLedger(subprocess, cwd, signal) {
  const empty = {
    git: false, root: null, baseline: null, added: 0, deleted: 0,
    files: 0, binary: 0, untracked: 0, untrackedFiles: 0, truncated: false,
  };
  const executable = await resolveGit(subprocess, signal);
  if (executable === null) return empty;

  const top = await runGit(subprocess, executable, ['rev-parse', '--show-toplevel'], cwd, signal);
  if (top.exitCode !== 0) return empty;
  const root = top.stdout.trim();
  if (root.length === 0) return empty;

  const diff = await runGit(subprocess, executable, ['diff', '--numstat', 'HEAD', '--'], root, signal);
  const tracked = diff.exitCode === 0
    ? parseNumstat(diff.stdout)
    : { added: 0, deleted: 0, files: 0, binary: 0 };
  const baseline = diff.exitCode === 0 ? 'HEAD' : null;

  let untrackedFiles = 0;
  let added = tracked.added;
  let truncated = false;
  const others = await runGit(subprocess, executable, ['ls-files', '--others', '--exclude-standard', '-z'], root, signal);
  if (others.exitCode === 0) {
    const paths = others.stdout.split('\0').filter((entry) => entry.length > 0);
    untrackedFiles = paths.length;
    for (const path of paths.slice(0, UNTRACKED_MAX_FILES)) {
      const counts = await countLines(join(root, path));
      if (counts.binary === true) continue;
      added += counts.lines ?? 0;
    }
    truncated = paths.length > UNTRACKED_MAX_FILES;
  }

  return {
    git: true,
    root,
    baseline,
    added,
    deleted: tracked.deleted,
    files: tracked.files + untrackedFiles,
    binary: tracked.binary,
    untracked: added - tracked.added,
    untrackedFiles,
    truncated,
  };
}

/** Whether one recorded summary still has the numeric shape this route sums. */
function isSummary(value) {
  return typeof value === 'object'
    && value !== null
    && Number.isFinite(value.added)
    && Number.isFinite(value.deleted)
    && Number.isFinite(value.total);
}

async function sessionLedger(scope, sessionId) {
  // Optional: the workspace half must keep working when the recorder service is
  // absent or renamed, so only this half depends on it.
  const changes = scope.get('workspaceChanges');
  if (changes === undefined) return null;
  let documents = [];
  try {
    // The raw event listing is the complete log; the semantic filter index does
    // not carry `workspace/changes`, so select the announcements here.
    documents = (await scope.sessionQuery.listEvents(sessionId))
      .filter((record) => record.type === 'workspace/changes');
  } catch {
    return null;
  }
  let added = 0;
  let deleted = 0;
  let files = 0;
  let missing = 0;
  const entries = [];
  for (const document of documents) {
    const summary = changes.summary(sessionId, document.seq);
    if (!isSummary(summary)) {
      missing += 1;
      continue;
    }
    added += summary.added;
    deleted += summary.deleted;
    files += summary.total;
    entries.push({
      seq: document.seq,
      turn: summary.turn,
      added: summary.added,
      deleted: summary.deleted,
      files: summary.total,
    });
  }
  return { turns: documents.length, added, deleted, files, missing, entries };
}

async function sessionCwd(scope, sessionId, signal) {
  try {
    const observation = await scope.sessionQuery.readTitleSnapshot(sessionId, signal);
    return observation?.session?.cwd ?? null;
  } catch {
    return null;
  }
}

async function ledgerPayload(scope, request) {
  const sessionId = new URL(request.url).searchParams.get('sessionId');
  if (sessionId === null || sessionId.length === 0) {
    return ledgerJson({ error: 'missing sessionId' }, 400);
  }
  const cwd = await sessionCwd(scope, sessionId, request.signal);
  const [workspace, session] = await Promise.all([
    cwd === null ? Promise.resolve(null) : workspaceLedger(scope.subprocess, cwd, request.signal).catch(() => null),
    sessionLedger(scope, sessionId).catch(() => null),
  ]);
  return ledgerJson({ cwd, workspace, session });
}

export function apply(ctx) {
  // One-shot self-check: a renamed Service leaves the summary route dead with
  // no visible error, so report it once at activation (console + the shared
  // <DSH_HOME>/storages/self-check file the Settings panel reads).
  const misses = [];
  for (const service of ['connection', 'sessionQuery', 'subprocess']) {
    const value = typeof ctx.get === 'function' ? ctx.get(service) : undefined;
    if (value === undefined) {
      misses.push({
        anchor: 'Service ' + service,
        impact: '/api/workspace-ledger.summary 不可用',
      });
    }
  }
  void writeSelfCheck('workspace-ledger', misses).catch(() => {});
  for (const miss of misses) {
    console.warn('[workspace-ledger] 自检：' + miss.anchor + ' 不存在 → ' + miss.impact);
  }
  ctx.connection.fetch.register({
    path: LEDGER_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request) => ledgerPayload(ctx, request),
  });
}
