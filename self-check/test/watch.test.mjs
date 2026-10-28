// 启动对账的回归测试：用 node 模拟浏览器，跑 self-check/client.js 里的
// inspect() / showAlert()，验证「什么时候该弹、什么时候不该弹」。
//
// 跑：node test/watch.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client.js');

// 插件名单从源码里读，不在这里再维护一份 —— 否则加插件时两处都要改，忘一处就红。
const SOURCE = fs.readFileSync(SRC, 'utf8');
const EXPECTED_BLOCK = SOURCE.match(/const EXPECTED = \[([\s\S]*?)\];/);
if (EXPECTED_BLOCK === null) throw new Error('没找到 EXPECTED 名单');
const ALL = [...EXPECTED_BLOCK[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (ALL.length === 0) throw new Error('EXPECTED 名单是空的');

/** 造一套最小浏览器环境；ids 就是宿主会注入的 __DSH_BOOT__.entries。 */
function makeEnv({ version, ids, storage }) {
  const created = [];
  const el = (tag) => {
    const node = {
      tag,
      children: [],
      attrs: {},
      _text: '',
      setAttribute(key, value) { this.attrs[key] = value; },
      appendChild(child) { this.children.push(child); return child; },
      append(...children) { this.children.push(...children); },
      remove() { this.removed = true; },
      listeners: {},
      addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
      click() { for (const fn of this.listeners.click ?? []) fn({}); },
      set className(value) { this.attrs.class = value; },
      get className() { return this.attrs.class; },
      set textContent(value) { this._text = value; },
      get textContent() { return this._text; },
      set type(value) { this.attrs.type = value; },
    };
    created.push(node);
    return node;
  };
  const body = el('body');
  const head = el('head');
  const store = new Map(Object.entries(storage ?? {}));
  let registration = null;
  return {
    created,
    registration: () => registration,
    window: {
      __ModuleLoader__: { load: (reg) => { registration = reg; } },
      __DSH_BOOT__: { release: { version, commit: 'test' }, entries: ids.map((id) => ({ id })) },
    },
    document: {
      head,
      body,
      createElement: el,
      createTextNode: (text) => ({ tag: '#text', _text: text, children: [] }),
      querySelectorAll: () => [],
    },
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    },
    store,
  };
}

/** 载入 client.js，返回它的插件对象（inject/apply）并跑一次 apply。 */
function activate(env) {
  const sandbox = {
    window: env.window,
    document: env.document,
    localStorage: env.localStorage,
    requestAnimationFrame: (fn) => { fn(); return 1; },
    cancelAnimationFrame: () => {},
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: 'self-check/client.js' });
  const registration = env.registration();
  if (registration === null) throw new Error('client.js 没有调用 __ModuleLoader__.load');

  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    Fragment: 'Fragment',
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  };
  const mod = registration.factory((name) => {
    if (name === 'react') return React;
    throw new Error('意外的 require: ' + name);
  });
  mod.apply({
    effect: (fn) => { fn(); return () => {}; },
    locale: { bind: () => (key) => key, register: () => () => {} },
    slots: { inject: (_name, cb) => cb(), register: () => () => {} },
  });
  return mod;
}

const alertCount = (env) => env.created.filter((node) => node.attrs.class === 'sm-alert').length;
const alertText = (env) => JSON.stringify(
  env.created.filter((node) => node.attrs.class === 'sm-alert').map((node) => node.children),
);

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (ok ? '' : '  ' + detail));
};

const watchOf = (env) => {
  const raw = env.store.get('dsh.self-check.watch');
  return raw === undefined ? null : JSON.parse(raw);
};
const seeded = (overrides = {}) => JSON.stringify({
  version: '0.2.1-rc.3', plugins: ALL, missing: [], at: 1, ...overrides,
});

// 1. 第一次装上：只记录，不打扰
{
  const env = makeEnv({ version: '0.2.1-rc.3', ids: ALL });
  activate(env);
  check('首次运行不弹提示', alertCount(env) === 0);
  const watch = watchOf(env);
  check('首次运行记下版本与插件数', watch?.version === '0.2.1-rc.3' && watch.plugins.length === ALL.length,
    JSON.stringify(watch));
}

