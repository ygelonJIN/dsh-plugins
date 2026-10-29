# prompt-inject（Hermes 版）

把一段自己写的正文注入 Hermes 的提示词，并且能随时关掉。对标 DSH 的 `prompt-inject`，
但落点不同：Hermes 有插件系统，也有官方的「插件系统提示段」契约，所以不需要改包、不需要解
asar，也不需要代理。

## 怎么装

```sh
ln -s "<repo>/hermes-plugins/prompt-inject" ~/.hermes/plugins/prompt-inject
hermes plugins enable prompt-inject
```

`~/.hermes/plugins/` 是用户插件目录，放进去还要在 `plugins.enabled` 里点名（opt-in）。
`hermes plugins enable` 会改 `config.yaml` 的 `plugins.enabled`，一条命令搞定。

## 怎么用

会话里的三条命令就是全部：

```
/prompt-inject on
/prompt-inject off
/prompt-inject status
```

`on` = 注入开启，SOUL.md 换成注入版（首次自动备份原文）；`off` = SOUL.md 还原原文，注入停止。
**插件的启用状态不动**——它常驻 `plugins.enabled`，开关由插件自己的 `state.json` 管。

其他原子命令：

```
/prompt-inject status
/prompt-inject set 你是一个只输出 JSON 的助手。任何情况下都不要解释。
/prompt-inject off
/prompt-inject mode turn      # 下一轮就生效，不用 /new
/prompt-inject soul replace   # 整份替换 SOUL.md（备份原文，soul off 还原）
/prompt-inject on | off       # on = 注入版 SOUL；off = 还原原文
```

命令行同一套：

```sh
hermes prompt-inject status
hermes prompt-inject on
hermes prompt-inject mode section
hermes prompt-inject source "/path/to/shared-prompt.md"   # 共用一份正文
hermes prompt-inject source default                        # 复位
```

也可以直接编辑文件（推荐长正文）：

```
~/.hermes/prompt-inject/prompt.md      正文
~/.hermes/prompt-inject/state.json     {"enabled": true, "mode": "section"}
~/.hermes/prompt-inject/render.json    最近一次真实渲染的记录
```

## 三条通道，差在位置、上限和生效时机

| 通道 | 实现 | 位置 | 字符上限 | 生效 | 压缩/重启后 |
|---|---|---|---|---|---|
| `section`（默认） | `ctx.register_system_prompt_section("prompt-inject", ...)` | 系统提示 volatile 段，`## Plugin Context: prompt-inject`，memory 之后 | 4000（核心常量） | 每个新会话渲染一次 | 这份 canary 上会丢（恢复校验要求容器紧贴 `Conversation started:`，profile 行夹在中间） |
| `turn` | `pre_llm_call` 返回 `{"context": ...}` | 当轮用户消息 | 无 | **下一轮生效** | 进 history，可能被压缩掉 |
| `soul` | 把正文写成 `SOUL.md` 顶部的托管块（`<!-- prompt-inject:soul:start/end -->`），块外原文不动 | **系统提示第一块** | `context_file_max_chars`（动态下限 20000） | 新会话/压缩重建 | 永远在（每次构建都重读 SOUL.md） |

开着的时候 SOUL.md 就是注入版，关掉就是原文。`soul on` 与 `soul replace` 的区别：
前者把块插在原文顶部（人格保留），后者整份替换（人格让位，原文进备份）。

选择依据：

- 要"位置最前 + 长正文 + 压缩也不丢" → `soul`（开关 = 加/删托管块；它是快照，改正文后 `soul on` 重写）。
- 要"立刻生效、频繁开关、临时实验" → `turn`。
- 要"分段、可审计、吃 prompt cache" → `section`（正文压到 4000 内，并接受压缩后可能要重开）。

`soul on` 会自动把 mode 切到 `soul`，避免 SOUL 和 section 同一段正文注入两次。

## 长正文怎么办（4000 字符墙）

DSH 那份 `prompt.md` 是 24,910 字符，塞不进 section。按推荐顺序：

