# @local/dify-dsl-skill

把 **Dify 工作流 DSL 技能** 挂进 DSH 的技能目录：装完后在编辑器里输入 `/dify-workflow-dsl` 可调用，
模型在处理 Dify YAML 时也会自动选中它。

## 它给什么

| 资源 | 内容 |
|---|---|
| `assets/SKILL.md` | 写 DSL 的流程与规则：版本策略（0.6→Dify 1.15.x / 0.7→1.16.x）、图连线、变量、分支、迭代/循环、依赖、校验步骤 |
| `assets/references/` | `node-schemas.md`（逐类型字段）、`dsl-structure.md`、`official-0.6-target.md`、`official-0.7-target.md`、`complete-examples.md`、`plugin-marketplace-tools.md`、`database-tools.md`、`usecase-node-selection.md`、`real-world-yml-study.md`、`dify-1.16-evaluation.md` |
| `assets/examples/dify-1.16.0/` | 10 个可直接导入的 1.16 场景 YAML |
| `assets/scripts/` | `validate_dsl.py` + `dify_dsl_validator/`（0.6/0.7 版本感知校验，约 2800 行） |

## 用法

```
/dify-workflow-dsl 帮我把 04_黑帧口播 的 H02S 改成按 composition.family 分支
```

模型会加载技能正文，再按需读 `references/`、跑 `scripts/validate_dsl.py`。

## 校验器的前提

- Python **≥ 3.10**（系统自带 3.9 会在 `dataclass(slots=True)` 处失败）
- 需要 `pyyaml`

推荐用法：

```bash
PYTHONPATH=/tmp/pyyaml312 /Users/jinfeiqing/.venv-macos27/bin/python3 \
  assets/scripts/validate_dsl.py --target-version 0.7.0 你的.yml
```

## 安装

```bash
# 在带 plugin_manager 的会话里
install_bundle  /Volumes/TUF ESD-T1A Media/dsh-plugins/dify-dsl-skill
```

装完刷新页面（⌘R）技能目录就会带上它。卸载：`remove_bundle` 后删目录。

## 自测

```bash
node test/smoke.mjs
```

## 更新技能内容

技能内容是从 Codex 技能目录同步过来的快照：

```bash
SRC=/Users/jinfeiqing/.codex/skills/dify-workflow-dsl
cp "$SRC/SKILL.md" assets/SKILL.md
cp -R "$SRC/references" "$SRC/examples" "$SRC/scripts" assets/
```

改完 `node test/smoke.mjs`，再 `remove_bundle` + `install_bundle`（宿主半改才需要重装；
只换 assets 里的文档也会走宿主半的文件读取，重装一次最稳）。
