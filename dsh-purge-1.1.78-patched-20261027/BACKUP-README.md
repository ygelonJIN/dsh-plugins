# dsh-purge 1.1.78 备份（含「移除回退」本机改动）

- 备份时间：2026-10-27
- 来源：`~/.dsh/profiles/desktop/node_modules/dsh-purge`
- 版本：1.1.78（DSH 0.2.1-rc.3，profile `desktop`）
- 上游：https://github.com/YuJunZhiXue/dsh-purge

## 目录

```
1.1.78-patched-20261027/     完整插件目录（当前已改动状态）
  client.js                  已改：不再注册「回退」按钮
  client.js.bak-rewind-20261027      原版
  lib/index.js               已改：删除 /rewind 命令
  lib/index.js.bak-rewind-20261027   原版
  profile/                   安装时的注册文件
    package.json             引用了 dsh-purge 依赖
    cordis.patch.yml         含 dsh-purge 的 insert（让它加载）
    prompt-inject.md         本机提示词注入文件
dsh-purge-1.1.78-patched-20261027.tar.gz   上面目录的压缩包
patches/                     两处改动相对原版的 diff
reapply-rewind-removal.py    更新后重放「移除回退」的脚本（幂等）
```

## 本机改了什么

1. `client.js`：`apply()` 不再调用 `installRewindUi`，输入框右侧的「回退」按钮不再注册。
2. `lib/index.js`：删除 `/rewind` 命令的注册块。

没有改：HTTP 路由（`/dsh-purge/rewind` 等）、`wrapSessionDeriveMessages`、`lib/rewind.js`、右侧 dock、破甲注入。

## 插件被更新 / 重装覆盖后

```bash
python3 "/Volumes/TUF ESD-T1A Media/dsh-plugins/dsh-purge-1.1.78-patched-20261027/reapply-rewind-removal.py"          # 重放
python3 "/Volumes/TUF ESD-T1A Media/dsh-plugins/dsh-purge-1.1.78-patched-20261027/reapply-rewind-removal.py" --check  # 只看状态
```

改完重启 DSH。

## 完整恢复成「改动前」

```bash
cp -R "/Volumes/TUF ESD-T1A Media/dsh-plugins/dsh-purge-1.1.78-patched-20261027/" \
      ~/.dsh/profiles/desktop/node_modules/dsh-purge/
```

或解压 tar.gz 覆盖整个目录。

## 注意

- 备份不含 `node_modules`（原目录里该目录为空）。
- 插件仍写在 `profile/cordis.patch.yml` 的 insert 里，会照常加载；只删了「回退」入口，其余功能不受影响。
- 上游更新会覆盖 `client.js` 与 `lib/index.js`，需要重跑上面的脚本。
