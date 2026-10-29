/**
 * 出口（egress）—— 精简版：永远直连。
 *
 * 原包在这里跑一套「订阅链接 → mihomo 内核 → 本地中继」的出口选择器，
 * 用来切换出口 IP 解锁被地区策略拦下的模型。for-free 不做这件事：
 * 免费车道的请求直接走 Node 的全局 fetch，用户自己的代理仍然生效
 * （环境变量 / 系统代理由 fetch 自己处理）。
 *
 * 保留同名导出，是为了让 http.js / kilo.js / probe.js 一行都不用改。
 *
 * @module src/egress.js
 */

/** 是否正在经由内置出口转发：精简版永远为 false。 */
export function egressActive() {
  return false
}

/** 与全局 `fetch` 完全一致；不重写 URL、不注入请求头。 */
export async function egressFetch(url, init) {
  return fetch(url, init)
}

/** 精简版不提供出口中继。调用即说明配置里出现了已删除的功能。 */
export async function startEgressRelay() {
  throw new Error('for-free: 本精简版不含出口中继（直连即可）')
}

/** 当前出口的显示名。 */
export function outletLabel() {
  return 'direct'
}

/** 当前出口选择。设置页只用来显示「直连」。 */
export async function readOutletSelection() {
  return { mode: 'direct', url: '', node: 'direct', delayMs: 0, at: Date.now() }
}
