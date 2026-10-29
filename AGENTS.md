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
- `skin/` — Ygelon 品牌皮肤 + 外观中心：侧栏标志与名称、空会话标志和标语、浏览器标题和 favicon；设置 → 插件 →「外观」= 目标胶囊（主色 / 侧栏文件区 / 对话区 / 卡片 / 嵌套卡片 / 输入框 / 气泡）+ 一张可拖的全色相 OKLCH 色域图 + 浓度带，选色就派生成套品牌色阶，颜色值也能直接输入（`#rrggbb` 或 `oklch(...)`）；每个背景面（侧栏、对话区、卡片、嵌套卡片、输入框、气泡）都有一条透明度滑条：侧栏和对话区要覆盖官方写死的那层（macOS 半透明压在原生 vibrancy 上，调过才注入规则），输入框上方那条渐隐遮罩（composerSeat 的 36px 渐变）是独立一项、只给透明度滑条，其余的把透明度直接折进 token 值，默认跟官方一致（气泡例外：不透明纯白）；同页可改品牌名称、标语、图标路径，名称两段、品牌图标、侧栏行动作图标（省略号/置顶/归档）各有一个直接着色目标；表面表加一行就多一个可调区域（含菜单/弹层、代码块/行内代码、sidebar-marks 的工作区卡片底色/描边、侧栏两档行底色，都靠 body 上的自有变量覆盖），纯客户端（工作区色带已删除）
- `sidebar-marks/` — 侧栏标注：会话/工作区「…」菜单的标记 = 名称底部黑色下划线（点一下标记、再点取消，无弹窗）；展开的工作区组一张悬浮卡片：发丝描边 + 淡底 + 轻阴影（苹果质感，折叠不画框），运行中的工作区转圈 + 数字（只有一个转圈）；当前会话行不透明纯白底最显著、无竖条（三重属性 + !important 保证选中永远赢），运行中的会话/工作区行一层 50% 透明白淡底。工作区置顶功能已删除
- `self-check/` — 自检面板 + 启动对账：设置 → 插件里的「自检」页签读 `localStorage['dsh.self-check']` 汇总客户端锚点异常，并通过宿主路由 `/api/self-check.host` 读 `~/.dsh/storages/self-check/*.json` 的纯宿主结果；启动只比对 `CLIENT`（9 个有客户端半的插件）和 `__DSH_BOOT__.release.version`，DSH 升级了或有客户端插件没加载就在右下角弹一条（`CLIENT`/`HOST` 加删要同步）；「重新检查」广播 `dsh-self-check:run` 让各插件重跑探针。宿主半 `index.js` 改完要重装；`node test/watch.test.mjs && node test/host.test.mjs`
- `prompt-inject/` — 系统提示文本附加器 + 开关：一个 `systemPrompt` section（`order: -99990`，排在官方 `HARNESS_IDENTITY: -1000` 之前），`text` 是函数、**每轮组装时读一次**，所以改正文/切开关下一轮就生效、不用重启；设置 → 插件 →「系统提示」页签里编辑正文，「应用」= 存正文并开启、「还原」= 只关闭（正文保留，随时再开）。**正文与开关就在包根**：`prompt.md`（进仓库）+ `state.json`（`.gitignore` 挡住）；`README.md` / `AGENTS.md` 写契约与排障，`node test/smoke.mjs` 18 项自测用临时 fixture；宿主半三路由 `/prompt-inject/{status,text,enabled}`，`last_inject` 是判断是否真生效的唯一硬证据
- `for-free/` — 免 Key 免费模型接入（`dsh-our-free-model` 2.7.2 的精简衍生）：两条车道 = opencode 免费车道（`src/upstream.js` 里的客户端指纹 + `/inference/v1/{chat/completions,responses,messages}` 三线形）+ Kilo 免费池（`api.kilo.ai`，零凭据）；选择器里分组「For Free」/「For Free · region-limited」，设置 → 插件 →「For Free」一页：模型清单、刷新清单、检测可用性（手动才跑，会花额度）、总开关、地区模型开关、刷新间隔与输出上限；数据在 `~/.dsh/for-free/`；路由前缀 `/api/for-free`（summary / refresh / settings）；`node test/smoke.mjs` 13 项（假 ctx，不碰 `~/.dsh`）、`node test/live.mjs` 实网看两条车道能不能出正文；已删掉原包的账号渠道 / EAC / Key 聚合 / 本地网关 / 出口中继 / 降级链 / 省 Token / 公告 / 自升级 / 11 页 UI（那些模块留空实现，只为不改 adapter 与 runtime）；**上游更新走 `scripts/upstream-diff.mjs`（只读报告：版本/19 个文件/12 项指纹/补丁预演/结构）+ `upstream-sync.mjs --apply`（白名单同步 + `scripts/patches.mjs` 重放，同版本必须 0 变化）**；反代在设置页填 `opencodeBase` / `kiloBase`，样板与断言见 `test/relay.mjs`
- `hermes-plugins/` — Hermes Agent 的插件（不是 DSH 插件包，别用 `plugin_manager` 装）：`prompt-inject/` = 把正文注入 Hermes 提示词，三条通道：section（`register_system_prompt_section`，每会话一次、≤4000）/ turn（`pre_llm_call`，下一轮生效）/ soul（托管块写进 `~/.hermes/SOUL.md` 顶部，第一块、无 4k 上限、压缩不丢）；带 `/prompt-inject` 斜杠命令与 `hermes prompt-inject` CLI（`soul on|off|sync`、`source` 共享正文）；装法 = 软链进 `~/.hermes/plugins/` + `hermes plugins enable prompt-inject`，日常开关走会话里的 `/prompt-inject on|off|status`（插件常驻 enabled，开关在 state.json；删软链即可，`~/.local/bin/hermes` 启动器守卫会在插件缺失/停用时用 SOUL.original.md 还原），数据在 `~/.hermes/prompt-inject/`，`python3 test/smoke.py` 61 项假 ctx 自测
- `profile/` — 可推送的 profile 配置基准（`package.json` 路径脱敏成 `{{REPO}}` + `cordis.patch.yml`），不装、不改名
- `scripts/` — `profile-sync.sh`（现状→基准）、`profile-restore.sh`（基准→现状，默认只补不删）、`doctor.sh`（漂移 + 插件真加载没）、`check-clients.sh`（exports/声明/语法闸门）、`check-prompt-inject.sh`（prompt-inject 专用体检：文件/profile 三处/软链/自测/宿主 status，一条命令出结论）

