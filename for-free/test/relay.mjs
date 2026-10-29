/**
 * 反代链路测试：起一个本地转发服务器当"反代"，把 opencode 车道指过去。
 *
 * 验证三件事：
 *   1. 设置里填 base URL 后，请求真的走那个地址（不是直连）
 *   2. 指纹头（user-agent / authorization / x-opencode-*）原样穿过反代
 *   3. 清单能拉回来——这条链路只要转发端不改头、不改体，就和直连等价
 *
 * 这是"以后怎么反代"的可执行样板：任何 Worker / nginx / VPS 转发只要做到
 * 「原样转发 + 不改头」，把地址填进设置页即可。
 *
 * 运行：node test/relay.mjs
 * 不消耗额度（只拉清单），不碰 ~/.dsh。
 */
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = path.dirname(path.dirname(fileURLToPath(import.meta.url))) + '/'
const { setUpstreamBase, upstreamBase, DEFAULT_UPSTREAM_BASE, sessionForConversation } = await import(pkg + 'src/upstream.js')
const { getJson } = await import(pkg + 'src/http.js')

const seen = []
const TARGET = DEFAULT_UPSTREAM_BASE

const relay = http.createServer(async (request, response) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const body = Buffer.concat(chunks)
  seen.push({
    url: request.url,
    method: request.method,
    headers: { ...request.headers },
    bodyBytes: body.length,
  })
  try {
    const target = new URL(request.url, TARGET)
    const headers = { ...request.headers }
    delete headers.host
    delete headers['content-length']
    delete headers['accept-encoding']
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: body.length > 0 ? body : undefined,
    })
    const buffer = Buffer.from(await upstream.arrayBuffer())
    const out = {}
    for (const [key, value] of upstream.headers) {
      if (['content-encoding', 'transfer-encoding', 'content-length'].includes(key)) continue
      out[key] = value
    }
    out['content-length'] = String(buffer.length)
    response.writeHead(upstream.status, out)
    response.end(buffer)
  } catch (error) {
    response.writeHead(502, { 'content-type': 'text/plain' })
    response.end(`relay error: ${error?.message ?? error}`)
  }
})

await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve))
const { port } = relay.address()
const base = `http://127.0.0.1:${port}`
console.log(`反代监听 ${base} → ${TARGET}`)

setUpstreamBase(base)
console.log(`upstreamBase() = ${upstreamBase()}`)

let failures = 0
const check = (label, ok, extra = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`)
}

check('base 覆盖生效', upstreamBase() === base)

let listing = null
let error = null
try {
  listing = await getJson('/inference/v1/models', {
    session: sessionForConversation('relay:test'),
    attributionUserAgent: 'for-free',
  })
} catch (caught) {
  error = caught
}

check('清单经过反代拿到 200', listing !== null && Array.isArray(listing.data) && listing.data.length > 0,
  listing ? `${listing.data.length} 个模型` : String(error?.message ?? error))

const first = seen[0]
check('反代确实被访问到', seen.length > 0, `${seen.length} 次`)
check('路径原样转发', first?.url === '/inference/v1/models', String(first?.url))
check('指纹 UA 穿过反代', first?.headers['user-agent'] === 'opencode/latest/2.0.26/cli', String(first?.headers['user-agent']))
check('免密凭据穿过反代', first?.headers.authorization === 'Bearer public', String(first?.headers.authorization))
check('会话头穿过反代',
  typeof first?.headers['x-opencode-session'] === 'string'
  && first?.headers['x-opencode-session'] === first?.headers['x-opencode-session-id']
  && first?.headers['x-opencode-session'].startsWith('ses_'),
  String(first?.headers['x-opencode-session']))
check('客户端标识穿过反代', first?.headers['x-opencode-client'] === 'cli', String(first?.headers['x-opencode-client']))
check('没有带 v1 专用头', first?.headers['x-opencode-request'] === undefined, String(first?.headers['x-opencode-request']))

setUpstreamBase('')
check('清空后回到官方地址', upstreamBase() === DEFAULT_UPSTREAM_BASE)

await new Promise(resolve => relay.close(resolve))
console.log(`\n${failures === 0 ? '反代链路可用：原样转发即可，不用改头' : `${failures} 项失败`}`)
process.exit(failures === 0 ? 0 : 1)
