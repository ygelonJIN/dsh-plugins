"""prompt-inject 自测：假 ctx + 临时 HERMES_HOME，不碰 ~/.hermes。"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
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


class FakeCtx:
    def __init__(self) -> None:
        self.section = None
        self.hooks = {}
        self.commands = {}
        self.cli = None

    def register_system_prompt_section(self, sid, content, *, position="after_memory", max_chars=4000):
        ok("section id", sid == "prompt-inject", sid)
        ok("section position", position == "after_memory", position)
        ok("section max_chars", max_chars == 4000, max_chars)
        self.section = content

    def register_hook(self, name, callback, **kwargs):
        self.hooks[name] = callback

    def register_command(self, name, handler, **kwargs):
        self.commands[name] = handler

    def register_cli_command(self, **kwargs):
        self.cli = kwargs


def load():
    spec = importlib.util.spec_from_file_location("hermes_prompt_inject", PLUGIN)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["HERMES_HOME"] = tmp
        home = Path(tmp)
        plugin = load()
        ctx = FakeCtx()
        plugin.register(ctx)

        ok("section 注册", ctx.section is not None)
        ok("pre_llm_call 注册", "pre_llm_call" in ctx.hooks)
        ok("斜杠命令注册", "prompt-inject" in ctx.commands)
        ok("CLI 命令注册", ctx.cli and ctx.cli["name"] == "prompt-inject")

        # 默认开、section 模式；空正文什么都不注入
        ok("默认开启", plugin.is_enabled() is True)
        ok("默认模式", plugin.mode() == "section", plugin.mode())
        ok("空正文", ctx.section({"session_id": "s1"}) == "")

        # 正文注入 + ChatML 剥离
        plugin.write_text("<|im_start|>system:\n只输出 JSON。\n<|im_end|>")
        text = ctx.section({"session_id": "s1", "profile_name": "default"})
        ok("注入正文", text == "只输出 JSON。", repr(text))
        rec = json.loads((home / "prompt-inject" / "render.json").read_text())
        ok("渲染记录", rec["chars"] == len(text) and rec["source"] == "section", rec)
        ok("记录 session", rec["session_id"] == "s1", rec)

        # section 模式下 pre_llm_call 不注入
        ok("section 模式不碰用户消息", ctx.hooks["pre_llm_call"](session_id="s1") is None)

        # 关闭
        plugin.set_enabled(False)
        ok("关闭后 section 空", ctx.section({"session_id": "s2"}) == "")
        ok("关闭后 turn 空", ctx.hooks["pre_llm_call"](session_id="s2") is None)
        plugin.set_enabled(True)

        # turn 模式：下一轮注入一次，正文不变不重复
        plugin.set_mode("turn")
        ok("turn 模式 section 空", ctx.section({"session_id": "s3"}) == "")
        first = ctx.hooks["pre_llm_call"](session_id="s3")
        ok("turn 注入", isinstance(first, dict) and first["context"] == "只输出 JSON。", first)
        ok("turn 去重", ctx.hooks["pre_llm_call"](session_id="s3") is None)
        plugin.write_text("换成新正文。")
        again = ctx.hooks["pre_llm_call"](session_id="s3")
        ok("正文变更后重新注入", again and again["context"] == "换成新正文。", again)

        # 截断
        plugin.write_text("x" * 5000)
        clipped = ctx.section({"session_id": "s4"}) if plugin.set_mode("section") or True else ""
        ok("截断到 4000", len(clipped) == 4000, len(clipped))
        ok("截断记录", plugin.last_render().get("over_limit") is True, plugin.last_render())

        # 命令面
        status = plugin.handle_command("status")
        ok("status 含开关", "开启" in status and "section" in status, status)
        ok("set 命令", "已覆盖" in plugin.handle_command("set 短句。"))
        ok("append 命令", "已追加" in plugin.handle_command("append 尾部。"))
        ok("show 含正文", "短句。" in plugin.handle_command("show"))
        ok("path 含路径", str(home) in plugin.handle_command("path"))
        ok("未知子命令", "未知子命令" in plugin.handle_command("nope"))
        # 共享来源：把正文指向外部文件
        shared = home / "shared-prompt.md"
        shared.write_text("共享正文。", encoding="utf-8")
        ok("source 切换", "正文来源 =" in plugin.handle_command("source %s" % shared))
        ok("共享正文生效", plugin.read_text().strip() == "共享正文。", plugin.read_text())
        plugin.set_mode("section")
        ok("共享正文进 section", plugin.compose({"session_id": "s5"}, "section") == "共享正文。")
        ok("source 复位", "已复位" in plugin.handle_command("source default"))
        ok("复位后回默认文件", str(plugin.source_path()) == str(plugin.text_path()))

        # soul 通道：无 SOUL.md 时创建；有内容时保留块外原文；重复写不叠加
        plugin.write_text("最前的规则。")
        ok("soul on", "已写入 SOUL.md" in plugin.handle_command("soul on"))
        soul = (home / "SOUL.md").read_text(encoding="utf-8")
        ok("soul 含正文", soul.startswith("<!-- prompt-inject:soul:start -->") and "最前的规则。" in soul, soul[:80])
        ok("soul present", plugin.soul_present() is True)
        ok("soul 幂等", "已写入" in plugin.handle_command("soul on"))
        soul = (home / "SOUL.md").read_text(encoding="utf-8")
        ok("soul 不重复", soul.count("<!-- prompt-inject:soul:start -->") == 1, soul.count("<!-- prompt-inject:soul:start -->"))
        ok("soul off", "已从 SOUL.md 删掉" in plugin.handle_command("soul off"))
        ok("soul off 后无文件", not (home / "SOUL.md").exists())
        (home / "SOUL.md").write_text("身份正文。\n", encoding="utf-8")
        plugin.handle_command("soul on")
        soul = (home / "SOUL.md").read_text(encoding="utf-8")
        ok("soul 保留原文", "身份正文。" in soul and soul.rstrip().endswith("身份正文。"), soul[-40:])
        plugin.write_text("换了。")
        plugin.handle_command("soul sync")
        ok("soul 快照更新", "换了。" in (home / "SOUL.md").read_text(encoding="utf-8"))
        plugin.handle_command("soul off")
        ok("soul 只留原文", (home / "SOUL.md").read_text(encoding="utf-8").strip() == "身份正文。")
        ok("soul 空正文拒绝", (plugin.write_text("") == 0) and "正文为空" in plugin.handle_command("soul on"))

        # 整份替换 + 还原
        (home / "SOUL.md").write_text("原身份。\n", encoding="utf-8")
        plugin.write_text("替换后的全文。")
        out = plugin.handle_command("soul replace")
        ok("replace 提示", "已整份替换" in out and "原文备份" in out, out)
        ok("SOUL 被替换", (home / "SOUL.md").read_text(encoding="utf-8").strip() == "替换后的全文。")
        ok("备份是原文", (home / "prompt-inject" / "SOUL.original.md").read_text(encoding="utf-8").strip() == "原身份。")
        ok("replace 状态", plugin.soul_replaced() is True)
        ok("replace 后 mode=soul", plugin.mode() == "soul")
        ok("repeat replace 不改备份", "已整份替换" in plugin.handle_command("soul replace")
           and (home / "prompt-inject" / "SOUL.original.md").read_text(encoding="utf-8").strip() == "原身份。")
        ok("replace 时禁止 block", "先 soul off 还原" in plugin.handle_command("soul on"))
        out = plugin.handle_command("soul off")
        ok("还原提示", "已还原" in out, out)
        ok("还原后是原文", (home / "SOUL.md").read_text(encoding="utf-8").strip() == "原身份。")
        ok("还原后状态清空", plugin.soul_replaced() is False)

        # 开关即换 SOUL：on = 注入版，off = 原文
        plugin.write_text("注入版。")
        (home / "SOUL.md").write_text("原文。\n", encoding="utf-8")
        plugin.set_mode("soul")
        out = plugin.handle_command("on")
        ok("on 换 SOUL", "SOUL.md = 注入版" in out, out)
        ok("on 后内容", (home / "SOUL.md").read_text(encoding="utf-8").strip() == "注入版。")
        out = plugin.handle_command("off")
        ok("off 还原", "已还原" in out and (home / "SOUL.md").read_text(encoding="utf-8").strip() == "原文。", out)
        ok("off 后关闭", plugin.is_enabled() is False)
        ok("再 on 又替换", "注入版" in plugin.handle_command("on")
           and (home / "SOUL.md").read_text(encoding="utf-8").strip() == "注入版。")
        plugin.handle_command("off")

        plugin.set_mode("section")
        ok("清空正文", plugin.write_text("") == 0)

        # 正文里出现保留标记不被注入？—— 本插件不处理核心标记，交给核心跳过；这里只验证正常返回
        ok("自测通过", True)

    print("prompt-inject smoke: %d 项通过" % checks)
    return 0


if __name__ == "__main__":
    sys.exit(main())
