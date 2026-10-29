/**
 * for-free 实网对话测试（手动跑，不在 CI 里）。
 *
 * 走完整链路：runtime → adapter.stream → 车道 → 流解析 → text-delta。
 * 两条车道各发一次最小请求，打印结果与失败分类。
 *
 *   node test/live.mjs                       # 两条车道各挑一个模型
 *   node test/live.mjs <model-id>            # 只测指定模型
 *   FOR_FREE_LIVE_LANE=kilo node test/live.mjs
 *
 * 会消耗上游的免费额度（Kilo 免费池 cost 为 0）。数据写临时目录，不碰 ~/.dsh。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = path.dirname(fileURLToPath(import.meta.url))
const { createRuntimeStores, createModelRuntime } = await import(path.join(pkg, '..', 'src', 'core', 'runtime.js'))

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'for-free-live-'))
const stores = createRuntimeStores({ dataDir, logger: { warn() {}, info() {}, log() {} } })
const runtime = createModelRuntime({
  ...stores,
  logger: { warn() {}, info() {}, log() {} },
  attributionUserAgent: 'deepseek-harness/for-free',
})

await runtime.refreshCatalog({ probe: false, force: true })
const catalog = runtime.catalog
console.log(`清单：${catalog.length} 个模型（免费车道 ${catalog.filter(e => !e.channel).length}，Kilo ${catalog.filter(e => e.channel === 'kilo').length}）`)

const wanted = process.argv[2]
const lane = process.env.FOR_FREE_LIVE_LANE
let targets
if (wanted) {
  targets = catalog.filter(entry => entry.id === wanted)
} else if (lane === 'kilo') {
  targets = catalog.filter(entry => entry.channel === 'kilo').slice(0, 1)
} else if (lane === 'free') {
  targets = catalog.filter(entry => !entry.channel).slice(0, 1)
} else {
  targets = [catalog.find(entry => !entry.channel), catalog.find(entry => entry.channel === 'kilo')].filter(Boolean)
}

if (targets.length === 0) {
  console.log('没有可测的模型（清单为空或被过滤掉了）')
  process.exit(1)
}

let failures = 0
for (const entry of targets) {
  const label = `${entry.id}${entry.channel ? ` [${entry.channel}]` : ' [free]'}`
  process.stdout.write(`\n▶ ${label}\n`)
  const started = Date.now()
  let text = ''
  let reasoning = ''
  let ttft = null
  let usage = null
  let finish = null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('超时 90s')), 90_000)
  timer.unref?.()
  try {
    const stream = runtime.adapter.stream({
      provider: 'for-free',
      model: entry.id,
      messages: [{ role: 'user', content: '用中文回答：1+1 等于几？只答数字，不要解释。' }],
      sessionId: `live:${entry.id}`,
      signal: controller.signal,
    }, entry, runtime.state())
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') {
        if (ttft === null) ttft = Date.now() - started
        text += chunk.text ?? ''
      }
      if (chunk.type === 'reasoning-delta') {
        if (ttft === null) ttft = Date.now() - started
        reasoning += chunk.text ?? ''
      }
      if (chunk.type === 'usage') usage = chunk.usage
      if (chunk.type === 'finish') finish = chunk.reason?.kind ?? chunk.upstreamFinish ?? 'stop'
    }
    const total = Date.now() - started
    console.log(`  首字 ${ttft ?? '—'} ms · 总耗时 ${total} ms · 结束 ${finish ?? '—'}`)
    console.log(`  思考片段 ${reasoning.length} 字 · 正文 ${text.trim().length} 字`)
    if (text.trim() === '') {
      console.log('  正文是空的（模型只回了思考，或者被上游截断）')
      failures += 1
    } else {
      console.log(`  正文：${JSON.stringify(text.trim().slice(0, 120))}`)
    }
    if (usage) console.log(`  usage：输入 ${usage.inputTokens ?? 0} / 输出 ${usage.outputTokens ?? 0} / 思考 ${usage.reasoningTokens ?? 0}`)
  } catch (error) {
    const code = error?.code ?? 'unknown'
    console.log(`  失败：${code} — ${String(error?.message ?? error).slice(0, 200)}`)
    failures += 1
  } finally {
    clearTimeout(timer)
  }
}

try { runtime.dispose(); stores.dispose() } catch { /* ignore */ }
fs.rmSync(dataDir, { recursive: true, force: true })
console.log(`\n${failures === 0 ? '两条车道都出了正文' : `${failures} 个模型没出正文（见上面的分类）`}`)
process.exit(0)
