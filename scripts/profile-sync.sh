#!/bin/bash
# profile-sync —— 把当前能用的 profile 配置抄进仓库（可推送、可换机）。
#
# 只读 ~/.dsh/profiles/<name>，写仓库 profile/：
#   package.json       归一化：link:/绝对/路径 → link:{{REPO}}/相对路径
#   cordis.patch.yml   原样
#
# 什么时候跑：
#   - 装/卸/启用/禁用插件之后
#   - 在设置里改了模型、主题、字号等写进 cordis.patch.yml 的东西之后
#   - 升级 DSH 之后如果 doctor 报「配置漂移」
#
# 用法：
#   scripts/profile-sync.sh                # 同步 desktop
#   PROFILE_DIR=... scripts/profile-sync.sh
#   scripts/profile-sync.sh --check        # 只比较不写；有差异退出码 1
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE_DIR="${PROFILE_DIR:-$HOME/.dsh/profiles/desktop}"
OUT="$REPO/profile"
CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

[ -f "$PROFILE_DIR/package.json" ] || { echo "找不到 $PROFILE_DIR/package.json" >&2; exit 1; }
[ -f "$PROFILE_DIR/cordis.patch.yml" ] || { echo "找不到 $PROFILE_DIR/cordis.patch.yml（被官方禁用过？看有没有 .bak-*）" >&2; exit 1; }
mkdir -p "$OUT"

python3 - "$PROFILE_DIR" "$OUT" "$REPO" "$CHECK_ONLY" <<'PY'
import json, os, sys

profile_dir, out_dir, repo, check_only = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] == "1"
repo_norm = os.path.realpath(repo).rstrip("/")
warnings, rewrites, drift = [], [], []

def normalize_link(value):
    """link:/绝对路径 → link:{{REPO}}/相对（仅当落在本仓库内）。"""
    if not isinstance(value, str) or not value.startswith("link:"):
        return value
    raw = value[5:]
    path = os.path.realpath(os.path.expanduser(raw)).rstrip("/")
    if path == repo_norm:
        return "link:{{REPO}}"
    if path.startswith(repo_norm + "/"):
        return "link:{{REPO}}/" + path[len(repo_norm) + 1:]
    warnings.append(f"{raw} 不在仓库内，原样保留（换机会失效）")
    return value

manifest = json.load(open(os.path.join(profile_dir, "package.json"), encoding="utf-8"))
for key, value in (manifest.get("dependencies") or {}).items():
    normalized = normalize_link(value)
    if normalized != value:
        manifest["dependencies"][key] = normalized
        rewrites.append(key)

target = os.path.join(out_dir, "package.json")
rendered = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
previous = json.load(open(target, encoding="utf-8")) if os.path.exists(target) else None

def describe(actual, expected):
    """把两份清单的差异说清楚：缺什么、多什么、顺序变了什么。"""
    out = []
    a_deps = actual.get("dependencies") or {}
    e_deps = expected.get("dependencies") or {}
    for name in sorted(set(e_deps) - set(a_deps)):
        out.append(f"少了依赖 {name}")
    for name in sorted(set(a_deps) - set(e_deps)):
        out.append(f"多了依赖 {name}（基准里没有）")
    for name in sorted(set(a_deps) & set(e_deps)):
        if a_deps[name] != e_deps[name]:
            out.append(f"依赖路径变了 {name}: {a_deps[name]} → {e_deps[name]}")
    a_b = ((actual.get("dsh") or {}).get("profile") or {}).get("bundles") or []
    e_b = ((expected.get("dsh") or {}).get("profile") or {}).get("bundles") or []
    for name in e_b:
        if name not in a_b:
            out.append(f"少了加载项 {name}")
    for name in a_b:
        if name not in e_b:
            out.append(f"多了加载项 {name}（基准里没有，未启用？）")
    if [n for n in a_b if n in e_b] != [n for n in e_b if n in a_b]:
        out.append("加载顺序变了")
    return out

patch_src = os.path.join(profile_dir, "cordis.patch.yml")
patch_dst = os.path.join(out_dir, "cordis.patch.yml")
patch_text = open(patch_src, encoding="utf-8").read()
patch_changed = not os.path.exists(patch_dst) or open(patch_dst, encoding="utf-8").read() != patch_text

bundles = ((manifest.get("dsh") or {}).get("profile") or {}).get("bundles") or []

if check_only:
    if previous is None:
        drift.append("仓库还没有基准（profile/package.json 不存在）")
    else:
        drift.extend(describe(manifest, previous))
    if patch_changed:
        drift.append("cordis.patch.yml 内容不一样（设置里改过模型/主题？）")

    print(f"基准: {target}")
    print(f"当前 profile 的加载顺序（{len(bundles)} 项）:")
    for name in bundles:
        print(f"  - {name}")
    for warning in warnings:
        print(f"警告: {warning}")
    if drift:
        print("\n配置漂移 ——")
        for item in drift:
            print(f"  · {item}")
        print("跑 scripts/profile-sync.sh 同步（只改仓库里的基准，不动 profile）")
        sys.exit(1)
    print("\n一致，没有漂移")
    sys.exit(0)

changed = previous is None or json.dumps(previous, sort_keys=True) != json.dumps(manifest, sort_keys=True)
if changed:
    open(target, "w", encoding="utf-8").write(rendered)
if patch_changed:
    open(patch_dst, "w", encoding="utf-8").write(patch_text)

print(f"仓库基准: {target}")
print(f"加载顺序: {len(bundles)} 项")
for name in bundles:
    print(f"  - {name}")
for warning in warnings:
    print(f"警告: {warning}")
if rewrites:
    print(f"脱敏: {len(rewrites)} 条 link 路径换成 {{{{REPO}}}}")
if patch_changed:
    print("已更新 cordis.patch.yml 基准")
print("package.json 已同步" if changed else "package.json 没有变化")
PY
