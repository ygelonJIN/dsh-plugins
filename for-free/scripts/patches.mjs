/**
 * 我们对上游文件的全部改动，声明成可重放的补丁。
 *
 * 上游发新版时（或者车道失效、作者修了指纹），流程是：
 *   1. scripts/upstream-diff.mjs <新包目录>   ← 先看变了什么
 *   2. scripts/upstream-sync.mjs <新包目录>   ← 白名单同步 + 重放本文件的补丁
 *
 * 设计约定：
 * - `find` 匹配的是**上游原文**（不是我们改过的样子）。所以补丁永远以上游为锚点，
 *   上游一旦动了那段，补丁会失败并进 `problems`，让人来看——而不是静默跳过。
 * - 补丁只在 `SYNC_FILES` 里的文件上跑；我们自己的 stub（eac/aggregate/combos/
 *   subscription-adapter/token-saver/egress）与入口（index.js/client.js）不参与同步。
 * - 顺序有意义：结构补丁全部跑完后，最后跑全局品牌变换。
 *
 * 加新改动时：先改代码、跑通、再把改动回落成这里的一条补丁（find 用上游原文）。
 * 只改代码不留补丁，下次同步就被覆盖了。
 */

/** 参与上游同步的文件（都是原样搬来的验证过的实现）。 */
export const SYNC_FILES = [
  'src/adapter.js',
  'src/catalog.js',
  'src/channel.js',
  'src/combos.js',
  'src/core/completion.js',
  'src/core/runtime.js',
  'src/core/stats.js',
  'src/effort.js',
  'src/failure.js',
  'src/http.js',
  'src/image-pricing.js',
  'src/kilo.js',
  'src/messages.js',
  'src/model-test.js',
  'src/probe.js',
  'src/recovery.js',
  'src/route/classify.js',
  'src/store.js',
  'src/stream.js',
  'src/upstream.js',
]

/** 上游里有、但我们故意不要的文件（同步时忽略，删了也不报错）。 */
export const IGNORED_UPSTREAM_FILES = [
  'src/aggregate.js',
  'src/anthropic.js',
  'src/chan-relay.js',
  'src/deferred-response.js',
  'src/disclaimer.js',
  'src/eac-login.js',
  'src/eac-user.js',
  'src/eac.js',
  'src/egress.js',
  'src/engine-payload.js',
  'src/feed.js',
  'src/forward.js',
  'src/gemini.js',
  'src/local-optimize.js',
  'src/loopback-fetch.js',
  'src/magpie-engine.js',
  'src/magpie-models.js',
  'src/magpie-policy.js',
  'src/open-external.js',
  'src/picks.js',
  'src/providers/index.js',
  'src/providers/registry.json',
  'src/push.js',
  'src/reload.js',
  'src/subscription-adapter.js',
  'src/subscription-completion.js',
  'src/subscriptions.js',
  'src/token-saver.js',
  'src/trust.js',
  'src/updater.js',
  'src/vault-anchor.js',
  'src/vault-data.js',
  'src/vault.js',
]

const UPSTREAM_BASE_BLOCK = `/**
 * 上游根地址。三层优先：设置页填的反代 → 环境变量 → 官方地址。
 *
 * 反代场景：直连被限流（429）或被地区拦（403 RegionError）时，把请求转发到
 * 自己的 Worker / 反代域名（它再转 opencode.ai），插件只换这里。转发端要原样
 * 带上插件的请求头（UA、x-opencode-*），否则指纹门一样过不去。
 */
export const DEFAULT_UPSTREAM_BASE = 'https://opencode.ai'

let baseOverride = ''

/** 当前生效的上游根地址（无尾斜杠）。 */
export function upstreamBase() {
  return stripBase(baseOverride || process.env.FOR_FREE_BASE || DEFAULT_UPSTREAM_BASE)
}

/** 设置页写入；空串表示回到默认。非法地址抛错，调用方负责报给人看。 */
export function setUpstreamBase(value) {
  baseOverride = normalizeBase(value)
}

/** 兼容：上游代码里直接引用常量的地方仍然可用（返回值是官方地址）。 */
export const UPSTREAM_BASE = DEFAULT_UPSTREAM_BASE

function stripBase(value) {
  return String(value ?? '').replace(/\\/+$/, '')
}

function normalizeBase(value) {
  const text = stripBase(value).trim()
  if (text === '') return ''
  if (!/^https?:\\/\\/[^\\s]+$/i.test(text)) throw new Error(\`反代地址必须是 http(s) URL，收到「\${text}」\`)
  return text
}
`

