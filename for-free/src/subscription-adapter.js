/**
 * 订阅渠道（十个账号平台的模型池）—— 精简版：不存在。
 *
 * 原包让用户在设置页登录 LobsterAI / Qoder / TRAE / Cline / Gemini 等十个平台，
 * 再把它们的模型并进同一条清单。for-free 一个账号都不接。
 *
 * @module src/subscription-adapter.js
 */

export function isSubscriptionEntry(entry) {
  return entry?.channel === 'subscription'
}

export function subscriptionCatalog() {
  return []
}

export async function* subscriptionChunks() {
  return
}
