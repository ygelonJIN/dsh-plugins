/**
 * @local/for-free — 免 Key 免费模型接入（宿主半）
 *
 * 只做一件事：把两条「不用登录、不用填 Key」的免费车道接进 DSH 的模型选择器。
 *
 *   1. opencode 免费车道（/inference/v1/*，需要按上游客户端的指纹发请求）
 *   2. Kilo 免费池（api.kilo.ai，公开网关，零凭据）
 *
 * 代码来源：`dsh-our-free-model` 2.7.2（MIT）的精简衍生版。协议编解码、流式
 * 解析、适配器骨架都是那份实现验证过的代码；被删掉的是 EAC 协付、十个账号
 * 渠道、76 家 Key 聚合、本地 OpenAI 网关、出口中继、降级链、省 Token、公告
 * 推送、自升级与热重载，以及 11 页客户端界面。
 *
 * 与内核的唯一接缝：`ctx.llm.registerAdapter` + 一条 `/api/for-free` 前缀路由。
 * 所以内核换版本时，坏只会坏在这两处。
 *
 * @module index.js
 */

import fs from 'node:fs'
import path from 'node:path'

import { ROUTE_LABELS, ROUTE_MAIN, ROUTE_REGION } from './src/adapter.js'
import { DATA_DIR_NAME, resolveDshHome } from './src/store.js'
import { STATE } from './src/probe.js'
import { createModelRuntime, createRuntimeStores } from './src/core/runtime.js'
import { modelAvailability } from './src/model-test.js'
import { defaultEffortFor, effortsFor } from './src/effort.js'
import { DEFAULT_UPSTREAM_BASE, setUpstreamBase, upstreamBase } from './src/upstream.js'
import { DEFAULT_KILO_BASE, kiloBase, setKiloBase } from './src/kilo.js'
import { buildStats } from './src/core/stats.js'

export const name = '@local/for-free'

/** 只依赖 llm。webServer 走延迟注入，晚到时不该把整个插件拖成 pending。 */
export const inject = ['llm']

const VERSION = '0.1.0'
const API_PREFIX = '/api/for-free'
const MAX_BODY_BYTES = 64 * 1024
/** 自动链的虚拟模型 id：选择器里叫「自动」，内部按顺序试候选。 */
const AUTO_COMBO_ID = 'combo:auto'
/** 每条车道各取前 N 个进自动链：多了会让失败重试变慢，少了名牌模型轮不到。 */
const AUTO_CHAIN_PER_LANE = 6

const SETTINGS_WRITABLE = [
  'enabled',
  'exposeRegionModels',
  'probeIntervalMinutes',
  'defaultMaxTokens',
  'autoRefresh',
  'opencodeBase',
  'kiloBase',
  'autoChain',
]

