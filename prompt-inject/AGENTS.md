# 维护须知

这是一个**通用的系统提示词注入器**：注册一个 `systemPrompt` section，正文每轮从一个外部目录读取，带一个开关。

同目录下有两份**数据文件**：`prompt.md`（用户正文）、`state.json`（开关）。它们由 `cordis.patch.yml` 的
`config.dir` 指向（默认就是本目录），换目录不用改代码。所以：

- 改机制（`index.js` / `client.js`）不需要读 `prompt.md`
- 数据目录缺失、为空、内容任意，插件行为都有定义（见下）
- `test/smoke.mjs` 自带 fixture，跑它就能确认机制没坏

## 两个外部接缝

只有这两处依赖宿主，宿主升级导致失效也只会是这两处：

### 1. `ctx.systemPrompt.section(spec)`

```js
ctx.systemPrompt.section({
  name: 'prompt-inject',
  order: -99990,
  interpolate: false,
  text: () => composeSectionText(),   // 可以是函数：每次组装提示词都会调用
})
```

- `order`：官方 `SECTION_ORDERS` 里最靠前的是 `HARNESS_IDENTITY: -1e3`，所以负数即可排到第一段
- `interpolate: false`：正文原样输出，不做 `{{变量}}` 插值（正文里出现花括号也不会报错）
- `text` 返回 `""` 时，`renderPrompt` 会过滤掉整个 section，等于"关闭"
- 注册可能抛 `already registered`（同一 section 名重复注册），按成功处理
- `systemPrompt` 服务同时挂在 `ctx` 与 `ctx.systemPrompt.ctx` 上（代理场景），`addSection()` 会对两个宿主各试一次

### 2. `ctx.slots.register({ name: 'settings.plugins.tab', ... }, Tab)`

```js
ctx.slots.register({
  name: 'settings.plugins.tab',
  id: 'prompt-inject',
  order: 30,
  label: () => translate('tab.label'),
  locale: NS,
}, PromptTab)
```

客户端半用 `ctx.locale.register(NS, DICTS)` 注册中英词条；`window.__ModuleLoader__.load({ id, factory })` 是客户端插件的入口格式。

宿主侧路由用 `ctx.inject(['webServer'], host => host.webServer.register({ kind: 'exact', path, handler }))`。
**不要把 `webServer` 写进顶层 `inject`** —— 它晚到会让整个插件 pending。

## 数据目录的四种情形

| 情形 | 行为 |
|---|---|
| 目录存在、`prompt.md` 有内容、`state.json` 缺失或 `enabled !== false` | 正常注入 |
| `state.json` 里 `enabled: false` | 注入空串；`prompt.md` 不删 |
| `prompt.md` 不存在 / 为空 | 注入空串，不报错 |
| `config.dir` 整个不存在（例如外接卷没挂载） | 注入空串，不报错；`/status` 里 `available: false` |

正文里的 `<|im_start|>system:` / `<project_instructions>` / `<|im_end|>` 会被 `stripChatmlWrapping()` 剥掉，
避免在宿主提示词里形成第二套未闭合信封。

## 验证

```bash
node test/smoke.mjs
```

18 项断言，覆盖：section 参数、开关两种状态、ChatML 剥除、`last_inject` 更新、目录缺失不抛。
用临时目录造 fixture，**不读真实数据**。

## 排障顺序

1. `./scripts/doctor.sh`（仓库根）—— 插件在不在配置树里、能否解析
2. 看宿主日志里有没有 `[prompt-inject] section "prompt-inject" 已注册`
3. `curl http://127.0.0.1:<port>/prompt-inject/status` —— `last_inject.at` 是否在走
4. `last_inject` 一直是 `null` → `section()` 没调通 → 对照宿主 `@deepseek-ai/dsh-system-prompt` 的 `section()` 签名
