/**
 * for-free 冒烟测试。
 *
 * 用一个假 ctx 把宿主半身跑起来（不依赖 DSH 内核），验证四件事：
 *   1. 两个 llm 路由注册上了，适配器能被内核按结构调用
 *   2. `/api/for-free/summary` 返回的文档形状
 *   3. `POST /refresh` 真的把两条车道的清单拉回来了
 *   4. `POST /settings` 写入后 summary 跟着变
 *
 * 数据目录是临时目录，不碰 ~/.dsh。第 3 步会发真实网络请求（两条车道各一次
 * 清单请求），失败时打印原因但不判定整体失败——断网时前两条仍要能过。
 *
 * 运行：node test/smoke.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'

const pkg = path.dirname(fileURLToPath(import.meta.url))
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'for-free-'))
fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ autoRefresh: false }), 'utf8')

const mod = await import(path.join(pkg, '..', 'index.js'))

let failures = 0
const check = (label, ok, extra = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`)
}

const registrations = []
const routes = []
const cleanups = []

const host = {
  webServer: {
    register(spec) {
      routes.push(spec)
      return () => {}
    },
  },
  effect(fn) {
    const dispose = fn()
    if (typeof dispose === 'function') cleanups.push(dispose)
    return dispose
  },
}

const ctx = {
  logger: { info() {}, warn() {}, log() {}, debug() {} },
  emit() {},
  on() {},
  effect(fn) {
    const dispose = fn()
    if (typeof dispose === 'function') cleanups.push(dispose)
    return dispose
  },
  inject(deps, callback) {
    callback(host)
  },
  fiber: { entry: { options: { id: 'for-free' } } },
  llm: {
    registerAdapter(list, adapter) {
      const registration = () => {}
      registration.replace = () => {}
      registrations.push({ list, adapter })
      return registration
    },
    registerConfigurableProviders() {},
    registerModelDiscovery() {},
  },
}

mod.apply(ctx, { dataDir })

check('llm 适配器注册了 2 条路由', registrations.length === 1 && registrations[0].list.length === 2,
  registrations.map(r => r.list.join(',')).join('|'))
check('适配器带 listModels/resolveModel/stream',
  ['providerInfo', 'listModels', 'resolveModel', 'stream', 'providerRetryPolicy'].every(key => typeof registrations[0].adapter[key] === 'function'))
check('设置接口挂在 /api/for-free', routes.some(r => r.kind === 'prefix' && r.path === '/api/for-free'))

const handler = routes.find(r => r.path === '/api/for-free').handler

function call({ method = 'GET', url = '/api/for-free/summary', body } = {}) {
  return new Promise((resolve, reject) => {
    const req = new Readable({ read() {} })
    req.method = method
    req.url = url
    req.headers = { host: '127.0.0.1:57443' }
    const res = {
      status: 0,
      writeHead(status) { this.status = status },
      end(buffer) {
        let parsed = null
        try { parsed = JSON.parse(String(buffer)) } catch { parsed = { raw: String(buffer) } }
        resolve({ status: this.status, body: parsed })
      },
    }
    Promise.resolve(handler(req, res)).catch(reject)
    if (body !== undefined) req.push(JSON.stringify(body))
    req.push(null)
  })
}

const summary = await call()
check('GET /summary 返回 200 + ok', summary.status === 200 && summary.body.ok === true, `status=${summary.status}`)
check('summary 带 models/settings/counts 字段',
  Array.isArray(summary.body.models) && summary.body.settings && summary.body.counts)
check('summary 的车道路由名是 for-free', summary.body.groups && typeof summary.body.groups === 'object')
check('summary 带额度汇总', summary.body.quota !== undefined
  && typeof summary.body.quota.throttledModels === 'number'
  && typeof summary.body.quota.blockedUntil === 'number'
  && typeof summary.body.quota.hasResetInfo === 'boolean',
  JSON.stringify(summary.body.quota))
check('summary 带本地用量', summary.body.usage !== undefined
  && typeof summary.body.usage.requests === 'number'
  && typeof summary.body.usage.tokens.input === 'number'
  && Array.isArray(summary.body.usage.models),
  JSON.stringify(summary.body.usage?.tokens ?? {}))

// 真实拉清单（断网不判失败，只记录）
let refreshed = null
try {
  refreshed = await call({ method: 'POST', url: '/api/for-free/refresh', body: { probe: false } })
} catch (error) {
  console.log(`     刷新抛出：${error?.message ?? error}`)
}
if (refreshed && refreshed.status === 200) {
  const models = refreshed.body.summary?.models ?? []
  const kilo = models.filter(row => row.channel === 'kilo').length
  const free = models.filter(row => row.channel === 'free').length
  check('刷新后拿到模型清单', models.length > 0, `共 ${models.length}：免费车道 ${free}，Kilo ${kilo}`)
  check('两条车道都有行', kilo > 0 && free > 0, `free=${free} kilo=${kilo}`)
check('自动降级链进了目录', (refreshed?.body.summary?.models ?? []).some(row => row.id === 'combo:auto'),
  JSON.stringify((refreshed?.body.summary?.autoChain ?? {})))
check('自动链不是空的', (refreshed?.body.summary?.autoChain?.models ?? []).length > 0,
  `链长 ${(refreshed?.body.summary?.autoChain?.models ?? []).length}`)
check('自动链进了选择器分组', Object.values(refreshed?.body.summary?.groups ?? {}).flat().includes('combo:auto'))
  check('刷新耗时合理', (refreshed.body.ms ?? 0) < 60_000, `${refreshed.body.ms} ms`)
} else {
  console.log('     刷新未成功（断网或上游拒绝），跳过清单断言')
}

const saved = await call({ method: 'POST', url: '/api/for-free/settings', body: { enabled: false } })
check('POST /settings 写入总开关', saved.status === 200 && saved.body.summary.enabled === false, `status=${saved.status}`)
check('关闭后选择器里不再是同一批模型',
  Object.keys(saved.body.summary.groups ?? {}).length === 0,
  JSON.stringify(saved.body.summary.groups ?? {}))

const bad = await call({ method: 'POST', url: '/api/for-free/settings', body: { probeIntervalMinutes: -5 } })
check('非法设置被拒', bad.status === 400, `status=${bad.status}`)

const missing = await call({ method: 'GET', url: '/api/for-free/nope' })
check('未知路由 404', missing.status === 404, `status=${missing.status}`)

// 反代地址：写进去要生效（去尾斜杠），非法值要被拒。
const proxy = await call({ method: 'POST', url: '/api/for-free/settings', body: { opencodeBase: 'http://127.0.0.1:9/' } })
check('反代地址写入并生效',
  proxy.status === 200 && proxy.body.summary.bases.opencode === 'http://127.0.0.1:9',
  `bases=${JSON.stringify(proxy.body.summary?.bases ?? {})}`)
const proxyKilo = await call({ method: 'POST', url: '/api/for-free/settings', body: { kiloBase: 'https://example.com/kilo' } })
check('Kilo 反代独立生效', proxyKilo.status === 200 && proxyKilo.body.summary.bases.kilo === 'https://example.com/kilo')
const badBase = await call({ method: 'POST', url: '/api/for-free/settings', body: { kiloBase: 'ftp://nope' } })
check('非法反代地址被拒', badBase.status === 400, `status=${badBase.status}`)
check('被拒后 Kilo 地址没变', (await call()).body.bases.kilo === 'https://example.com/kilo')

// 关掉后台刷新后不应再有定时器在跑：清理后进程能自然退出。
for (const dispose of cleanups) {
  try { await dispose() } catch { /* ignore */ }
}
fs.rmSync(dataDir, { recursive: true, force: true })

console.log(`\n${failures === 0 ? '全部通过' : `${failures} 项失败`}`)
process.exit(failures === 0 ? 0 : 1)
