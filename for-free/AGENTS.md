# for-free 维护须知

免 Key 免费模型接入：两条车道（opencode 免费车道 / Kilo 免费池）+ 一页设置面板。
源码是从 `dsh-our-free-model` 2.7.2（MIT）精简衍生过来的，所以大部分协议代码带着原包的注释——
**那些注释是上游实测记录，不要删**。

## 与内核只有两个接缝

1. `ctx.llm.registerAdapter([ROUTE_MAIN, ROUTE_REGION], adapter)`（`index.js`）
2. `ctx.inject(['webServer'], …)` 里挂 `/api/for-free` 前缀路由（`index.js`）

内核升级后插件失效，先看这两处。`inject` 顶层只有 `['llm']`，**不要把 `webServer` 写进顶层**。

客户端半只有一处：`ctx.slots.register({ name: 'settings.plugins.tab', id: 'for-free' }, …)`。
它不往界面加胶囊、按钮、公告。

## 目录

| 路径 | 说明 |
|---|---|
| `index.js` | 宿主半：注册适配器、后台刷新、3 条 HTTP 路由 |
| `client.js` | 客户端半：设置页一页（清单 / 刷新 / 开关 / 设置） |
| `src/upstream.js` | opencode 免费车道的指纹与三线形端点（**上游变了改这里**） |
| `src/kilo.js` | Kilo 免费池（公开网关，通常不用动） |
| `src/adapter.js` | 适配器：listModels / resolveModel / stream |
| `src/core/runtime.js` | 目录合并、membership、探测、刷新 |
| `src/store.js` | settings / stats / availability / catalog 四个 JSON 存储 |
| `src/effort.js` | 思考档位与预算阶梯 |
| `src/egress.js` | 直连版出口（同名导出，永远直连） |
| `src/combos.js` | 降级链（上游原样搬，进 SYNC_FILES）：`comboChain` 决定候选顺序 |
| `src/{eac,aggregate,subscription-adapter,token-saver}.js` | 已删车道的空实现，保持 adapter 与 runtime 不改 |
| `test/smoke.mjs` | 假 ctx 起宿主半身，13 项断言（不碰 `~/.dsh`） |
| `test/live.mjs` | 实网：两条车道各发一次请求，打印正文与失败分类 |
| `test/fallback.mjs` | 降级实测：单模型 429 整轮失败 vs 链自动换（会花一点 Kilo 额度） |

## 状态怎么判定

- **可用性来自实测**：`src/probe.js` 对每个模型发一次最小请求，`429` 是 `throttled`、
  `403 RegionError` 是 `region-blocked`、`403 FreeTierError` 是 `unavailable`。
- **不自动探测**：后台只刷新清单（`probe: false`），探测只在设置页点「检测可用性」时跑。
- **Kilo 行不探测**：它的健康就是清单那一轮的健康（`entry.channel === 'kilo'`）。
- **地区受限模型**默认单独分组；关掉 `exposeRegionModels` 就不显示。

## 车道挂了怎么判断

| 现象 | 原因 | 改哪里 |
|---|---|---|
| 全 429 `FreeUsageLimitError` | 本出口额度用完，或上游收紧匿名额度 | 换出口；代码改不动 |
| 403 `FreeTierError` | 指纹过不去（UA / 请求头 / 工具定义 / 会话编码） | `src/upstream.js` 头部注释有历次实测，照最新的改 |
| 403 `RegionError` | 地区策略 | 换出口 |
| 清单空 / 404 | 端点搬家 | `endpointFor()` 与 `UPSTREAM_BASE` |
| Kilo 清单空 | 网关改路径 | `KILO_BASE`，仍是 `https://api.kilo.ai/api/gateway` |

改完宿主半要 `remove_bundle` + `install_bundle`（或重装 profile）；客户端半刷新页面即可。

## 验证

```bash
node test/smoke.mjs          # 必须全绿再提交
node test/live.mjs           # 看两条车道现在能不能出正文
bash scripts/check-clients.sh for-free   # 仓库根：exports/语法/声明闸门
```

## 不要做的事

- 不要把被删的功能（账号渠道、EAC、Key 聚合、本地网关、自升级）搬回来——那是另一个插件。
- 不要改 `src/upstream.js` 里的 `FINGERPRINT_TOOL_DEFINITIONS` 措辞：上游逐字比对 description 与 schema。
- 不要把 `kilo-auto/free` 之类的路由模型写死进目录：Kilo 的清单每次刷新都可能变。
- 不要在设置页显示上游原文错误：那是几百字 English 报错，压成状态码 + 一句人话。

