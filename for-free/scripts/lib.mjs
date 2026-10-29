/**
 * 维护工具的共用部分：补丁应用、品牌变换、指纹提取、文件哈希。
 *
 * 这里不 import 上游代码（那会连带跑起它的 store/网络逻辑），全部用正则从
 * 源码文本里取事实。取不到就是 null——这本身就是"上游结构变了"的信号。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { BRAND_TRANSFORMS, PATCHES } from './patches.mjs'

export function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)
}

export function readIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/** 品牌变换：最后跑。幂等（已改过的文本不含上游品牌串）。 */
export function brand(text) {
  let out = text
  for (const [pattern, to] of BRAND_TRANSFORMS) out = out.replace(pattern, to)
  return out
}

/**
 * 把一个上游文件的原文加工成"我们在用的样子"。
 * 返回 { text, problems }：problems 里的补丁表示"上游那段变了，需要人工看"。
 */
export function transformFile(text, file) {
  let out = text
  const problems = []

  for (const patch of PATCHES) {
    if (patch.file !== file) continue
    if (patch.kind === 'assert') continue
    const next = applyOne(out, patch)
    if (next === null) {
      if (patch.required !== false) problems.push(patch)
      continue
    }
    out = next
  }

  out = brand(out)

  for (const patch of PATCHES) {
    if (patch.file !== file || patch.kind !== 'assert') continue
    if (!patch.test(out)) problems.push(patch)
  }

  return { text: out, problems }
}

function applyOne(text, patch) {
  if (patch.kind === 'transform') {
    const next = patch.fn(text)
    return next === null || next === undefined || next === text ? null : next
  }
  if (patch.kind === 'block') {
    const start = patch.start.exec(text)
    if (start === null) return null
    const from = start.index
    const end = text.indexOf('\n}\n', from)
    if (end === -1) return null
    return text.slice(0, from) + patch.replace + text.slice(end + 2)
  }
  // `find` 可以是数组：上游换了写法时，把新旧两种都列上，命中任一即可。
  if (Array.isArray(patch.find)) {
    for (const candidate of patch.find) {
      const next = applyOne(text, { ...patch, find: candidate })
      if (next !== null) return next
    }
    return null
  }
  const find = patch.find
  if (find instanceof RegExp) {
    if (!find.test(text)) return null
    return text.replace(find, patch.replace)
  }
  if (!text.includes(find)) return null
  return text.replace(find, patch.replace)
}

/** 从上游源码里抽取"会失效的指纹事实"，用于版本对比。 */
export function extractFingerprints(srcDir) {
  const upstream = readIfExists(path.join(srcDir, 'src', 'upstream.js'))
  const kilo = readIfExists(path.join(srcDir, 'src', 'kilo.js'))
  if (upstream === null) return null

  const one = (re, fallback = null) => {
    const match = re.exec(upstream)
    return match === null ? fallback : match[1]
  }
  const defs = /const FINGERPRINT_TOOL_DEFINITIONS = (\{[\s\S]*?\n\})\n/.exec(upstream)
  const headers = /export function gatewayHeaders[\s\S]*?\n\}/.exec(upstream)
  return {
    clientUa: one(/export const CLIENT_UA = '([^']+)'/),
    fingerprintTools: one(/export const FINGERPRINT_TOOLS = \[([^\]]*)\]/),
    toolDefinitionsHash: defs === null ? null : sha256(defs[1]),
    sessionRe: one(/export const SESSION_RE = (.+)$/m),
    sessionDescendingRe: one(/export const SESSION_DESCENDING_RE = (.+)$/m),
    responsesModels: one(/const RESPONSES_MODELS = new Set\(\[([^\]]*)\]\)/),
    messagesModels: one(/const MESSAGES_MODELS = new Set\(\[([^\]]*)\]\)/),
    endpoints: [...new Set([...upstream.matchAll(/'\/(inference|zen)\/v1\/[a-z/]+'/g)].map(m => m[0]))].sort(),
    gatewayHeaders: headers === null ? null : [...new Set([...headers[0].matchAll(/'([a-z-]+)':/g)].map(m => m[1]))].sort(),
    upstreamBase: one(/export const UPSTREAM_BASE = (.+)$/m),
    kiloBase: kilo === null ? null : (/export const KILO_BASE = (.+)$/m).exec(kilo)?.[1] ?? null,
    apiVersion: one(/const ANTHROPIC_API_VERSION = '([^']+)'/, null),
  }
}

/** 递归列出 src 下的 .js（相对路径，正斜杠）。 */
export function listSrcFiles(root) {
  const out = []
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.js')) out.push(path.relative(root, full).split(path.sep).join('/'))
    }
  }
  const srcDir = path.join(root, 'src')
  if (fs.existsSync(srcDir)) walk(srcDir)
  return out.sort()
}

export function readJson(file) {
  const text = readIfExists(file)
  if (text === null) return null
  try { return JSON.parse(text) } catch { return null }
}

/** 对比两组指纹，返回 [{ key, before, after }]（只列变化的）。 */
export function diffFingerprints(before, after) {
  if (before === null || after === null) return []
  const changes = []
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = JSON.stringify(before[key] ?? null)
    const b = JSON.stringify(after[key] ?? null)
    if (a !== b) changes.push({ key, before: before[key], after: after[key] })
  }
  return changes
}
