#!/bin/bash
# doctor —— 升级后体检：配置有没有漂移、插件是不是真加载了。
#
# 为什么需要：插件加载失败（bundle 被跳过）只写进 Host 的 stderr，
# 界面里插件列表照样显示「已启用」，图标也还在，就是不工作。只有把 profile
# 单独拿给 dsh 组合一遍才看得见。desktop 这个名字被 Electron 独占，所以复制成
# 一个临时 profile（diag）在临时 DSH_HOME 里跑，全程只读你真实的 profile。
#
# 用法：
#   scripts/doctor.sh              # 漂移 + 加载，两项都查
#   scripts/doctor.sh --drift      # 只查配置漂移（快，不启动 dsh）
#   scripts/doctor.sh --load       # 只查加载
#   scripts/doctor.sh --profile diag
set -uo pipefail

APP="${APP:-/Applications/DeepSeek Harness.app}"
BIN="$APP/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js"
ELECTRON="$APP/Contents/MacOS/DeepSeek Harness"
NAME="desktop"
DO_DRIFT=1
DO_LOAD=1
case "${1:-}" in
  --drift) DO_LOAD=0 ;;
  --load) DO_DRIFT=0 ;;
  --profile) NAME="${2:-desktop}" ;;
  "") ;;
  *) echo "未知参数: $1" >&2; exit 2 ;;
esac

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE_DIR="${PROFILE_DIR:-$HOME/.dsh/profiles/$NAME}"
FAIL=0
say() { printf '%s\n' "$*"; }

say "== 体检: profile=$NAME"
say "   仓库: $REPO"
say "   profile: $PROFILE_DIR"

# ---------- 1. 配置漂移 ----------
if [ "$DO_DRIFT" = 1 ]; then
  say ""
  say "-- 1/2 配置漂移（仓库基准 vs 当前 profile）"
  if PROFILE_DIR="$PROFILE_DIR" "$REPO/scripts/profile-sync.sh" --check >/tmp/dsh-doctor-drift.log 2>&1; then
    say "   ✓ 一致"
  else
    say "   ✗ 有漂移:"
    sed 's/^/     /' /tmp/dsh-doctor-drift.log
    FAIL=1
  fi
fi

# ---------- 2. 加载 ----------
if [ "$DO_LOAD" = 1 ]; then
  say ""
  say "-- 2/2 插件是否真的加载 + patch 引用的包装没装"
  # app.asar 是文件，里面的路径 bash 的 -f 看不到；只验证应用本体 + asar 在
  if [ ! -e "$APP/Contents/Resources/app.asar" ] || [ ! -x "$ELECTRON" ]; then
    say "   ! 找不到 DSH 应用（APP=${APP}），跳过加载检查"
    exit "$FAIL"
  fi
  if [ ! -f "$PROFILE_DIR/package.json" ]; then
    say "   ✗ 没有 profile: $PROFILE_DIR"
    exit 1
  fi

  TMPHOME="$(mktemp -d /tmp/dsh-doctor.XXXXXX)"
  trap 'rm -rf "$TMPHOME"' EXIT
  mkdir -p "$TMPHOME/profiles"
  cp -R "$PROFILE_DIR" "$TMPHOME/profiles/diag"
  rm -f "$TMPHOME/profiles/diag/lock"

  if DSH_HOME="$TMPHOME" ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$BIN" \
       --profile diag --dump-config >"$TMPHOME/dump.yml" 2>"$TMPHOME/skip.log"; then
    :
  else
    say "   ✗ dsh 组合 profile 失败:"
    sed 's/^/     /' "$TMPHOME/skip.log" | head -20
    exit 1
  fi

  python3 - "$REPO" "$TMPHOME/dump.yml" "$TMPHOME/skip.log" "$REPO/profile/package.json" "$PROFILE_DIR" <<'PY'
import json, os, re, sys
repo, dump_path, skip_path, tpl_path, profile_dir = sys.argv[1:6]
dump = open(dump_path, encoding="utf-8", errors="replace").read()
skips = [line for line in open(skip_path, encoding="utf-8", errors="replace") if line.strip()]
template = json.load(open(tpl_path, encoding="utf-8"))
bundles = (template.get("dsh") or {}).get("profile", {}).get("bundles") or []

expected = [b for b in bundles if b.startswith("@local/")]
missing = [b for b in expected if b not in dump]
ok = [b for b in expected if b in dump]

for name in ok:
    print(f"   ✓ {name}")
for name in missing:
    print(f"   ✗ {name} —— 没进配置树（bundle 被跳过）")
for line in skips:
    print("   ! " + line.strip())

# 仓库里有、但没在基准加载项里 = 未启用（不算失败）
repo_names = set()
for entry in sorted(os.listdir(repo)):
    pkg = os.path.join(repo, entry, "package.json")
    if not os.path.isfile(pkg):
        continue
    try:
        data = json.load(open(pkg, encoding="utf-8"))
    except Exception:
        continue
    name = data.get("name") or ""
    if name.startswith("@local/") and (data.get("dsh") or {}).get("bundle"):
        repo_names.add(name)
idle = sorted(repo_names - set(expected))
if idle:
    print("   · 仓库里有但没启用: " + ", ".join(idle))

# patch 里 insert 的第三方包（如 dsh-purge）必须真的装在 profile 里，
# 它不在 bundles 列表里，所以上面的检查看不到它
patch_path = os.path.join(profile_dir, "cordis.patch.yml")
unresolved = []
if os.path.exists(patch_path):
    insert_indent = None
    for line in open(patch_path, encoding="utf-8"):
        stripped = line.strip()
        if stripped.startswith("- insert:"):
            insert_indent = len(line) - len(line.lstrip())
            continue
        if insert_indent is None:
            continue
        if stripped and (len(line) - len(line.lstrip())) <= insert_indent:
            insert_indent = None          # 离开 insert 块
            continue
        if stripped:
            match = re.match(r'^\s+name:\s*["\']?([^"\'\s]+)', line)
            if match:
                name = match.group(1)
                if name.startswith("@deepseek-ai/dsh"):
                    continue
                installed = os.path.exists(os.path.join(profile_dir, "node_modules", name))
                if installed:
                    print(f"   ✓ patch 引用 {name}")
                else:
                    print(f"   ✗ patch 引用 {name} —— 包没装（来自 patch 的 insert，不在 bundles 里）")
                    unresolved.append(name)

print()
print(f"   结果: {len(ok)}/{len(expected)} 个插件在配置树里，{len(skips)} 条跳过告警"
      + (f"，{len(unresolved)} 个 patch 引用的包缺失" if unresolved else ""))
sys.exit(1 if missing or skips or unresolved or not expected else 0)
PY
  [ $? -ne 0 ] && FAIL=1
fi

say ""
[ "$FAIL" = 0 ] && say "== 通过" || say "== 有问题，见上面 ✗ / ! 行"
exit "$FAIL"