const KILO_BASE_BLOCK = `/** Kilo 网关的默认根地址；运行时可被设置页覆盖（反代用）。 */
export const DEFAULT_KILO_BASE = 'https://api.kilo.ai/api/gateway'

let baseOverride = ''

/** 三层优先：设置页填的反代 → 环境变量 → 官方地址（无尾斜杠）。 */
export function kiloBase() {
  return stripBase(baseOverride || process.env.FOR_FREE_KILO_BASE || DEFAULT_KILO_BASE)
}

/** 设置页写入；空串表示回到默认。非法地址抛错。 */
export function setKiloBase(value) {
  baseOverride = normalizeBase(value)
}

/** 兼容：历史代码里直接引用常量的地方仍然可用（返回值是官方地址）。 */
export const KILO_BASE = DEFAULT_KILO_BASE

function stripBase(value) {
  return String(value ?? '').replace(/\\/+$/, '')
}

function normalizeBase(value) {
  const text = stripBase(value).trim()
  if (text === '') return ''
  if (!/^https?:\\/\\/[^\\s]+$/i.test(text)) throw new Error(\`反代地址必须是 http(s) URL，收到「\${text}」\`)
  return text
}
`

const TO_OPENAI_USAGE_BLOCK = `/**
 * 内部用量 → OpenAI 用量形状。
 *
 * 原包里这个函数住在 \`src/forward.js\`（本地 OpenAI 网关）。精简版删掉了那个
 * 网关，函数本身是纯映射，搬到这里就够。
 */
function toOpenAiUsage(usage) {
  if (usage === undefined) return undefined
  return {
    prompt_tokens: (usage.inputTokens ?? 0) + (usage.cacheReadTokens ?? 0),
    completion_tokens: usage.outputTokens ?? 0,
    total_tokens: (usage.inputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.outputTokens ?? 0),
    prompt_tokens_details: { cached_tokens: usage.cacheReadTokens ?? 0 },
    completion_tokens_details: { reasoning_tokens: usage.reasoningTokens ?? 0 },
  }
}
`

const SETTINGS_INITIAL_BLOCK = `export const SETTINGS_INITIAL = {
  version: 1,
  /** 总开关：关掉后路由仍在，但不再广播任何模型。 */
  enabled: true,
  /** 被地区策略拦下的模型是否单独分组显示。 */
  exposeRegionModels: true,
  /** 手动隐藏的模型 id（广告层，仍然可以按 id 直接解析）。 */
  hiddenModelIds: [],
  /** 后台刷新模型清单的间隔（分钟）。 */
  probeIntervalMinutes: 15,
  /** 单轮输出上限。 */
  defaultMaxTokens: 32768,
  /** 纯推理被掐断时是否允许一次续写检查点。 */
  streamRecovery: true,
  /** 最近一次清单同步时间。 */
  catalogSyncedAt: 0,
  /** 启动后是否自动刷新一次清单。 */
  autoRefresh: true,
  /** 反代地址（空串 = 官方）。直连被限流或地区拦住时填自己的转发域名。 */
  opencodeBase: '',
  kiloBase: '',
  /**
   * 降级链：combo:<名字> 在设置页里是一个虚拟模型，内部按顺序试候选，
   * 第一个出正文的算数（正文出现前失败 = 整段丢弃，调用方看不见）。
   */
  combos: [],
  /** 自动链：把当前能用的模型串成 combo:auto，额度用完自动换下一个。 */
  autoChain: true,
}`

/**
 * 补丁表。每条：
 *   file    —— 目标文件（SYNC_FILES 里的相对路径）
 *   id      —— 出问题时报告用
 *   why     —— 为什么要有这条（维护时看的）
 *   find    —— 上游原文（字符串或正则）
 *   replace —— 替换成什么
 *   或 kind: 'block'（replaceBlock）、'transform'（fn）、'assert'（test）
 *   required —— 默认 true；false 表示"没匹配也不算问题"
 */
