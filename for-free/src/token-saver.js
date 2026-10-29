/**
 * 省 Token —— 精简版：关闭。
 *
 * 原包在请求发出前就地重写 `tool_result`（git diff / grep / 构建日志…）并把
 * 提示词改成 caveman / ponytail 风格。这套东西跟「能不能用上免费模型」无关，
 * 而且会改变发给模型的内容，精简版不带它：`applyTokenSavers` 原样返回一份
 * 空报告，设置页仍可显示「未启用」。
 *
 * 保留同名导出，adapter.js 与 core/stats.js 因此不用改。
 *
 * @module src/token-saver.js
 */

export const CAVEMAN_LEVELS = []
export const PONYTAIL_LEVELS = []
export const PROMPT_FAMILIES = []

export function emptySavings() {
  return { bytesBefore: 0, bytesAfter: 0, saved: 0, blocks: 0, calls: 0, promptCalls: 0 }
}

export function addSavings(total, report) {
  const base = total ?? emptySavings()
  return {
    bytesBefore: base.bytesBefore + (Number(report?.bytesBefore) || 0),
    bytesAfter: base.bytesAfter + (Number(report?.bytesAfter) || 0),
    saved: base.saved + (Number(report?.saved) || 0),
    blocks: base.blocks + (Array.isArray(report?.rtk?.hits) ? report.rtk.hits.length : 0),
    calls: base.calls + 1,
    promptCalls: base.promptCalls + (report?.prompt?.injected === true ? 1 : 0),
  }
}

export function savingsPercent(total) {
  const before = Number(total?.bytesBefore) || 0
  const saved = Number(total?.saved) || 0
  if (before <= 0) return 0
  return Math.round((saved / before) * 100)
}

export function formatBytes(value) {
  const bytes = Number(value) || 0
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function describeSavingsTotal(total) {
  const safe = total ?? emptySavings()
  if (safe.calls === 0) return '本精简版未启用省 Token'
  return `${formatBytes(safe.saved)} / ${safe.calls} 次请求`
}

/** 设置里永远读成关闭。 */
export function saverConfig() {
  return { enabled: false, rtk: false, caveman: 'off', ponytail: 'off' }
}

/** 不做任何压缩，返回一份零报告。 */
export function applyTokenSavers() {
  return { prompt: null, rtk: null, saved: 0, bytesBefore: 0, bytesAfter: 0, notes: [] }
}

export function activePrompts() {
  return []
}

export function cavemanPrompt() {
  return ''
}

export function ponytailPrompt() {
  return ''
}
