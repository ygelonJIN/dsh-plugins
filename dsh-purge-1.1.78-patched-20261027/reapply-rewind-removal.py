#!/usr/bin/env python3
"""dsh-purge「移除回退」改动的重放脚本。

插件被 pnpm 重装/更新后，client.js 和 lib/index.js 会被换回原版，
「回退」按钮与 /rewind 命令会复活。运行本脚本即可重新删除，幂等。

用法：
  python3 reapply-rewind-removal.py                 # 默认 desktop profile
  python3 reapply-rewind-removal.py --dir /path/to/dsh-purge
  python3 reapply-rewind-removal.py --check         # 只看状态，不写
"""

import argparse
import datetime
import re
import shutil
from pathlib import Path

MARK_CLIENT = "[local-patch] rewind ui removed"
MARK_INDEX = "[local-patch] rewind command removed"
DEFAULT_DIR = Path.home() / ".dsh/profiles/desktop/node_modules/dsh-purge"


def backup(p: Path) -> Path:
    dst = p.with_name(p.name + ".bak-" + datetime.date.today().strftime("%Y%m%d"))
    if not dst.exists():
        shutil.copy2(p, dst)
    return dst


def patch_client(p: Path, write: bool) -> str:
    s = p.read_text(encoding="utf-8")
    if MARK_CLIENT in s:
        return "client.js：已是移除状态"
    # 已经没有人调用 installRewindUi（上一版手工删除也属于这种情况）
    if not re.search(r"(?<!function )installRewindUi\((host|ctx)\)", s):
        return "client.js：已是移除状态（无 installRewindUi 调用）"
    m = re.search(r"function installRewindUi\(ctx\) \{\n", s)
    if not m:
        return "client.js：没找到 installRewindUi，结构变了，需手动处理"
    ins = m.end()
    new = s[:ins] + "\t\t\t// " + MARK_CLIENT + "\n\t\t\treturn;\n" + s[ins:]
    if write:
        backup(p)
        p.write_text(new, encoding="utf-8")
    return "client.js：installRewindUi 开头插入 return（回退按钮不再注册）"


def patch_index(p: Path, write: bool) -> str:
    s = p.read_text(encoding="utf-8")
    if MARK_INDEX in s:
        return "lib/index.js：已是移除状态"
    if not re.search(r'^\s*name:\s*"rewind"\s*,?\s*$', s, re.M):
        return "lib/index.js：已是移除状态（无 /rewind 命令）"
    pat = re.compile(
        r"\n    tryRegisterCommand\(commands, \{\n      name: \"rewind\",[\s\S]*?\n    \}, \[\"purge-rewind\"\]\);",
        re.M,
    )
    s2, n = pat.subn("\n    // " + MARK_INDEX, s)
    if n:
        if write:
            backup(p)
            p.write_text(s2, encoding="utf-8")
        return "lib/index.js：已删除 /rewind 命令块"
    s3, n2 = re.subn(
        r'(tryRegisterCommand\(commands, \{\s*\n\s*name: )"rewind"',
        r'\1"rewind-removed"',
        s,
    )
    if n2:
        if write:
            backup(p)
            p.write_text(s3, encoding="utf-8")
        return "lib/index.js：命令块结构变了，已把命令名改成 rewind-removed（/rewind 失效）"
    return "lib/index.js：没匹配到 /rewind 命令块，需手动处理"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=str(DEFAULT_DIR))
    ap.add_argument("--check", action="store_true", help="只检查，不写文件")
    args = ap.parse_args()

    root = Path(args.dir).expanduser()
    client = root / "client.js"
    index = root / "lib" / "index.js"
    if not client.exists() or not index.exists():
        print(f"找不到插件文件：{root}")
        return 1

    write = not args.check
    print(f"目标：{root}（{'检查' if not write else '写入'}）")
    print(" -", patch_client(client, write))
    print(" -", patch_index(index, write))
    if write:
        print("生效需要重启 DSH；client 半刷新页面即可。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