export function apply(ctx, config = {}) {
  const logger = ctx.logger ?? console
  const dataDir = path.resolve(config.dataDir ?? path.resolve(resolveDshHome(), DATA_DIR_NAME))
  fs.mkdirSync(dataDir, { recursive: true })

  const stores = createRuntimeStores({ dataDir, logger })
  const { settings, stats, availability } = stores

  /**
   * 把设置里的反代地址套到两条车道上。空串 = 官方地址。
   * 写入时做一次，启动时也做一次（设置文件可能是手改的）。
   */
  function syncBases() {
    try { setUpstreamBase(settings.get().opencodeBase) } catch (error) {
      logger.warn?.(`for-free: opencode 反代地址无效，已回退 (${error?.message ?? error})`)
      setUpstreamBase('')
    }
    try { setKiloBase(settings.get().kiloBase) } catch (error) {
      logger.warn?.(`for-free: Kilo 反代地址无效，已回退 (${error?.message ?? error})`)
      setKiloBase('')
    }
  }
  syncBases()

  /**
   * 把「现在能用的模型」串成一条降级链，命名为 `combo:auto`（选择器里显示「自动」）。
   *
   * 排序逻辑，每轮刷新后重算：
   *   可用 > 未检测 > 地区受限 > 额度受限 > 不可用；同档里 Kilo 在前（它明确可用），
   *   opencode 车道在探测到 available 后会自己排到最前面（模型更“名牌”）。
   *   所以 opencode 一 429，它的模型自动沉到链尾，请求落到 Kilo 上——用户什么都不用做。
   *
   * 链只放真实模型（不放别的链，避免自引用）；每条车道各取前 6 个，太长会让失败重试变慢。
   */
  function syncAutoChain() {
    const snapshotAvailability = availability.get()
    // 排除组合本身（它也在 catalog 里，channel 是 'combo'），其余两条车道的真实模型都进链。
    const real = runtime.catalog.filter(entry => entry.channel !== 'combo')
    const rank = entry => {
      const verdict = modelAvailability(entry.id, snapshotAvailability, false).availability
      const stateRank = { available: 0, unknown: 1, 'region-blocked': 2, throttled: 3, unavailable: 4 }[verdict] ?? 1
      // 同为「未检测」时 Kilo 在前：它明确可用（清单刚拉通），opencode 未必。
      const laneRank = entry.channel === 'kilo' ? 0 : 1
      return stateRank * 10 + laneRank
    }
    // 两条车道各取前 6 个再统一排序：保证链里既有可用的 Kilo，也有 opencode 的名牌模型。
    const byLane = lane => real
      .filter(entry => (entry.channel ?? 'free') === lane)
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, AUTO_CHAIN_PER_LANE)
    const models = [...byLane('kilo'), ...byLane('free')]
      .sort((a, b) => rank(a) - rank(b))
      .map(entry => entry.id)
    const current = settings.get()
    const others = (Array.isArray(current.combos) ? current.combos : []).filter(combo => combo?.id !== AUTO_COMBO_ID)
    const next = models.length === 0
      ? others
      : [...others, {
        id: AUTO_COMBO_ID,
        name: '自动',
        models,
        strategy: 'fallback',
        stickyLimit: 1,
        enabled: current.autoChain !== false,
      }]
    if (JSON.stringify(next) === JSON.stringify(current.combos ?? [])) return
    settings.update({ combos: next })
    settings.flush()
    runtime.syncAggregateCatalog()
  }
  /** 后台刷新/探测拓扑变化时通知内核与选择器（runtime 内部回调）。 */
  function emitTopology() {
    try { ctx.emit?.('llm/adapters-updated') } catch { /* 无监听面 */ }
    try { registration.replace(Object.keys(visibleMembership())) } catch (error) {
      logger.warn?.(`for-free: 路由刷新失败 (${error?.message ?? error})`)
    }
  }

  const runtime = createModelRuntime({
    ...stores,
    logger,
    attributionUserAgent: 'deepseek-harness/for-free',
    onTopology: () => emitTopology(),
  })
  const { adapter, state, refreshCatalog, watchEgress } = runtime

  // 启动时先把链建起来（首次刷新会再按最新可用性重排一次）。
  syncAutoChain()

  /** 总开关关掉后选择器里一条都不出现；模型仍可按 id 解析（历史会话不炸）。 */
  function visibleMembership() {
    return settings.get().enabled === false ? {} : state().membership
  }

  // ── 注册到内核 ──────────────────────────────────────────────────────────────
  const registration = ctx.llm.registerAdapter([ROUTE_MAIN, ROUTE_REGION], adapter)
  ctx.llm.registerConfigurableProviders?.([
    {
      provider: ROUTE_MAIN,
      displayName: ROUTE_LABELS[ROUTE_MAIN],
      settingsNs: ctx.fiber?.entry?.options?.id ?? name,
      settingsPath: [],
    },
  ])
  ctx.llm.registerModelDiscovery?.(ctx.fiber?.entry?.options?.id ?? name, async () => {
    await refreshCatalog({ probe: false, force: true })
    const advertised = new Set(Object.values(visibleMembership()).flat())
    return runtime.catalog
      .filter(entry => advertised.has(entry.id))
      .map(entry => ({
        id: entry.id,
        name: entry.name,
        contextWindow: entry.contextWindow,
        maxTokens: entry.maxOutput,
        inputModalities: entry.vision ? ['text', 'image'] : ['text'],
      }))
  })

  ctx.on?.('loader/volatile-update', () => {
    try { registration.replace(Object.keys(visibleMembership())) } catch { /* ignore */ }
  })

  // ── 后台：启动刷新 + 周期刷新 ───────────────────────────────────────────────
  let disposed = false
  let firstHandle = null
  let periodHandle = null

  const refreshAll = async ({ probe = false, force = true } = {}) => {
    const started = Date.now()
    await refreshCatalog({ probe, force })
    await watchEgress().catch(error => {
      logger.warn?.(`for-free: 出口探测失败 (${error?.message ?? error})`)
    })
    syncAutoChain()
    emitTopology()
    return { ms: Date.now() - started, models: runtime.catalog.length }
  }

  function schedulePeriodic() {
    if (disposed) return
    const minutes = positive(settings.get().probeIntervalMinutes, 15)
    periodHandle = setTimeout(async () => {
      if (disposed) return
      try {
        await refreshCatalog({ probe: false, force: true })
      } catch (error) {
        logger.warn?.(`for-free: 周期刷新失败 (${error?.message ?? error})`)
      }
      schedulePeriodic()
    }, minutes * 60_000)
    periodHandle.unref?.()
  }

  ctx.effect(() => {
    if (settings.get().autoRefresh === false) return () => {}
    firstHandle = setTimeout(() => {
      if (disposed) return
      void refreshAll({ probe: false }).catch(error => {
        logger.warn?.(`for-free: 首次刷新失败 (${error?.message ?? error})`)
      })
      schedulePeriodic()
    }, 1200)
    firstHandle.unref?.()
    return () => {
      if (firstHandle !== null) clearTimeout(firstHandle)
      if (periodHandle !== null) clearTimeout(periodHandle)
    }
  }, 'for-free: 后台刷新')

  ctx.effect(() => () => {
    disposed = true
    if (firstHandle !== null) clearTimeout(firstHandle)
    if (periodHandle !== null) clearTimeout(periodHandle)
    try { runtime.dispose() } finally { stores.dispose() }
  }, 'for-free: 生命周期')

  ctx.effect(() => () => {
    try { registration() } catch { /* ignore */ }
  }, 'for-free: 适配器路由')

  // ── HTTP API（设置页唯一的数据源）──────────────────────────────────────────
  ctx.inject(['webServer'], scoped => {
    scoped.effect(
      () => scoped.webServer.register({ kind: 'prefix', path: API_PREFIX, handler: api }),
      'for-free: api',
    )
    logger.info?.(`for-free: 设置接口挂在 ${API_PREFIX}`)
  })

  /** 一页设置面板要的全部数据。 */
  function summary() {
    const snapshot = state()
    const availabilitySnapshot = availability.get()
    const membership = visibleMembership()
    const rows = runtime.catalog.map(entry => {
      const verdict = modelAvailability(entry.id, availabilitySnapshot, Boolean(entry.channel))
      const efforts = effortsFor(entry, undefined, settings.get().defaultMaxTokens)
      return {
        id: entry.id,
        name: entry.name,
        channel: entry.channel ?? 'free',
        wire: entry.wire ?? 'chat',
        vision: entry.vision === true,
        contextWindow: entry.contextWindow ?? null,
        maxOutput: entry.maxOutput ?? null,
        state: verdict.availability,
        source: verdict.availabilitySource,
        /** 上游给的恢复时刻（毫秒时间戳，0 = 没有这个信息）。 */
        resetAt: verdict.resetAt ?? 0,
        detail: verdict.detail ?? '',
        probedAt: verdict.probedAt ?? 0,
        ttftMs: verdict.ttftMs ?? null,
        latencyMs: verdict.latencyMs ?? null,
        efforts: efforts === undefined ? null : efforts.map(effort => effort.id),
        effortDefault: defaultEffortFor(entry),
        inPicker: (membership[ROUTE_MAIN] ?? []).includes(entry.id)
          || (membership[ROUTE_REGION] ?? []).includes(entry.id),
      }
    })
    const count = predicate => rows.filter(predicate).length
    return {
      ok: true,
      version: VERSION,
      name,
      routeLabels: ROUTE_LABELS,
      enabled: settings.get().enabled !== false,
      settings: pickSettings(settings.get()),
      groups: membership,
      models: rows,
      autoChain: {
        id: AUTO_COMBO_ID,
        name: '自动',
        enabled: settings.get().autoChain !== false,
        models: (Array.isArray(settings.get().combos) ? settings.get().combos : [])
          .find(combo => combo?.id === AUTO_COMBO_ID)?.models ?? [],
      },
      quota: quotaSummary(rows),
      usage: usageSummary(buildStats(stats.get(), runtime.catalog)),
      counts: {
        total: rows.length,
        available: count(row => row.state === STATE.available),
        regionBlocked: count(row => row.state === STATE.regionBlocked),
        throttled: count(row => row.state === STATE.throttled),
        unavailable: count(row => row.state === STATE.unavailable),
        unknown: count(row => row.state === STATE.unknown),
        inPicker: count(row => row.inPicker),
        freeLane: count(row => row.channel === 'free'),
        kilo: count(row => row.channel === 'kilo'),
      },
      egress: runtime.egress ?? availabilitySnapshot.egress ?? null,
      gatewayLatency: runtime.gatewayLatency ?? { ms: 0, at: 0 },
      syncedAt: settings.get().catalogSyncedAt ?? 0,
      availabilityAt: availabilitySnapshot.at ?? 0,
      bases: {
        opencode: upstreamBase(),
        kilo: kiloBase(),
        opencodeDefault: DEFAULT_UPSTREAM_BASE,
        kiloDefault: DEFAULT_KILO_BASE,
      },
      dataDir,
      settingsPath: path.join(dataDir, 'settings.json'),
    }
  }

  async function api(request, response) {
    if (!sameOrigin(request)) return send(response, 403, { ok: false, error: 'cross-origin blocked' })
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const route = url.pathname.slice(API_PREFIX.length) || '/'
    try {
      if (request.method === 'GET' && route === '/summary') return send(response, 200, summary())

      if (request.method === 'POST' && route === '/refresh') {
        const payload = await readJson(request)
        const probe = payload?.probe === true
        const result = await refreshAll({ probe })
        return send(response, 200, { ok: true, ...result, summary: summary() })
      }

      if (request.method === 'POST' && route === '/settings') {
        const payload = await readJson(request)
        const patch = sanitizeSettings(payload, settings.get())
        if (Object.keys(patch).length === 0) return send(response, 400, { ok: false, error: '没有可写入的字段' })
        settings.update(patch)
        settings.flush()
        if (patch.opencodeBase !== undefined || patch.kiloBase !== undefined) {
          syncBases()
          // 地址换了，目录必须按新出口重拉一遍，否则清单还是旧转发的。
          void refreshAll({ probe: false }).catch(error => {
            logger.warn?.(`for-free: 换反代后刷新失败 (${error?.message ?? error})`)
          })
        }
        emitTopology()
        if (patch.autoChain !== undefined) syncAutoChain()
        if (patch.autoRefresh !== undefined) {
          if (firstHandle !== null) clearTimeout(firstHandle)
          if (periodHandle !== null) clearTimeout(periodHandle)
          if (patch.autoRefresh !== false) schedulePeriodic()
        }
        return send(response, 200, { ok: true, summary: summary() })
      }

      return send(response, 404, { ok: false, error: `unknown route: ${route}` })
    } catch (error) {
      logger.warn?.(`for-free: ${route} 失败 (${error?.message ?? error})`)
      return send(response, 500, { ok: false, error: String(error?.message ?? error) })
    }
  }
}