export const PATCHES = [
  {
    id: 'upstream-base-runtime',
    file: 'src/upstream.js',
    why: '上游地址要能运行时覆盖（反代），因此常量换成函数 + setter',
    // 两种上游写法都要认：带注释的原始版，和后来加了 .replace() 的版本。
    find: [
      /\/\*\*\n \* Overridable so the selftest[\s\S]*?\n \*\/\nexport const UPSTREAM_BASE = process\.env\.OUR_FREE_MODEL_BASE \?\? 'https:\/\/opencode\.ai'\n/,
      /export const UPSTREAM_BASE = \(process\.env\.OUR_FREE_MODEL_BASE \?\? 'https:\/\/opencode\.ai'\)\.replace\([^\n]*\n/,
    ],
    replace: UPSTREAM_BASE_BLOCK,
  },
  {
    id: 'http-base-import',
    file: 'src/http.js',
    why: 'http 里拼地址要改调 upstreamBase()',
    find: "import { CLIENT_UA, UPSTREAM_BASE, gatewayHeaders, truncateSession } from './upstream.js'",
    replace: "import { CLIENT_UA, gatewayHeaders, truncateSession, upstreamBase } from './upstream.js'",
  },
  {
    id: 'http-base-splice',
    file: 'src/http.js',
    why: '两处 URL 拼接改用函数（跟着上面的 import 补丁）',
    kind: 'transform',
    fn: text => {
      const next = text.split('`${UPSTREAM_BASE}${path}`').join('`${upstreamBase()}${path}`')
      return next === text ? null : next
    },
  },
  {
    id: 'kilo-base-runtime',
    file: 'src/kilo.js',
    why: 'Kilo 网关地址同样要能反代',
    find: /\/\*\* Overridable for the offline suite and the live probes, like the free lane's base\. \*\/\nexport const KILO_BASE = [^\n]+\n/,
    replace: KILO_BASE_BLOCK,
  },
  {
    id: 'kilo-base-splice',
    file: 'src/kilo.js',
    why: '两处拼接改用 kiloBase()',
    kind: 'transform',
    fn: text => {
      const next = text.split('`${KILO_BASE}/').join('`${kiloBase()}/')
      return next === text ? null : next
    },
  },
  {
    id: 'completion-inline-usage',
    file: 'src/core/completion.js',
    why: 'forward.js 已删除，toOpenAiUsage 内联进来',
    kind: 'transform',
    fn: text => {
      const marker = "import { toOpenAiUsage } from '../forward.js'\n"
      if (!text.includes(marker)) return null
      // import 保持在最前，函数声明追加到文件末尾（函数声明提升，位置无所谓）。
      return text.replace(marker, '') + '\n' + TO_OPENAI_USAGE_BLOCK
    },
  },
  {
    id: 'store-settings-trim',
    file: 'src/store.js',
    why: '设置字段砍到我们自己用的那几个（forward/egress/aggregate/combos/公告…全删）',
    kind: 'block',
    start: /export const SETTINGS_INITIAL = \{/,
    replace: SETTINGS_INITIAL_BLOCK,
  },
  {
    id: 'probe-reset-at',
    file: 'src/probe.js',
    why: '429 的 Retry-After 要换算成绝对时间（设置页显示“约 HH:MM 恢复”）',
    find: `  } catch (error) {
    return {
      state: stateOf(error),
      detail: typeof error?.message === 'string' ? error.message.slice(0, 200) : String(error),
      latencyMs: Date.now() - started,
    }
  }
}`,
    replace: `  } catch (error) {
    // 429 的 \`Retry-After\` 是上游唯一肯给的额度信息：换算成绝对时间存下来，
    // 设置页就能显示「约 HH:MM 恢复」而不是干巴巴一句「额度受限」。
    const retryAfterMs = Number(error?.providerRetryAfterMs)
    const resetAt = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? Date.now() + retryAfterMs : 0
    return {
      state: stateOf(error),
      detail: typeof error?.message === 'string' ? error.message.slice(0, 200) : String(error),
      latencyMs: Date.now() - started,
      ...resetAt > 0 ? { resetAt, retryAfterMs } : {},
    }
  }
}`,
  },
  {
    id: 'runtime-reset-at',
    file: 'src/core/runtime.js',
    why: '探测结果的 resetAt 要一起落盘，不然重启就丢了',
    find: `            state: result.state,
            ...result.detail === undefined ? {} : { detail: result.detail },
            ...result.ttftMs === undefined ? {} : { ttftMs: result.ttftMs },
            latencyMs: result.latencyMs, startedAt: result.startedAt, at: Date.now(),`,
    replace: `            state: result.state,
            ...result.detail === undefined ? {} : { detail: result.detail },
            ...result.ttftMs === undefined ? {} : { ttftMs: result.ttftMs },
            ...result.resetAt === undefined ? {} : { resetAt: result.resetAt },
            latencyMs: result.latencyMs, startedAt: result.startedAt, at: Date.now(),`,
  },
  {
    id: 'availability-reset-at',
    file: 'src/model-test.js',
    why: '判定结果带出 resetAt，设置页才算得出“最早恢复时刻”',
    find: `    availability: measured?.state ?? 'unknown',
    detail: measured?.detail ?? '', probedAt: measured?.at ?? 0,
    ttftMs: measured?.ttftMs, latencyMs: measured?.latencyMs,`,
    replace: `    availability: measured?.state ?? 'unknown',
    detail: measured?.detail ?? '', probedAt: measured?.at ?? 0,
    ttftMs: measured?.ttftMs, latencyMs: measured?.latencyMs,
    /** 上游给的恢复时刻（429 的 Retry-After 换算，0 = 没这个信息）。 */
    resetAt: Number(measured?.resetAt) || 0,`,
  },
  {
    id: 'store-data-dir',
    file: 'src/store.js',
    why: '数据目录必须叫 for-free（品牌变换也会改到，这条是断言）',
    kind: 'assert',
    test: text => /DATA_DIR_NAME = 'for-free'/.test(text),
    message: "DATA_DIR_NAME 不是 'for-free'：上游可能改了目录名常量",
  },
]

/**
 * 全局品牌变换：最后跑。把上游残留的 our-free-model / OUR_FREE_MODEL /
 * Our Free Model 换成我们的名字。已改过的部分不含这些串，因此重复跑是幂等的。
 */
export const BRAND_TRANSFORMS = [
  [/our-free-model/g, 'for-free'],
  [/OUR_FREE_MODEL/g, 'FOR_FREE'],
  [/Our Free Model/g, 'For Free'],
]

/** 一行一行地读补丁结果，给报告用。 */
export function patchSummary() {
  return PATCHES.map(patch => `  ${patch.file.padEnd(24)} ${patch.id.padEnd(26)} ${patch.why}`).join('\n')
}
