# @local/cookie-clean

设置 → 插件 →「Cookie 清理」页签：删掉桌面客户端攒下来的**陈旧本地认证 cookie**。

## 这插件解决什么

桌面客户端每次启动都用随机端口起 Host（`--port 0`），并按端口名生成一条
`dsh-auth-<base64url(sha256("127.0.0.1:<port>"))>` cookie。端口一直变，旧条目没人删，
只按 30 天到期（`cookieMaxAgeDays`）。Chromium 把 `127.0.0.1` 的 cookie **全部**塞进同一个
请求头（cookie 不分端口），所以每启动一次涨约 226 字节，攒到约 70 条就超过 Node 的
16 KiB `maxHeaderSize`：Host 回 431，外壳报 `desktop welcome: Web authentication failed`，
启动直接失败，重试也没用（下次还是同一罐）。

## 它怎么清

只删 `host_key='127.0.0.1' AND name LIKE 'dsh-auth-%' AND name <> 当前` 的行。
当前那条按 `webServer.port` 用**和 Host 完全相同的算法**重算出来并排除，所以：

- 清理不会把正在用的会话踢下线
- 陈旧条目本来就绑在已消失的端口上，删掉在语义上是 no-op，只换回请求头预算
- 别的 host、非 `dsh-auth-` 的 cookie 一律不碰

打开就是快照：总条数、陈旧条数、请求头估算 / 16384、按当前速度还能启动几次。
点一次按钮删掉陈旧条目，结果写进 `<DSH_HOME>/storages/cookie-clean/last.json`。

## 依赖

- 宿主半用 `node:sqlite`（Node ≥ 22.5）。桌面客户端自带 Node 24，够用。
  用系统 Node 跑 `dsh web` 时如果 Node 太老，页签会显示 `no-sqlite` 而不是崩掉。
- 写库时 Chromium 还开着这个文件，SQLite 的 `busy_timeout` 兜住并发写；
  撞上了返回 409（`busy`），页签提示稍后重试，不会写坏库。

## 装与验

```bash
# 装（desktop profile 被 Electron 独占，只能走恢复脚本）
/Volumes/TUF\ ESD-T1A\ Media/dsh-plugins/scripts/profile-restore.sh
/Volumes/TUF\ ESD-T1A\ Media/dsh-plugins/scripts/doctor.sh      # 期望 12/12

# 自测（用桌面自带的 Node 24，系统 Node 20 没有 node:sqlite）
/Applications/DeepSeek\ Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node test/smoke.mjs
```

客户端半改完刷新页面即可；宿主半改完要重装。

## 回退

插件本身无副作用可回退（它只删废行）。要彻底移除：从
`~/.dsh/profiles/desktop/package.json` 的 `bundles` 和 `dependencies` 里去掉
`@local/cookie-clean`，删 `node_modules/@local/cookie-clean` 软链，重开 App。