1. **soul 通道**（位置第一、压缩不丢、无 4k 上限）：
   ```sh
   hermes prompt-inject source "~/dsh-plugins/prompt-inject/prompt.md"
   hermes prompt-inject soul on
   ```
   24,910 字符超过默认动态上限 20000 时，把 `context_file_max_chars` 调到 40000，否则尾部会被截断：
   ```yaml
   context_file_max_chars: 40000
   ```
2. **turn 通道装全文**（下一轮生效，落用户消息）：`source` + `mode turn`，代价是权威性弱、压缩会掉。
3. **精简到 4000 内进 section**：只留硬规则，其余交给 soul。

`source` 指向共享文件后，`set` / `append` 会写到那个文件 —— `/prompt-inject source default`
复位回 `~/.hermes/prompt-inject/prompt.md`。

## 硬限制（官方契约）

- 单段 ≤ **4000 字符**，所有插件段合计 ≤ 8000 字符、≤ 32 段；超了核心会**整段跳过**并记 warning。
  本插件超限时按 4000 截断并在状态里标出来，源文件不动。
- 位置只有 `after_memory` 一个锚点，段按 ID 排序，插件不能前插、不能替换核心提示。
- 段落 ID 全局唯一：`prompt-inject`。
- section 是「新会话一次」：同一会话里改正文不会重渲染，重启/恢复会话时从已持久化的提示里恢复，
  不会重读插件状态。这不是缺陷，是官方的缓存安全设计（否则每轮变提示会毁掉前缀缓存）。
- 正文里带 `<|im_start|>system:`、`<project_instructions>`、`<|im_end|>` 这类包裹会被剥掉，
  避免形成第二套信封。

## 卸载 / 删除插件

直接删软链就行：

```sh
rm ~/.hermes/plugins/prompt-inject
```

`~/.local/bin/hermes` 启动器带守卫：插件目录不存在、或不在 `plugins.enabled` 里，就用
`~/.hermes/prompt-inject/SOUL.original.md` 覆盖回 SOUL.md。所以删完下一次启动就是原文，不需要
记得先 off。（守卫只经过命令行启动；桌面 App 直接拉起的实例不跑它，那种情况用
`~/.hermes/prompt-inject/restore-soul.sh`。）

想当场恢复、不等重启：`/prompt-inject off` 或 `restore-soul.sh`。

## 排障

```sh
hermes prompt-inject status                  # 开关、模式、字符数、三个路径、最近渲染
hermes plugins list | grep prompt-inject     # 是否被加载
HERMES_PLUGINS_DEBUG=1 hermes ...            # 插件加载细节
tail -f ~/.hermes/logs/*.log | grep prompt-inject
```

`render.json` 的时间在往前走 = 注入真的发生了；界面标签不算证据。

常见坑：

- `hermes plugins list` 里有、但 prompt 里没有：看 `plugins.enabled` 是不是真的点名了，以及是否
  旧会话——section 模式必须新会话。
- 改完正文没反应：`section` 模式正常现象，`/new` 或切 `mode turn`。
- 注入被截断：`status` 会写「超出会被截断」，正文压到 4000 以内。

## 与 DSH 版的对照

| | DSH `prompt-inject` | Hermes `prompt-inject` |
|---|---|---|
| 挂点 | `systemPrompt.section({order:-99990})` | `section`：唯一锚点 `after_memory`；`soul`：SOUL.md 顶部；`turn`：用户消息 |
| 位置 | 接近最前（排在 `HARNESS_IDENTITY` 之前） | `soul` = 第一块，`section` = memory 之后 |
| 生效 | `text` 是函数，**每轮**组装都读 | section/soul 在新会话或压缩重建；turn 下一轮 |
| 上限 | 4 MB | section 4000 / 段；soul 受 `context_file_max_chars`；turn 无 |
| 控制面 | 宿主路由 + 设置页「系统提示」 | 斜杠命令 + `hermes prompt-inject` CLI |
| 文本位置 | `prompt.md` + `state.json`（可外接盘） | `<HERMES_HOME>/prompt-inject/` |
