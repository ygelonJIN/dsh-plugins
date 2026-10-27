#!/bin/bash
# profile-restore —— 把仓库 profile/ 里那份配方抄回 ~/.dsh/profiles/<name>/。
#
# 为什么不能一条命令装回去：desktop 这个 profile 被 Electron 独占，
# `dsh plugin --profile desktop add` 会直接报
#   profile "desktop" is managed exclusively by the Electron application
# 所以恢复只能是文件操作：补依赖、补加载项、建目录软链、把 patch 从 .bak 改回来。
#
# 常规装插件仍然走设置 → 插件（或 plugin_manager 的 install_bundle）；
# 这个脚本只用于事故恢复和换机重建。
#
# 用法：
#   scripts/profile-restore.sh --dry-run        # 只看要做什么
#   scripts/profile-restore.sh                  # 合并：只补不删（推荐）
#   scripts/profile-restore.sh --force          # 完全按仓库基准覆盖清单
#   scripts/profile-restore.sh --profile diag   # 别的 profile（测脚本时用）
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="desktop"
MODE="merge"
DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --profile) NAME="$2"; shift 2 ;;
    --force) MODE="force"; shift ;;
    --dry-run) DRY=1; shift ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

PROFILE_DIR="${PROFILE_DIR:-$HOME/.dsh/profiles/$NAME}"
SRC="$REPO/profile"
STAMP="$(date +%Y%m%d-%H%M%S)"

[ -f "$SRC/package.json" ] || { echo "仓库里没有 profile/package.json，先跑 profile-sync.sh" >&2; exit 1; }
[ -d "$PROFILE_DIR" ] || { echo "没有这个 profile: $PROFILE_DIR" >&2; exit 1; }

echo "仓库基准: $SRC"
echo "目标 profile: $PROFILE_DIR"
echo "模式: $MODE$([ "$DRY" = 1 ] && echo '（演练，不落盘）')"

python3 - "$SRC" "$PROFILE_DIR" "$REPO" "$MODE" "$DRY" "$STAMP" <<'PY'
import json, os, shutil, sys

src, profile_dir, repo, mode, dry, stamp = sys.argv[1:7]
dry = dry == "1"
repo_real = os.path.realpath(repo).rstrip("/")
actions, warnings = [], []

def render(value):
    if isinstance(value, str):
        return value.replace("{{REPO}}", repo_real)
    return value

template = json.load(open(os.path.join(src, "package.json"), encoding="utf-8"))
for key, value in (template.get("dependencies") or {}).items():
    template["dependencies"][key] = render(value)

manifest_path = os.path.join(profile_dir, "package.json")
current = json.load(open(manifest_path, encoding="utf-8")) if os.path.exists(manifest_path) else {}

if mode == "force":
    merged = template
else:
    merged = dict(template)
    for key, value in current.items():          # 保留基准里没有的顶层字段
        merged.setdefault(key, value)
    deps = dict(current.get("dependencies") or {})
    deps.update(template.get("dependencies") or {})
    merged["dependencies"] = deps
    tpl_dsh = template.get("dsh") or {}
    cur_dsh = current.get("dsh") or {}
    merged["dsh"] = {**cur_dsh, **tpl_dsh}
    tpl_profile = tpl_dsh.get("profile") or {}
    cur_bundles = (cur_dsh.get("profile") or {}).get("bundles") or []
    order = list(tpl_profile.get("bundles") or [])
    extra = [b for b in cur_bundles if b not in order]
    merged["dsh"]["profile"] = {**(cur_dsh.get("profile") or {}), **tpl_profile,
                                "bundles": order + extra}
    if extra:
        actions.append("保留基准之外的加载项: " + ", ".join(extra))

rendered = json.dumps(merged, ensure_ascii=False, indent=2) + "\n"
old = open(manifest_path, encoding="utf-8").read() if os.path.exists(manifest_path) else None
if old == rendered:
    actions.append("package.json 已经是目标内容")
else:
    actions.append("写回 package.json")
    if not dry:
        shutil.copy2(manifest_path, f"{manifest_path}.bak-{stamp}")
        open(manifest_path, "w", encoding="utf-8").write(rendered)

for name in merged["dsh"]["profile"]["bundles"]:
    if name.startswith("@local/"):
        actions.append(f"加载项 {name}")

# 目录软链：仓库里所有 @local 包，不只是基准里列的
local_dir = os.path.join(profile_dir, "node_modules", "@local")
for entry in sorted(os.listdir(repo)):
    pkg_path = os.path.join(repo, entry, "package.json")
    if not os.path.isfile(pkg_path):
        continue
    try:
        pkg = json.load(open(pkg_path, encoding="utf-8"))
    except Exception:
        continue
    name = pkg.get("name") or ""
    if not name.startswith("@local/") or not (pkg.get("dsh") or {}).get("bundle"):
        continue
    short = name.split("/", 1)[1]
    link = os.path.join(local_dir, short)
    target = os.path.join(repo, entry)
    if os.path.islink(link):
        if os.path.realpath(link) == os.path.realpath(target):
            continue
        actions.append(f"重指软链 {short}")
        if not dry:
            os.unlink(link); os.symlink(target, link)
    elif os.path.exists(link):
        warnings.append(f"{short} 是真实目录不是软链，跳过（可能是旧版复制安装）")
    else:
        actions.append(f"建软链 {short}")
        if not dry:
            os.makedirs(local_dir, exist_ok=True); os.symlink(target, link)

# patch：没有活动 patch 就把最近的 .bak 改回来
patch_path = os.path.join(profile_dir, "cordis.patch.yml")
src_patch = os.path.join(src, "cordis.patch.yml")
if not os.path.exists(patch_path):
    backups = sorted([f for f in os.listdir(profile_dir) if f.startswith("cordis.patch.yml.bak-")], reverse=True)
    if backups:
        actions.append(f"把 {backups[0]} 改回 cordis.patch.yml")
        if not dry:
            os.rename(os.path.join(profile_dir, backups[0]), patch_path)
    elif os.path.exists(src_patch):
        actions.append("没有 .bak，用仓库基准写一份 cordis.patch.yml")
        if not dry:
            shutil.copy2(src_patch, patch_path)
    else:
        warnings.append("patch 缺失且仓库没有基准")

print()
for item in actions:
    print(f"  · {item}")
for item in warnings:
    print(f"  警告: {item}")
if dry:
    print("\n演练结束：没有改动任何文件")
PY

echo
if [ "$DRY" = 0 ]; then
  echo "下一步: scripts/doctor.sh --profile $NAME"
fi
