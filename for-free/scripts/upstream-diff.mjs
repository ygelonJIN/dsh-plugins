#!/usr/bin/env node
/**
 * 上游新版来了，先看看到底变了什么。
 *
 *   node scripts/upstream-diff.mjs <上游包目录>
 *
 * 它回答四个问题：
 *   1. 上游版本号变了没
 *   2. 19 个同步文件里哪些真的变了（对比 upstream.lock.json 里记的上游哈希）
 *   3. 会失效的指纹变了没（UA、工具定义、会话编码、端点、网关头）
 *   4. 我们的补丁还能不能套上去（对着新文件预演一遍，失败就是"要人工看"）
 *
 * 只读，不写任何文件。退出码：0 = 可以同步；2 = 有补丁要人工确认。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SYNC_FILES, IGNORED_UPSTREAM_FILES } from './patches.mjs'
import {
  diffFingerprints,
  extractFingerprints,
  listSrcFiles,
  readIfExists,
  readJson,
  sha256,
  transformFile,
} from './lib.mjs'

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const lockPath = path.join(pkgRoot, 'upstream.lock.json')

const upstreamDir = process.argv[2]
if (!upstreamDir) {
  console.error('用法：node scripts/upstream-diff.mjs <上游包目录>')
  process.exit(64)
}
if (!fs.existsSync(path.join(upstreamDir, 'package.json'))) {
  console.error(`不是插件包目录（没有 package.json）：${upstreamDir}`)
  process.exit(64)
}

const upstreamPkg = JSON.parse(fs.readFileSync(path.join(upstreamDir, 'package.json'), 'utf8'))
const lock = readJson(lockPath)

console.log(`上游包：${path.resolve(upstreamDir)}`)
console.log(`  名称：${upstreamPkg.name}  版本：${upstreamPkg.version}`)
if (lock === null) {
  console.log('  没有 upstream.lock.json —— 这是第一次同步，先跑 sync --apply 建立基线')
} else {
  console.log(`  基线：${lock.upstream.name} ${lock.upstream.version}（锁定于 ${lock.upstream.lockedAt}）`)
}

// ── 1. 文件级变化 ────────────────────────────────────────────────────────────
const rows = []
let changed = 0
for (const file of SYNC_FILES) {
  const upstreamText = readIfExists(path.join(upstreamDir, file))
  const localText = readIfExists(path.join(pkgRoot, file))
  if (upstreamText === null) {
    rows.push({ file, state: 'gone', detail: '上游没有这个文件了（结构变了）' })
    continue
  }
  const recorded = lock?.files?.[file]
  const upstreamMoved = recorded === undefined || recorded.upstreamSha !== sha256(upstreamText)
  const localDrift = recorded !== undefined && localText !== null && recorded.localSha !== sha256(localText)
  const rehearsal = transformFile(upstreamText, file)
  const detail = [
    upstreamMoved ? '上游变了' : '上游未变',
    localDrift ? '本地手改过（同步会覆盖）' : null,
    rehearsal.problems.length > 0
      ? `补丁失败 ${rehearsal.problems.length} 处：${rehearsal.problems.map(p => p.id).join(', ')}`
      : '补丁全过',
  ].filter(Boolean).join(' · ')
  if (upstreamMoved) changed += 1
  rows.push({ file, state: upstreamMoved ? 'changed' : 'same', detail, problems: rehearsal.problems })
}

console.log(`\n文件（同步白名单 ${SYNC_FILES.length} 个）`)
for (const row of rows) {
  const mark = row.state === 'gone' ? '缺 ' : row.state === 'changed' ? '变 ' : '同 '
  console.log(`  ${mark} ${row.file.padEnd(26)} ${row.detail}`)
}

// ── 2. 指纹级变化 ────────────────────────────────────────────────────────────
const nextFingerprints = extractFingerprints(upstreamDir)
const fingerprintChanges = lock === null ? [] : diffFingerprints(lock.fingerprints, nextFingerprints)
console.log('\n会失效的指纹')
if (lock === null) {
  console.log('  无基线，下面是当前上游的指纹快照：')
  for (const [key, value] of Object.entries(nextFingerprints ?? {})) {
    console.log(`  ${key.padEnd(22)} ${JSON.stringify(value)}`)
  }
} else if (fingerprintChanges.length === 0) {
  console.log('  没有变化（指纹没动，车道不该失效）')
} else {
  for (const change of fingerprintChanges) {
    console.log(`  ${change.key}`)
    console.log(`    旧：${JSON.stringify(change.before)}`)
    console.log(`    新：${JSON.stringify(change.after)}`)
  }
}

// ── 3. 结构变化 ──────────────────────────────────────────────────────────────
const upstreamFiles = listSrcFiles(upstreamDir)
const known = new Set([...SYNC_FILES, ...IGNORED_UPSTREAM_FILES])
const added = upstreamFiles.filter(file => !known.has(file))
const missing = SYNC_FILES.filter(file => !upstreamFiles.includes(file))
console.log('\n结构')
console.log(added.length === 0
  ? '  上游没有我们不认识的新文件'
  : `  上游新增文件（评估是否要接）：${added.join(', ')}`)
console.log(missing.length === 0
  ? '  白名单文件齐全'
  : `  白名单文件在上游消失：${missing.join(', ')}`)

// ── 4. 结论 ──────────────────────────────────────────────────────────────────
const hardProblems = rows.filter(row => row.state === 'gone' || (row.problems?.length ?? 0) > 0)
const goneCount = rows.filter(row => row.state === 'gone').length
console.log('\n结论')
console.log(`  ${changed} 个文件需要同步${goneCount > 0 ? `，${goneCount} 个在上游消失` : ''}`)
if (hardProblems.length === 0) {
  console.log('  补丁全部能套上。可以同步：')
  console.log(`    node scripts/upstream-sync.mjs ${path.resolve(upstreamDir)} --apply`)
  console.log('  同步后：node test/smoke.mjs && node test/live.mjs，然后重启 DSH')
  process.exit(0)
}
console.log('  有需要人工确认的地方，先别同步：')
for (const row of hardProblems) {
  if (row.state === 'gone') console.log(`    ${row.file}：上游删了/改名了，先确认新结构`)
  else for (const problem of row.problems) console.log(`    ${row.file} → 补丁 ${problem.id}：${problem.why}`)
}
console.log('\n  处理办法：打开上游那个文件，找现在等价的代码，改 scripts/patches.mjs 里那条补丁的 find 后再跑一次。')
process.exit(2)
