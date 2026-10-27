# profile/ —— 当前能用的配置基准（可推送）

这里不是插件包，**不要对它跑 `install_bundle`**。它存的是 `~/.dsh/profiles/desktop/`
里那两个决定"插件装没装、按什么顺序加载"的文件：

| 文件 | 来源 | 说明 |
|---|---|---|
| `package.json` | `~/.dsh/profiles/desktop/package.json` | 加载清单。`link:` 路径已脱敏成 `{{REPO}}`，换机/换目录都能用 |
| `cordis.patch.yml` | `~/.dsh/profiles/desktop/cordis.patch.yml` | 用户层开关：模型、主题、`dsh-purge` 那条 insert |

推送是安全的：里面没有 key、没有本机绝对路径（`dsh-purge` 那条是公开 GitHub 地址）。

## 什么时候更新它

改完插件配置就同步一次，让基准跟上现状：

```bash
scripts/profile-sync.sh          # 当前 profile → 这里（只读 profile，不动它）
scripts/profile-sync.sh --check  # 只看有没有漂移，不写
```

装/卸/启用/禁用插件之后、在设置里换模型/主题/字号之后、升级 DSH 之后 —— 都算。
不更新也不会炸，只是 `scripts/doctor.sh` 会报「配置漂移」，恢复时用的是旧配方。

## 它怎么被用

`scripts/profile-restore.sh` 读这里的两个文件，渲染回本机路径，再写进 profile：

- 默认**合并**：只补不删。基准里没有、profile 里有的东西原样保留（比如你后加的插件）
- `--force`：完全按基准覆盖清单
- 建 `node_modules/@local/*` 软链、把 `cordis.patch.yml.bak-*` 改回活动 patch

顺带一个事实：desktop 这个 profile 被 Electron 独占，

```
$ dsh plugin --profile desktop add ...
error: profile "desktop" is managed exclusively by the Electron application
```

所以**恢复只能走文件操作**。平时装插件请走 设置 → 插件（或 `plugin_manager` 的
`install_bundle`），别手改 profile。

## 出事了怎么办

```bash
scripts/doctor.sh                  # 先看：漂移？哪几个插件没加载？patch 引用的包装了没？
scripts/profile-restore.sh         # 再修（默认只补不删）
scripts/doctor.sh                  # 复查
```

四个脚本都在 `scripts/`，用法见各自文件头。

**升级后 DSH 自己会弹提示**（`self-check` 插件在右下角，显示版本变化和没加载的插件），
所以正常情况不用你想起跑 doctor；弹出来了、或者提示里点了「知道了」还想追查，再跑上面那条。

注意 `dsh-purge` 不在加载清单里 —— 它由 `cordis.patch.yml` 里的 `insert` 装进来。
换机重建时恢复脚本会写回 patch，但**包本身要另装**（GitHub tarball），doctor 会明确报
「patch 引用 dsh-purge —— 包没装」。
