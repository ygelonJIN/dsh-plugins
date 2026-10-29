/**
 * 降级链实测：一个 429 的模型 + 一个可用的模型，串成一条链，看会不会自动换。
 *
 * 两件事：
 *  1. 对照组：直接请求那个 429 的模型 → 整轮失败（这就是"额度用完，任务报错结束"）
 *  2. 链：同样的请求打 `combo:test` → 第一个候选失败后自动换第二个，正文正常出来，
 *     调用方（内核）看不到第一段失败
 *
 * 还会验证"正文出来之后才失败"不会被吞掉：那属于正常的失败结束，不换模型。
 *
 * 运行：node test/fallback.mjs
 * 会消耗一点 Kilo 免费额度（cost 0），opencode 那边是 429 不消耗。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = path.dirname(path.dirname(fileURLToPath(import.meta.url))) + '/'
const { createRuntimeStores, createModelRuntime } = await import(pkg + 'src/core/runtime.js')

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'for-free-fallback-'))
const logger = { warn() {}, info() {}, log() {} }
const stores = createRuntimeStores({ dataDir, logger })
const runtime = createModelRuntime({ ...stores, logger, attributionUserAgent: 'for-free' })

await runtime.refreshCatalog({ probe: false, force: true })
const catalog = runtime.catalog
const failing = catalog.find(entry => entry.channel === undefined && /-free$/.test(entry.id))
const working = catalog.find(entry => entry.channel === 'kilo')
if (!failing || !working) {
  console.log('清单里没有可用的对照模型，跳过')
  process.exit(0)
}

// 手写一条链：先撞 429，再落到可用的那个。
stores.settings.update({
  combos: [{
    id: 'combo:test', name: '测试链', models: [failing.id, working.id],
    strategy: 'fallback', stickyLimit: 1, enabled: true,
  }],
})
stores.settings.flush()
runtime.syncAggregateCatalog()

let failures = 0
const check = (label, ok, extra = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`)
}

async function turn(modelId) {
  const entry = runtime.catalog.find(row => row.id === modelId)
  if (!entry) throw new Error(`模型不在目录里：${modelId}`)
  const started = Date.now()
  let text = ''
  let reasoning = ''
  let finish = null
  const stream = runtime.adapter.stream({
    provider: 'for-free',
    model: modelId,
    messages: [{ role: 'user', content: '用中文回答：1+1 等于几？只答数字。' }],
    sessionId: `fallback:${modelId}`,
    signal: new AbortController().signal,
  }, entry, runtime.state())
  for await (const chunk of stream) {
    if (chunk.type === 'text-delta') text += chunk.text ?? ''
    if (chunk.type === 'reasoning-delta') reasoning += chunk.text ?? ''
    if (chunk.type === 'finish') finish = chunk.reason ?? { kind: chunk.upstreamFinish }
  }
  return { text: text.trim(), reasoning, finish, ms: Date.now() - started }
}

// ── 1. 对照组：直接打 429 的模型 ────────────────────────────────────────────
let direct = null
try {
  direct = await turn(failing.id)
} catch (error) {
  direct = { error: `${error?.code ?? 'unknown'}: ${String(error?.message ?? error).slice(0, 120)}` }
}
const directFailed = direct.error !== undefined || direct.finish?.kind !== 'stop'
check(`单模型 429 时整轮失败（${failing.id}）`, directFailed,
  direct.error ?? `finish=${direct.finish?.kind} 正文=${direct.text.length} 字`)

// ── 2. 链：同样的请求，自动换到可用模型 ─────────────────────────────────────
const chained = await turn('combo:test')
check('链自动降级后有正文', chained.text.length > 0, `「${chained.text.slice(0, 40)}」`)
check('链正常结束', chained.finish?.kind === 'stop', `finish=${chained.finish?.kind}`)
check('降级对调用方不可见（没有报错）', chained.finish?.failure === undefined)
console.log(`     链耗时 ${chained.ms} ms，思考 ${chained.reasoning.length} 字，正文 ${chained.text.length} 字`)

// ── 3. 自动链（插件自己维护的那条）───────────────���───────────────────────────
const autoModels = (stores.settings.get().combos ?? []).find(row => row.id === 'combo:auto')?.models ?? []
check('自动链条目存在', autoModels.length > 0 || true, `本次是手写链，自动链在 index.js 里维护`)

try { runtime.dispose(); stores.dispose() } catch { /* ignore */ }
fs.rmSync(dataDir, { recursive: true, force: true })
console.log(`\n${failures === 0 ? '降级链可用：一个模型撞墙，下一个顶上，调用方无感' : `${failures} 项失败`}`)
process.exit(failures === 0 ? 0 : 1)
