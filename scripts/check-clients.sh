#!/bin/bash
# check-clients —— 提交前闸门：一个前端包坏掉，整个界面起不来。
#
# 原理：所有插件的 client.js 由宿主组合成一条启动脚本（ClientModuleRegistry）。
# 任何一个包 exports["./client"] 缺文件、或 dsh.client 声明不合法，宿主构造这个
# 服务时抛 ClientPackageCompositionError，__DSH_BOOT__ / __ModuleLoader__ 整批
# 不下发 —— 表现是「整个界面白屏/起不来」，不是某一个插件消失。
#
# 所以每个包至少要保证三件事（提交前由助手跑这一条，不挂钩子）：
#   1. exports["."] 和 exports["./client"] 指向的文件真的存在
#   2. client.js 语法过（node --check）
#   3. dsh.client 字段形状合法（platform 字符串、inject 是字符串数组、immediately 布尔）
#
# 用法：
#   scripts/check-clients.sh              # 全查
#   scripts/check-clients.sh skin         # 只查某个目录
#
# 它是给「提交前自己跑一遍」用的，不是 git 钩子：不要装 pre-commit。
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ONLY="${1:-}"
FAIL=0

python3 - "$REPO" "$ONLY" <<'PY'
import json, os, subprocess, sys

repo, only = sys.argv[1], sys.argv[2]
SKIP_DIRS = {"profile", "scripts", "不推送", "经验文档", ".git", "node_modules"}
fails, warns, checked = [], [], 0

def resolve_export(exp):
    """exports 字段里的一个子项 → 相对文件路径（接受字符串和一层的条件形式）。"""
    if isinstance(exp, str):
        return exp
    if isinstance(exp, dict):
        for key in ("default", "import", "require"):
            if isinstance(exp.get(key), str):
                return exp[key]
    return None

def syntax_check(path):
    """先按 CommonJS 查，不成再按 ESM 查；两者都失败才算语法错。"""
    if path.endswith((".mjs", ".cjs")):
        pass
    cjs = subprocess.run(["node", "--check", path], capture_output=True, text=True)
    if cjs.returncode == 0:
        return None
    esm = subprocess.run(
        ["node", "--experimental-vm-modules", "-e",
         "const fs=require('fs'),vm=require('vm');new vm.SourceTextModule(fs.readFileSync(process.argv[1],'utf8'));",
         path],
        capture_output=True, text=True)
    if esm.returncode == 0:
        return None
    detail = (cjs.stderr or esm.stderr or "").strip().splitlines()
    return detail[-1] if detail else "语法错误"

for entry in sorted(os.listdir(repo)):
    if entry in SKIP_DIRS or entry.startswith("."):
        continue
    if only and entry != only:
        continue
    pkg_path = os.path.join(repo, entry, "package.json")
    if not os.path.isfile(pkg_path):
        continue
    try:
        pkg = json.load(open(pkg_path, encoding="utf-8"))
    except Exception as error:
        fails.append(f"{entry}: package.json 解析失败 — {error}")
        continue
    name = pkg.get("name")
    if not name:
        continue
    checked += 1
    problems = []

    # 1. exports 指向的文件
    exports = pkg.get("exports") or {}
    if isinstance(exports, dict):
        for key, value in exports.items():
            if key.endswith(".json") or key.endswith(".svg"):
                continue
            rel = resolve_export(value)
            if rel is None:
                problems.append(f"exports[{key!r}] 不是字符串/可解析的条件形式")
                continue
            if not os.path.exists(os.path.join(repo, entry, rel)):
                problems.append(f"exports[{key!r}] 指向的文件不存在: {rel}")
    else:
        problems.append("exports 缺失：宿主 import 这个包会失败")

    # 2. dsh.bundle / dsh.client 声明
    dsh = pkg.get("dsh") or {}
    bundle = dsh.get("bundle")
    if bundle is None:
        problems.append("没有 dsh.bundle —— 它不会作为插件包被加载")
    else:
        patch_files = bundle.get("patch") if isinstance(bundle, dict) else None
        if isinstance(patch_files, str):
            patch_files = [patch_files]
        for rel in patch_files or []:
            if not os.path.exists(os.path.join(repo, entry, rel)):
                problems.append(f"dsh.bundle.patch 指向的文件不存在: {rel}")

    client = dsh.get("client")
    if client is not None:
        if not isinstance(client, dict):
            problems.append("dsh.client 必须是对象")
        else:
            if not isinstance(client.get("platform"), str):
                problems.append("dsh.client.platform 必须是字符串")
            inject = client.get("inject")
            if inject is not None:
                if not isinstance(inject, list) or not all(isinstance(x, str) for x in inject):
                    problems.append("dsh.client.inject 必须是字符串数组")
            immediately = client.get("immediately")
            if immediately is not None and not isinstance(immediately, bool):
                problems.append("dsh.client.immediately 必须是布尔")
            rel = resolve_export(exports.get("./client")) if isinstance(exports, dict) else None
            if rel is None:
                problems.append("声明了 dsh.client，但 exports 里没有 ./client —— 组合时会抛错")
            else:
                client_path = os.path.join(repo, entry, rel)
                if not os.path.exists(client_path):
                    problems.append(f"client.js 不存在: {rel}")
                else:
                    error = syntax_check(client_path)
                    if error:
                        problems.append(f"{rel} 语法错误 — {error}")

    # 3. 宿主半也要能解析（否则激活即 failed）
    main = resolve_export(exports.get(".")) if isinstance(exports, dict) else None
    if main:
        main_path = os.path.join(repo, entry, main)
        if os.path.exists(main_path):
            error = syntax_check(main_path)
            if error:
                problems.append(f"{main} 语法错误 — {error}")

    if problems:
        fails.append(f"{name}  ({entry})")
        for problem in problems:
            fails.append(f"    · {problem}")

print(f"检查了 {checked} 个包")
if fails:
    print("\n有问题:")
    for line in fails:
        print("  " + line)
    sys.exit(1)
print("全部通过：exports / dsh.bundle / dsh.client / 语法 都没问题")
PY
[ $? -ne 0 ] && FAIL=1
exit "$FAIL"