## 经验索引
- `经验文档/插件开发.md` — 什么时候读：新增插件、改宿主或客户端、写会话投影、安装/重装/卸载、官方升级后失效、升级后体检、插件"神秘消失"或界面白屏、换机重建 profile、改侧栏行的样式或菜单、改界面颜色或换主色、判断“改完为什么没生效”、卸载后还有残留、改免费模型接入（for-free）或免费车道失效 / 包含：包结构、两半差别、运行环境与生效方式（桌面客户端 / dsh-app origin / 重载）、投影计费时刻、安装流程、会话删除与菜单槽位、配色 token 与色阶派生、侧栏面板入口与更多菜单、侧栏行锚点与标注、配置基准与恢复、体检与四条消失路径、免费模型接入（两条车道、指纹失效史、429/403 分类）、坑 / 不用读：只改文案、图标

## 经验索引（续）
- `经验文档/版本快照.md` — 什么时候读：DSH 升级后插件失效、要回滚到已知可用状态、换机重建、怀疑插件被改过 / 包含：DSH 0.2.1-rc.3 环境表、prompt-inject 全部文件的 sha256、正文 sha256、profile 关键配置、两个上游 API 依赖点、回滚四步、校验命令 / 不用读：日常改提示词

## 禁止
- 不手工改 `~/.dsh/profiles/*/package.json` 或 `node_modules`，一律走 `plugin_manager`；
  唯一例外是 `scripts/profile-restore.sh`（事故恢复/换机），改完必须跑 `scripts/doctor.sh` 复查
- 不提交 `node_modules/`
- 不把 Key、密钥、客户隐私写进代码、文档或提交信息
