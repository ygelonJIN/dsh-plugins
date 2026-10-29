#!/usr/bin/env node
/**
 * 把上游新版搬进来：白名单同步 + 重放我们的补丁 + 更新基线。
 *
 *   node scripts/upstream-sync.mjs <上游包目录>          # 预演（不写盘）
 *   node scripts/upstream-sync.mjs <上游包目录> --apply  # 真写
 *
 * 只碰 SYNC_FILES 里的 19 个文件；我们自己的 stub、入口、测试、文档一律不动。
 * 某个文件的补丁套不上时，**那个文件不写**（避免留下半成品），其余照常写，
 * 最后以退出码 2 报告"需要人工看"。
 *
 * 写完会更新 upstream.lock.json：上游版本、每个文件的上下游哈希、指纹快照。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SYNC_FILES } from './patches.mjs'
import { extractFingerprints, listSrcFiles, readIfExists, sha256, transformFile } from './lib.mjs'

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const lockPath = path.join(pkgRoot, 'upstream.lock.json')

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const upstreamDir = args.find(arg => !arg.startsWith('--'))

if (!upstreamDir) {
  console.error('用法：node scripts/upstream-sync.mjs <上游包目录> [--apply]')
  process.exit(64)
}
if (!fs.existsSync(path.join(upstreamDir, 'package.json'))) {
  console.error(`不是插件包目录（没有 package.json）：${upstreamDir}`)
  process.exit(64)
}

const upstreamPkg = JSON.parse(fs.readFileSync(path.join(upstreamDir, 'package.json'), 'utf8'))
console.log(`${apply ? '同步' : '预演'}：${upstreamPkg.name} ${upstreamPkg.version} → ${path.resolve(pkgRoot)}`)
console.log('')

const written = []
const same = []
const blocked = []

for (const file of SYNC_FILES) {
  const upstreamText = readIfExists(path.join(upstreamDir, file))
  if (upstreamText === null) {
    blocked.push({ file, reason: '上游没有这个文件（结构变了，先看 diff）' })
    continue
  }
  const { text, problems } = transformFile(upstreamText, file)
  if (problems.length > 0) {
    blocked.push({ file, reason: problems.map(p => `${p.id}（${p.why}）`).join('；') })
    continue
  }
  const localPath = path.join(pkgRoot, file)
  const current = readIfExists(localPath)
  if (current === text) {
    same.push(file)
    continue
  }
  if (apply) {
    fs.mkdirSync(path.dirname(localPath), { recursive: true })
    fs.writeFileSync(localPath, text, 'utf8')
  }
  written.push({ file, bytes: Buffer.byteLength(text) })
}

console.log(`内容有变化：${written.length} 个${apply ? '（已写入）' : '（预演，未写入）'}`)
for (const row of written) console.log(`  ✎ ${row.file.padEnd(26)} ${row.bytes} B`)
console.log(`内容没变：${same.length} 个`)
if (blocked.length > 0) {
  console.log(`\n跳过（补丁套不上）：${blocked.length} 个`)
  for (const row of blocked) console.log(`  ✗ ${row.file.padEnd(26)} ${row.reason}`)
  console.log('\n这些文件保持原样。到上游对应文件里找等价代码，改 scripts/patches.mjs 那条补丁的 find 后再跑。')
}

if (apply) {
  const files = {}
  for (const file of SYNC_FILES) {
    const upstreamText = readIfExists(path.join(upstreamDir, file))
    const localText = readIfExists(path.join(pkgRoot, file))
    if (upstreamText === null || localText === null) continue
    files[file] = { upstreamSha: sha256(upstreamText), localSha: sha256(localText) }
  }
  const lock = {
    upstream: {
      name: upstreamPkg.name,
      version: upstreamPkg.version,
      lockedAt: new Date().toISOString().slice(0, 10),
      note: '由 scripts/upstream-sync.mjs 生成；不要手改，重跑同步即可',
    },
    files,
    fingerprints: extractFingerprints(upstreamDir),
  }
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8')
  console.log(`\n基线已更新：${path.relative(pkgRoot, lockPath)}`)

  const srcFiles = listSrcFiles(pkgRoot)
  const missing = srcFiles.filter(file => {
    const text = readIfExists(path.join(pkgRoot, file))
    if (text === null) return false
    for (const match of text.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g)) {
      const target = path.normalize(path.join(path.dirname(file), match[1]))
      if (!fs.existsSync(path.join(pkgRoot, target))) return true
    }
    return false
  })
  console.log(missing.length === 0
    ? '相对导入完整'
    : `相对导入缺失：${missing.join(', ')}（上游可能新引了车道模块，去 patches.mjs 的 IGNORED 里补，或者把那个模块搬进来）`)
}

console.log('\n下一步：node test/smoke.mjs && node test/live.mjs；跑通了重启 DSH（宿主半要重新加载）。')
process.exit(blocked.length > 0 ? 2 : 0)