// ── 小工具 ────────────────────────────────────────────────────────────────────

/**
 * 「额度还剩多少」的诚实答案：上游只肯给 429 的 Retry-After，其余靠实测。
 *
 * - opencode 车道的配额是**按出口/池**算的，不是每个模型一份：一个模型 429，
 *   整条车道这一轮都是 429，Retry-After 指向同一时刻。
 * - Kilo 免费池没有配额概念（cost 0，公开网关），它的限制是速率，回 429 也不给数字。
 * 所以这里能给的是：受限模型数 + 最早恢复时刻；剩余百分比谁也给不出。
 */
function quotaSummary(rows) {
  const now = Date.now()
  const resetTimes = rows.map(row => Number(row.resetAt) || 0).filter(time => time > now)
  const blockedUntil = resetTimes.length > 0 ? Math.min(...resetTimes) : 0
  return {
    throttledModels: rows.filter(row => row.state === STATE.throttled).length,
    blockedUntil,
    blockedMinutes: blockedUntil > 0 ? Math.max(1, Math.round((blockedUntil - now) / 60000)) : 0,
    /** 上游有没有给过恢复时间（false = 只能从失败里等）。 */
    hasResetInfo: resetTimes.length > 0,
  }
}

/** 本地已经用掉多少——这是唯一可以自己量、且不需要上游配合的数字。 */
function usageSummary(view) {
  const models = (view.models ?? [])
    .filter(row => (row.calls ?? 0) > 0)
    .map(row => ({
      id: row.model, name: row.name,
      calls: row.calls, failed: row.failed,
      input: row.input, output: row.output, reasoning: row.reasoning,
      tps: row.tps, avgTtftMs: row.avgTtftMs,
    }))
    .sort((a, b) => b.calls - a.calls)
  return {
    requests: view.requests ?? 0,
    refused: view.requestFailures ?? 0,
    turns: view.turns ?? 0,
    tokens: {
      input: view.grand?.input ?? 0,
      output: view.grand?.output ?? 0,
      reasoning: view.grand?.reasoning ?? 0,
    },
    models,
  }
}

