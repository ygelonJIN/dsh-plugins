/**
 * @local/ida-mcp-bridge — 空壳插件。
 *
 * 本包不跑任何代码：真正的服务器由同目录 `cordis.patch.yml` 里那条
 * `dsh-mcp-client` 插入项启动，工具以 `mcp__ida__*` 出现在模型工具表里。
 * 之所以做成包，是为了让它像其他 `@local/*` 一样：
 *   - 用 `plugin_manager` 以 `link:` 装进 profile，本机只留软链
 *   - 出现在 `dsh.profile.bundles`，`scripts/doctor.sh` 会当成加载项检查
 *   - 卸载走 `remove_bundle`，不用手改 YAML
 *
 * 服务器本体（venv / idausr / IDA 数据库）在 `/Volumes/TUF ESD-T1A Media/ida-mcp`，
 * 不进这个仓库：那是 1.1 G 的 Python 环境与数据。
 */

export const name = '@local/ida-mcp-bridge';

/** 无宿主逻辑；patch 层已经完成全部接线。 */
export function apply() {}
