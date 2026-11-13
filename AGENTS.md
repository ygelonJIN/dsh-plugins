# 插件仓库

## 读取规则
- 改任何插件前，先读 `经验文档/` 里对应的文件（索引见下）。
- 判断不了属于哪个领域，就把 `经验文档/` 全读一遍。
- 删除插件、改 profile 链接之前，必须先读对应文件，禁止凭印象执行。

## 是什么
DSH 本地插件源码仓库。每个插件子目录是一个独立 npm 包（`@local/*`），用 `plugin_manager`
的 `install_bundle` 以 `link:` 方式装进当前 profile。另有 `profile/`（配置基准）和
`scripts/`（同步/恢复/体检）两个辅助目录，不是插件包。
本文件和 `经验文档/` 随仓库一起提交；仓库是公开的，别往里写 Key、密钥、客户信息。

## 目录
- `usage-cost/` — 输入框统计条：费用（峰谷定价）+ 工作区改动，含宿主投影与客户端 pill
- `workspace-ledger/` — 纯宿主插件：`/api/workspace-ledger.summary`，git 相对 HEAD + 会话分轮汇总
- `harness-period/` — 峰谷时段与节假日提示
- `approval-alert/` — 审批提醒：宿主监听 `approval/request`，vendor 通知器弹 macOS 横幅；名称/图标在 `vendor/DshNotifier.app`（图标用皮肤品牌 mark，不是插件 icon；改完要 ad-hoc 重签，权限可能重置一次）；启动跑 `-diagnose`，通知权限被拒会写进自检。Dock 图标插件改不了，见经验文档「系统通知与 Dock」
- `session-delete/` — 侧栏「…」菜单删除对话：宿主校验 + 删会话目录/缓存；使用中的会话先归档并排队，下次启动再删除
- `session-undo/` — 会话撤回：预检只读会话事件；用户消息操作行入口（复制右侧）；fork 到切点（第 1 轮新建空白），被撤消息回到输入框、清掉继承目标，归档删旧；只撤对话，不碰文件
- `skin/` — Ygelon 品牌皮肤 + 外观中心：侧栏标志与名称、空会话标志和标语、浏览器标题和 favicon；设置 → 插件 →「外观」= 目标胶囊（主色 / 侧栏文件区 / 对话区 / 卡片 / 嵌套卡片 / 输入框 / 气泡）+ 一张可拖的全色相 OKLCH 色域图 + 浓度带，选色就派生成套品牌色阶，颜色值也能直接输入（`#rrggbb` 或 `oklch(...)`）；每个背景面（侧栏、对话区、卡片、嵌套卡片、输入框、气泡）都有一条透明度滑条：侧栏和对话区要覆盖官方写死的那层（macOS 半透明压在原生 vibrancy 上，调过才注入规则），输入框上方那条渐隐遮罩（composerSeat 的 36px 渐变）是独立一项、只给透明度滑条，其余的把透明度直接折进 token 值，默认跟官方一致（气泡例外：不透明纯白）；同页可改品牌名称、标语、图标路径，名称两段、品牌图标、侧栏行动作图标（省略号/置顶/归档）各有一个直接着色目标；表面表加一行就多一个可调区域（含菜单/弹层、代码块/行内代码、sidebar-marks 的工作区卡片底色/描边、侧栏两档行底色，都靠 body 上的自有变量覆盖），纯客户端（工作区色带已删除；悬停卡片不接管——官方 0.2.2-rc.2 起是两套配色都深色的键帽，`OVERLAY_RULES` 已退役，见经验文档「浮层不止一套材质」）
- `sidebar-marks/` — 侧栏标注：会话/工作区「…」菜单的标记 = 名称底部黑色下划线（点一下标记、再点取消，无弹窗）；展开的工作区组一张悬浮卡片：发丝描边 + 淡底 + 轻阴影（苹果质感，折叠不画框），运行中的工作区转圈 + 数字（只有一个转圈）；当前会话行不透明纯白底最显著、无竖条（三重属性 + !important 保证选中永远赢），运行中的会话/工作区行一层 50% 透明白淡底。工作区置顶功能已删除
- `self-check/` — 自检面板 + 启动对账：设置 → 插件里的「自检」页签读 `localStorage['dsh.self-check']` 汇总客户端锚点异常，并通过宿主路由 `/api/self-check.host` 读 `~/.dsh/storages/self-check/*.json` 的纯宿主结果；启动只比对 `CLIENT`（9 个有客户端半的插件）和 `__DSH_BOOT__.release.version`，DSH 升级了或有客户端插件没加载就在右下角弹一条（`CLIENT`/`HOST` 加删要同步）；「重新检查」广播 `dsh-self-check:run` 让各插件重跑探针。宿主半 `index.js` 改完要重装；`node test/watch.test.mjs && node test/host.test.mjs`
- `prompt-inject/` — 系统提示文本附加器 + 开关：一个 `systemPrompt` section（`order: -99990`，排在官方 `HARNESS_IDENTITY: -1000` 之前），`text` 是函数、**每轮组装时读一次**，所以改正文/切开关下一轮就生效、不用重启；设置 → 插件 →「系统提示」页签里编辑正文，「应用」= 存正文并开启、「还原」= 只关闭（正文保留，随时再开）。**正文与开关就在包根**：`prompt.md`（进仓库）+ `state.json`（`.gitignore` 挡住）；`README.md` / `AGENTS.md` 写契约与排障，`node test/smoke.mjs` 18 项自测用临时 fixture；宿主半三路由 `/prompt-inject/{status,text,enabled}`，`last_inject` 是判断是否真生效的唯一硬证据
- `cookie-clean/` — 设置 → 插件 →「Cookie 清理」页签：桌面客户端每次启动按随机端口生成一条 `dsh-auth-<hash(host:port)>` cookie 且从不删旧的（只按 30 天到期），Chromium 把 127.0.0.1 的 cookie 全塞进同一个请求头，攒到约 70 条就超过 Node 的 16 KiB 上限、Host 回 431、外壳报 `desktop welcome: Web authentication failed`（启动失败不可重试）；宿主半用 `node:sqlite` 按 `webServer.port` 重算当前 cookie 名并排除，只删端口已不存在的条目，别的 host 与 `dsh-auth-` 以外的 cookie 一律不碰，结果写 `~/.dsh/storages/cookie-clean/last.json`；撞并发写返回 409 `busy` 而不是写坏库；`node test/smoke.mjs` 16 项（假 ctx + 临时库），**要用桌面自带的 Node 24 跑**（系统 Node 20 没有 `node:sqlite`）
- `ida-mcp-bridge/` — 空壳包，把外接盘的 `ida-mcp`（headless IDA 的 stdio MCP 服务器）挂进 DSH：没有 `apply()` 逻辑，只有一条 bundle patch，用官方 `@deepseek-ai/dsh-mcp-client` 拉起 `/Volumes/TUF ESD-T1A Media/ida-mcp/.venv/bin/python -m ida_pro_mcp.idalib_supervisor --stdio --unsafe`，工具名 `mcp__ida__*`（66 个）；服务器本体（venv + `idausr` + IDA 数据库，约 1.1 G）不在仓库；**卷名带空格，不能用 `.venv/bin/idalib-mcp` 的 shebang**（内核按空格截断成 `/Volumes/TUF`），必须走 `python -m`；盘没挂载时整组工具不出现，DSH 照常启动
- `dify-dsl-skill/` — 纯宿主插件：把 Dify DSL 技能挂进 DSH 技能目录（技能名 `dify-workflow-dsl`），正文 `assets/SKILL.md`，资源基底 `assets/`（9 篇 references + 10 个 1.16 示例 + `scripts/validate_dsl.py` 版本感知校验器）；装完在编辑器输入 `/dify-workflow-dsl` 调用，模型处理 Dify YAML 时自动选中；rank 600 直接写字面量、不 import `@deepseek-ai/dsh-skill`，避免 link 包解析不到宿主内部包；校验器要 Python ≥3.10 + PyYAML（系统 3.9 不行，用 `~/.venv-macos27`）；技能内容从 `~/.codex/skills/dify-workflow-dsl` 同步，改完跑 `node test/smoke.mjs`
- `hermes-plugins/` — Hermes Agent 的插件（不是 DSH 插件包，别用 `plugin_manager` 装）：`prompt-inject/` = 把正文注入 Hermes 提示词，三条通道：section（`register_system_prompt_section`，每会话一次、≤4000）/ turn（`pre_llm_call`，下一轮生效）/ soul（托管块写进 `~/.hermes/SOUL.md` 顶部，第一块、无 4k 上限、压缩不丢）；带 `/prompt-inject` 斜杠命令与 `hermes prompt-inject` CLI（`soul on|off|sync`、`source` 共享正文）；装法 = 软链进 `~/.hermes/plugins/` + `hermes plugins enable prompt-inject`，日常开关走会话里的 `/prompt-inject on|off|status`（插件常驻 enabled，开关在 state.json；删软链即可，`~/.local/bin/hermes` 启动器守卫会在插件缺失/停用时用 SOUL.original.md 还原），数据在 `~/.hermes/prompt-inject/`，`python3 test/smoke.py` 61 项假 ctx 自测
- `profile/` — 可推送的 profile 配置基准（`package.json` 路径脱敏成 `{{REPO}}` + `cordis.patch.yml`），不装、不改名
- `scripts/` — `profile-sync.sh`（现状→基准）、`profile-restore.sh`（基准→现状，默认只补不删）、`doctor.sh`（漂移 + 插件真加载没）、`check-clients.sh`（exports/声明/语法闸门）、`check-prompt-inject.sh`（prompt-inject 专用体检：文件/profile 三处/软链/自测/宿主 status，一条命令出结论）