## 上游更新（这是本插件最常做的维护）

```bash
node scripts/upstream-diff.mjs <新包目录>          # 只读：版本/文件/指纹/补丁预演/结构
node scripts/upstream-sync.mjs <新包目录> --apply  # 白名单同步 + 重放补丁 + 更新基线
node test/smoke.mjs && node test/relay.mjs && node test/live.mjs
```

- `scripts/patches.mjs` 是**我们与上游的全部差异**：`find` 永远匹配上游原文，`replace` 是我们要的样子。
  上游一旦改了那段，补丁失败（diff 指到具体条目，sync 拒绝写那个文件并以退出码 2 报告）。
- 加功能时：**先改代码、跑通、再把改动回落成一条补丁**。只改代码不留补丁，下次同步被覆盖。
- `upstream.lock.json` 由 sync 生成，别手改：它记上游版本、20 个文件的上下游哈希、12 项指纹快照。
  同一版本重跑 sync 必须报 0 个变化（幂等）；不 0 就是补丁和代码又偏了。
- 白名单只有 `SYNC_FILES` 那 20 个；我们自己的 stub、`index.js`、`client.js`、测试、文档不参与同步。
- 只读两个文件的判断，不要把上游代码 import 进来跑：`scripts/lib.mjs` 全部用正则取事实。

## 反代（直连被限流/地区拦住时）

- 设置页两个字段：`opencodeBase` / `kiloBase`（空 = 官方）。优先级：设置 > 环境变量 `FOR_FREE_BASE`/`FOR_FREE_KILO_BASE` > 官方。
- 转发端只要做到「路径原样、头原样、体原样」。改写 UA / authorization / `x-opencode-*` 任何一个头 = 403。
- 样板与断言在 `test/relay.mjs`（本地起转发服务器，验证指纹头穿透）。改反代行为后先跑它。
- 换地址后插件会自动按新 base 重拉一次清单（`index.js` 的 settings 分支）。

## 额度信息：能拿到的与拿不到的

- **拿不到**：剩余配额数字。上游两家都不提供。别做「剩余 37%」这类界面，做不出来。
- **opencode 车道**：额度按出口/池计（一个模型 429 = 整条车道 429），429 带 `Retry-After`。
  `http.js` 已把它读成 `providerRetryAfterMs` → `probe.js` 换算 `resetAt` → `runtime` 落盘
  → `modelAvailability` 带出 → 设置页显示「约 HH:MM 恢复」。改这条链时五处要一起动。
- **Kilo 免费池**：无配额，只有速率；200 响应头里没有任何 rate-limit 字段，别去解析。
- **本地用量**来自 `stats.json`（`buildStats` 汇总），`index.js` 的 `usageSummary()` 直接喂给设置页。
- 探测只打 opencode 免费模型（`probeable` 过滤掉 kilo），因此「检测可用性」不会为 Kilo 花额度。

## 自动链（combo:auto）

- 插件启动和每次刷新后调 `syncAutoChain()`（`index.js`）：把真实模型按
  「可用 > 未检测 > 地区受限 > 额度受限 > 不可用，同档 Kilo 在前」排序，**每条车道各取前 6 个**，
  写成 `settings.combos` 里的 `combo:auto`（名字「自动」）。写完后调 `runtime.syncAggregateCatalog()`
  重建目录——那个方法原名是聚合车道用的，但就是「重合并目录、不发网络」，直接复用。
- 真正干活的是 `src/adapter.js` 的 `runCombo` + `src/combos.js` 的 `comboChain`（后者是从上游原样搬的，
  已进 `SYNC_FILES`）。commit 规则：**正文 delta 之前失败 → 整段丢弃、换下一个；正文之后失败 → 正常失败**。
  思考 delta 不算正文（"想了很久才撞墙"正是最该换的场景）。
- 额度用完的行为：429 不在 `providerRetryPolicy().retryableCodes` 里，整轮立刻以错误结束，不重试、不挂起；
  会话与文件都在，换模型说「继续」就能接着做。有了自动链，正文前失败会先换掉。
- 链成员必须真实存在于当前目录：`buildComboCatalog` 会丢掉不存在的成员（链短了而不是报错）。
- 排序改动要顺手看 `test/smoke.mjs` 里「自动降级链进了目录」那条断言，它打印整条链，一眼能看出顺序对不对。
- 验证降级本身用 `node test/fallback.mjs`：对照组（单模型 429 整轮失败）+ 链（自动换、调用方无感）。