function pickSettings(current) {
  const out = {}
  for (const key of SETTINGS_WRITABLE) out[key] = current[key]
  out.opencodeBase = current.opencodeBase ?? ''
  out.kiloBase = current.kiloBase ?? ''
  out.defaultMaxTokens = current.defaultMaxTokens ?? 32768
  out.probeIntervalMinutes = current.probeIntervalMinutes ?? 15
  return out
}

/** 只接受白名单字段，数值做区间收敛；非法值丢弃而不是写坏。 */
function sanitizeSettings(payload, current) {
  const patch = {}
  if (payload === null || typeof payload !== 'object') return patch
  for (const key of SETTINGS_WRITABLE) {
    if (!Object.hasOwn(payload, key)) continue
    const value = payload[key]
    if (key === 'enabled' || key === 'exposeRegionModels' || key === 'autoRefresh' || key === 'autoChain') {
      patch[key] = Boolean(value)
      continue
    }
    if (key === 'probeIntervalMinutes') {
      const minutes = Number(value)
      if (Number.isFinite(minutes) && minutes >= 1 && minutes <= 24 * 60) patch[key] = Math.trunc(minutes)
      continue
    }
    if (key === 'opencodeBase' || key === 'kiloBase') {
      const text = String(value ?? '').trim()
      if (text === '') { patch[key] = ''; continue }
      if (!/^https?:\/\/[^\s]+$/i.test(text)) continue
      patch[key] = text.replace(/\/+$/, '')
      continue
    }
    if (key === 'defaultMaxTokens') {
      const tokens = Number(value)
      if (Number.isFinite(tokens) && tokens >= 1024 && tokens <= 1_048_576) patch[key] = Math.trunc(tokens)
      continue
    }
  }
  // 没有实际变化就不写盘，避免无谓的 flush。
  const changed = Object.fromEntries(Object.entries(patch).filter(([key, value]) => current?.[key] !== value))
  return changed
}

function positive(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback
}

function send(response, status, value) {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (raw === '') return resolve({})
      try { resolve(JSON.parse(raw)) } catch (error) { reject(new Error(`请求体不是 JSON: ${error.message}`)) }
    })
    request.on('error', reject)
  })
}

/** 同源校验：只比 Origin 与 Host，与宿主其它插件路由一致。 */
function sameOrigin(request) {
  const origin = request.headers.origin
  const host = String(request.headers.host ?? '')
  if (origin === undefined) return true
  if (origin === 'null') return false
  try { return new URL(origin).host === host } catch { return false }
}

export default { name, inject, apply }
