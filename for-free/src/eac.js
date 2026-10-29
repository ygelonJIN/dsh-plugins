/**
 * EAC 协付车道 —— 精简版：不存在。
 *
 * 原包的这条车道要靠桌面宿主指纹闸门 + 服务端 GitHub star 校验，
 * for-free 不接它：没有凭据、没有密封、没有闸门。
 *
 * 保留同名导出，adapter.js 与 core/runtime.js 的判定分支因此不用改：
 * `sealedCredential()` 恒为 null，车道目录恒为空，模型选择器里不会出现它。
 *
 * @module src/eac.js
 */

import { CODE, UpstreamError } from './http.js'

/** 原包里由宿主注入的 fetch；此处只是占位，永不使用。 */
export const lane = { fetch: null }

/** 原包里的 GitHub 用户令牌；此处永不写入。 */
export const laneUser = { token: undefined }

/** 直连 fetch 的别名（原包用它走「车道的节点」）。 */
export async function directFetch(url, init) {
  return fetch(url, init)
}

/** 签名密封请求：车道不存在，永远不签。 */
export function signSealedRequest() {
  throw new UpstreamError('本精简版不含 EAC 协付车道', CODE.credential)
}

/** 拉取协付车道的模型清单：永远拒绝。 */
export async function fetchSealedListing() {
  throw new UpstreamError('本精简版不含 EAC 协付车道', CODE.credential)
}

/** 走协付车道的流式请求：永远拒绝。 */
export async function postSealedStreamed() {
  throw new UpstreamError('本精简版不含 EAC 协付车道', CODE.credential)
}
