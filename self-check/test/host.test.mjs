// 宿主半路由的回归测试：从 <DSH_HOME>/storages/self-check/*.json 读纯宿主
// 插件的结果（workspace-ledger / approval-alert），浏览器读不到文件，只能靠它。
//
// 跑：node test/host.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = await mkdtemp(join(tmpdir(), 'dsh-self-check-'));
// index.js 在 import 时算好目录，所以先设 DSH_HOME 再动态 import。
process.env.DSH_HOME = HOME;
const { apply, inject } = await import('../index.js');

const routes = [];
apply({ connection: { fetch: { register: (route) => { routes.push(route); } } } });
assert.deepEqual(inject, ['connection']);
assert.equal(routes.length, 1);
assert.equal(routes[0].path, '/api/self-check.host');

const dir = join(HOME, 'storages', 'self-check');
await mkdir(dir, { recursive: true });

const get = async () => (await routes[0].fetch()).json();

let body = await get();
assert.deepEqual(body.files, {});
assert.deepEqual(body.missing.sort(), ['@local/approval-alert', '@local/workspace-ledger']);

await writeFile(join(dir, 'workspace-ledger.json'), JSON.stringify({ ok: true, misses: [], at: 7 }));
await writeFile(join(dir, 'approval-alert.json'), JSON.stringify({
  ok: false,
  misses: [{ anchor: 'macOS 通知权限', impact: '审批横幅不弹', hint: '去系统设置打开' }],
  at: 8,
}));

body = await get();
assert.equal(body.files['@local/workspace-ledger'].ok, true);
assert.equal(body.files['@local/approval-alert'].ok, false);
assert.equal(body.files['@local/approval-alert'].misses[0].hint, '去系统设置打开');
assert.equal(body.missing.length, 0);

await writeFile(join(dir, 'approval-alert.json'), '{ bad json');
body = await get();
assert.deepEqual(body.missing, ['@local/approval-alert']);
assert.equal(body.files['@local/workspace-ledger'].ok, true);

await rm(HOME, { recursive: true, force: true });
console.log('host route ok');
