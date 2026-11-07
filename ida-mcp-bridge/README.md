# @local/ida-mcp-bridge

把外接盘上的 `ida-mcp`（headless IDA 的 stdio MCP 服务器）挂进 DSH。

- **本包**：一个空壳插件 + 一条 `cordis.patch.yml`，没有运行时逻辑，约 1 KB。
- **服务器本体**：`/Volumes/TUF ESD-T1A Media/ida-mcp`（venv + `idausr` + IDA 数据库，约 1.1 G），不进 git。
- **工具名**：`mcp__ida__*`（66 个）。

## 为什么单独一个包

和 `prompt-inject`、`for-free` 一样用 `plugin_manager install_bundle` 以 `link:` 装进
profile：本机只留软链，`settings → 插件` 里能看到，`scripts/doctor.sh` 会当成加载项检查，
卸载走 `remove_bundle`。它和普通插件的差别只有一个——不跑 `apply()`，接线全在 patch 里，
因为服务器是官方的 `@deepseek-ai/dsh-mcp-client` 拉起的，不需要自己实现 MCP 客户端。

## 为什么 `command` 是 `python -m` 而不是 `idalib-mcp`

卷名带空格。`#!/Volumes/TUF ESD-T1A Media/.../python` 这种 shebang 会被内核按空格
截断成 `/Volumes/TUF`，直接执行必然失败。`python -m ida_pro_mcp.idalib_supervisor`
不经过 shebang，路径里的空格只是 argv，安全。

## 验证

```sh
# 1. 服务器本体在盘上、能 import、能应答 initialize
cd "/Volumes/TUF ESD-T1A Media/ida-mcp"
IDAUSR="$PWD/idausr" .venv/bin/python -c "import sys, ida_pro_mcp; print(sys.prefix)"

# 2. DSH 侧：配置树里有这一项、包真加载
cd "/Volumes/TUF ESD-T1A Media/dsh-plugins"
./scripts/doctor.sh

# 3. 会话里调一个 mcp__ida__* 工具（例如 idb_list / survey binary）
```

## 卸载

```sh
plugin_manager remove_bundle @local/ida-mcp-bridge
```

然后按需删掉 `/Volumes/TUF ESD-T1A Media/ida-mcp`（服务器本体）。

## 已知代价

盘没挂载时 MCP 服务器拉不起来，`mcp__ida__*` 整组工具不出现，DSH 其余部分照常
（`failOnStartupError` 默认 false）。IDA 本体 `/Applications/IDA Professional 9.4.app`
仍在本地，双击可用，不受影响。
