/**
 * 聚合车道（自带 Key 的 76 家提供商）—— 精简版：不存在。
 *
 * for-free 不接第三方 Key：模型全部来自两条免 Key 车道。
 * 保留同名导出，core/runtime.js 与 adapter.js 的合并逻辑因此一行不用改。
 *
 * @module src/aggregate.js
 */

export const AGGREGATE_CHANNEL = 'aggregate'

/** 没有配置任何聚合提供商，目录恒为空。 */
export function buildAggregateCatalog() {
  return []
}

export function isAggregateEntry(entry) {
  return entry?.channel === AGGREGATE_CHANNEL
}

export function resolveProvider() {
  return undefined
}

export async function fetchProviderModels() {
  return []
}

export async function testProvider() {
  throw new Error('for-free: 本精简版不含聚合渠道')
}

export async function postAggregateStreamed() {
  throw new Error('for-free: 本精简版不含聚合渠道')
}
