# @local/prompt-inject

一个 DSH 宿主插件 + 一个设置页签：把一段文本作为系统提示词的**第一段**注入，并且可以随时关掉。

- **正文与开关就在包根**：`prompt.md`（正文）、`state.json`（`{"enabled":true}`）。
  目录由 `cordis.patch.yml` 的 `config.dir` 指定，默认指向包自身，所以插件可以整目录搬走。
- 机制与数据分文件：修代码只需要 `index.js` / `client.js`，`prompt.md` 是用户文本。

## 为什么 text 是函数

`systemPrompt.section({ text })` 的 `text` 允许是函数，宿主**每次组装提示词都会调用一次**。
这一点是整个设计的支点：

```
改 prompt.md        → 下一轮生效（不用重启）
点「还原」写 state  → 下一轮生效（不用重启）
```

返回 `""` 时，渲染层会把这个 section 过滤掉（`renderPrompt` 只收 `text.length > 0`），
所以"关闭"就是返回空串，不需要注销 section。

## 契约

### 宿主半 `index.js`

```js
export const name = '@local/prompt-inject'
export const inject = ['systemPrompt']          // webServer 走延迟注入，避免它晚到导致整插件 pending
export function apply(ctx, config) {
  configuredDir = normalizeDir(config.dir)      // 数据目录
  ctx.systemPrompt.section({
    name: 'prompt-inject',
    order: -99990,                              // 官方最靠前的是 -1000（HARNESS_IDENTITY）
    interpolate: false,                         // 正文原样输出，不做 {{变量}} 插值
    text: () => composeSectionText(),           // ← 每轮调用
  })
  ctx.inject(['webServer'], host => { /* 三条路由 */ })
}
```

双宿主注册：`systemPrompt` 服务同时挂在 `ctx` 和 `ctx.systemPrompt.ctx` 上（后者在代理场景下才存在），
所以 `addSection()` 会对两个宿主都尝试一次，`already registered` 视为成功。

三条路由（同源校验：仅当请求带 Origin 且与 Host 不同源时返回 403；无 Origin 直接放行，与宿主其它插件路由一致）：

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/prompt-inject/status` | `{enabled, chars, inject_chars, last_inject, path, dir, available}` |
| GET/POST | `/prompt-inject/text` | 读 / 写 `prompt.md`（POST body `{text}`） |
| GET/POST | `/prompt-inject/enabled` | 读 / 写 `state.json`（POST body `{enabled}`） |

`last_inject` = `{at, chars, enabled}`，每次 `text()` 被调用时更新。**它是"注入是否真的发生"的唯一硬证据**：
时间戳停住不动 = 宿主没在组装（或 section 没注册上）。

### 客户端半 `client.js`

通过 `ctx.slots.register({ name: 'settings.plugins.tab', id: 'prompt-inject', order: 30, label, locale }, Tab)`
注册"设置 → 插件 → 提示词"页签。页面只做四件事：显示状态、编辑正文、保存、开关。

## 失效模式与修法

| 症状 | 最可能的原因 | 修法 |
|---|---|---|
| 设置里没有「提示词」页签 | 包没加载：`bundles` 里没它、`cordis.patch.yml` 没 insert、或 link 断了 | 见仓库 `scripts/doctor.sh` |
| 页签在，`last_inject` 一直是 `null` | `ctx.systemPrompt.section()` 调不通（宿主 API 改名/改签名） | 对照宿主 `@deepseek-ai/dsh-system-prompt` 的 `section()` 签名改 `addSection()` |
| 页签在，但显示"正文目录不可用" | `config.dir` 指错了，或该目录所在卷没挂载 | 检查 `config.dir`；目录不存在时插件**不崩**，只是注入空串 |
| 注入生效但内容不对 | 注入内容不对 | `prompt.md` 被改过 —— 那是数据，不是代码问题 |
| 一开 DSH 就报插件 pending | 顶层 `inject` 里写了宿主没有的服务 | 保持 `inject: ['systemPrompt']`，其它服务一律用 `ctx.inject([...], cb)` 延迟注入 |

## 测试

```bash
node test/smoke.mjs
```

用临时目录造 fixture，构造假 `ctx`，验证：section 注册参数、开关行为、ChatML 剥除、`last_inject` 更新。
**不读、不依赖任何真实正文。**