// 2. 版本没变、插件齐全：安静
{
  const env = makeEnv({ version: '0.2.1-rc.3', ids: ALL,
    storage: { 'dsh.self-check.watch': seeded() } });
  activate(env);
  check('无变化不弹', alertCount(env) === 0);
}

// 3. 升级了：弹一条，带版本号
{
  const env = makeEnv({ version: '0.2.2', ids: ALL,
    storage: { 'dsh.self-check.watch': seeded() } });
  activate(env);
  check('升级后弹一条', alertCount(env) === 1, 'got ' + alertCount(env));
  check('提示里带版本变化', /alert\.upgraded|已升级/.test(alertText(env)), alertText(env).slice(0, 160));
}

// 4. 少了一个插件：弹一条并点名
{
  const fewer = ALL.filter((name) => name !== '@local/skin');
  const env = makeEnv({ version: '0.2.1-rc.3', ids: fewer,
    storage: { 'dsh.self-check.watch': seeded() } });
  activate(env);
  check('少插件时弹一条', alertCount(env) === 1, 'got ' + alertCount(env));
  check('提示里点名缺的包', /skin/.test(alertText(env)), alertText(env).slice(0, 200));
}

// 5. 提示没被确认（用户直接关窗口）：下次启动还弹
{
  const fewer = ALL.filter((name) => name !== '@local/skin');
  const env = makeEnv({ version: '0.2.1-rc.3', ids: fewer,
    storage: { 'dsh.self-check.watch': seeded() } });
  activate(env);
  check('未确认时下次启动还会弹', alertCount(env) === 1, 'got ' + alertCount(env));
  const watch = watchOf(env);
  check('未确认时不推进基线', watch?.version === '0.2.1-rc.3' && watch.missing.length === 0,
    JSON.stringify(watch));
}

// 6. 点过「知道了」：基线推进，同样条件不再弹
{
  const fewer = ALL.filter((name) => name !== '@local/skin');
  const first = makeEnv({ version: '0.2.1-rc.3', ids: fewer,
    storage: { 'dsh.self-check.watch': seeded() } });
  activate(first);
  check('确认前会弹', alertCount(first) === 1, 'got ' + alertCount(first));

  // 模拟点「知道了」：基线推进到当前状态
  const acked = JSON.stringify({
    version: '0.2.1-rc.3', plugins: fewer, missing: ['@local/skin'], at: 2,
  });
  const again = makeEnv({ version: '0.2.1-rc.3', ids: fewer,
    storage: { 'dsh.self-check.watch': acked } });
  activate(again);
  check('确认后不再弹', alertCount(again) === 0, 'got ' + alertCount(again));
}

// 6b. 升级提示：没确认会一直弹，确认后停
{
  const env = makeEnv({ version: '0.2.2', ids: ALL,
    storage: { 'dsh.self-check.watch': seeded() } });
  activate(env);
  check('升级未确认会弹', alertCount(env) === 1);
  const watch = watchOf(env);
  check('升级未确认不推进基线', watch?.version === '0.2.1-rc.3', JSON.stringify(watch));
}

// 7. 宿主没给版本（老版本/改结构）：安静跳过，不报错
{
  const env = makeEnv({ version: undefined, ids: ALL });
  activate(env);
  check('拿不到版本时不弹也不报错', alertCount(env) === 0);
}

// 8. 条目是字符串而不是对象：也能读（防御结构变化）
{
  const env = makeEnv({ version: '0.2.1-rc.3', ids: [] });
  env.window.__DSH_BOOT__.entries = ALL.map((id) => ({ id }));
  activate(env);
  const watch = watchOf(env);
  check('entries 结构解析正常', watch?.plugins.length === ALL.length, JSON.stringify(watch));
}

// 9. 点「知道了」这条链路真的会把基线推进到新版本
{
  const env = makeEnv({ version: '0.2.2', ids: ALL,
    storage: { 'dsh.self-check.watch': seeded() } });
  activate(env);
  const alert = env.created.find((node) => node.attrs.class === 'sm-alert');
  const close = alert?.children.find((child) => child.attrs.class === 'sm-alert-close');
  check('提示上有「知道了」按钮', close !== undefined);
  close?.click();
  const watch = watchOf(env);
  check('点掉后基线推进到新版本', watch?.version === '0.2.2', JSON.stringify(watch));
  check('点掉后提示被移除', alert?.removed === true);
}

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