## 经验索引
- `经验文档/插件开发.md` — 什么时候读：新增插件、改宿主或客户端、写会话投影、安装/重装/卸载、官方升级后失效、升级后体检、插件"神秘消失"或界面白屏、换机重建 profile、改侧栏行的样式或菜单、改界面颜色或换主色、判断“改完为什么没生效”、卸载后还有残留、启动报 `Web authentication failed` 或 431、宿主莫名重启或崩溃报告只有 `host stopped`、要连宿主调试端口做探针 / 包含：包结构、两半差别、运行环境与生效方式（桌面客户端 / dsh-app origin / 重载）、投影计费时刻、安装流程、会话删除与菜单槽位、配色 token 与色阶派生、侧栏面板入口与更多菜单、侧栏行锚点与标注、配置基准与恢复、体检与四条消失路径、本地认证 cookie 累积与 431、宿主猝死判定与活体探针、坑 / 不用读：只改文案、图标

## 经验索引（续）
- `经验文档/版本快照.md` — 什么时候读：DSH 升级后插件失效、要回滚到已知可用状态、换机重建、怀疑插件被改过 / 包含：DSH 0.2.1-rc.3 环境表、prompt-inject 全部文件的 sha256、正文 sha256、profile 关键配置、两个上游 API 依赖点、回滚四步、校验命令 / 不用读：日常改提示词

## 禁止
- 不手工改 `~/.dsh/profiles/*/package.json` 或 `node_modules`，一律走 `plugin_manager`；
  唯一例外是 `scripts/profile-restore.sh`（事故恢复/换机），改完必须跑 `scripts/doctor.sh` 复查
- 不提交 `node_modules/`
- 不把 Key、密钥、客户隐私写进代码、文档或提交信息
