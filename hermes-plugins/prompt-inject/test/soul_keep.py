"""soul keep（替换但保留原文身份）自测：临时 HERMES_HOME，不碰 ~/.hermes。"""

from __future__ import annotations

import importlib.util
import os
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLUGIN = HERE.parent / "__init__.py"
checks = 0


def ok(name: str, condition: bool, detail: str = "") -> None:
    global checks
    checks += 1
    if not condition:
        raise AssertionError("%s 失败 %s" % (name, detail))


def load():
    spec = importlib.util.spec_from_file_location("hermes_prompt_inject_keep", PLUGIN)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["HERMES_HOME"] = tmp
        home = Path(tmp)
        plugin = load()
        soul = home / "SOUL.md"
        soul.write_text("你是 jfq。小嘟嘟是你的宝宝。\n", encoding="utf-8")
        plugin.write_text("注入正文第一段。")
        plugin.handle_command("mode soul")

        # 不开 keep：纯替换，原文不进提示词
        plugin.handle_command("on")
        text = soul.read_text(encoding="utf-8")
        ok("纯替换=只有正文", text.strip() == "注入正文第一段。", text[:60])
        ok("备份是原文", "小嘟嘟" in (home / "prompt-inject" / "SOUL.original.md").read_text(encoding="utf-8"))

        # 打开 keep，重新 on：正文在前，原文以 persona 块附在后面
        ok("keep on", "保留原文身份 = 开" in plugin.handle_command("soul keep on"))
        plugin.handle_command("on")
        text = soul.read_text(encoding="utf-8")
        ok("正文在前", text.startswith("注入正文第一段。"), text[:40])
        ok("原文在末尾", text.rstrip().endswith("<!-- prompt-inject:persona:end -->"), text[-40:])
        ok("原文还在", "小嘟嘟是你的宝宝" in text)
        ok("备份没被污染", (home / "prompt-inject" / "SOUL.original.md").read_text(encoding="utf-8").strip() == "你是 jfq。小嘟嘟是你的宝宝。")

        # 重复 on 幂等：不会把 persona 块套娃
        plugin.handle_command("on")
        text2 = soul.read_text(encoding="utf-8")
        ok("persona 不套娃", text2.count("<!-- prompt-inject:persona:start -->") == 1, text2.count("<!-- prompt-inject:persona:start -->"))
        ok("正文不重复", text2.count("注入正文第一段。") == 1, text2.count("注入正文第一段。"))

        # off 整份还原原文
        ok("off 还原", "已还原" in plugin.handle_command("off"))
        ok("off 后是原文", soul.read_text(encoding="utf-8").strip() == "你是 jfq。小嘟嘟是你的宝宝。")

    print("soul keep: %d 项通过" % checks)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
