"""prompt-inject — 系统提示附加器（Hermes 版）

把 ``<HERMES_HOME>/prompt-inject/prompt.md`` 里的正文塞进 Hermes 的提示词，
并且能一键关掉。两条通道：

  section（默认）  ctx.register_system_prompt_section(...) —— 官方「插件系统提示段」，
                   渲染成 ``## Plugin Context: prompt-inject``，落在 memory 之后。
                   **每个会话渲染一次**，之后随会话持久化；改正文/切开关 → 下一个会话生效。
  turn            pre_llm_call 返回 {"context": ...} —— 注入当轮用户消息。
                   **下一轮立刻生效**，同一会话内正文不变就不重复注入。
  soul            「写进 SOUL.md 顶部」的托管块 —— SOUL 是系统提示第一块，无 4k 上限，
                   压缩/重启都会重读；开关 = 加/删托管块，块外内容原样不动。
                   注意它是快照：改正文后要再跑一次 soul on/sync。

正文与开关都在 HERMES_HOME 里（``~/.hermes`` 或 ``~/.hermes/profiles/<name>``）：

  <home>/prompt-inject/prompt.md    正文
  <home>/prompt-inject/state.json   {"enabled": true, "mode": "section"}
  <home>/prompt-inject/render.json  最近一次真实渲染的记录（判断是否生效的硬证据）

控制面：``/prompt-inject status|on|off|mode|set|append|show|path``（会话内斜杠命令）
      ``hermes prompt-inject ...``（CLI，同一套子命令）
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

logger = logging.getLogger(__name__)

SECTION_ID = "prompt-inject"
POSITION = "after_memory"
MAX_CHARS = 4000  # 官方契约默认上限；真实上限运行时从核心常量读（核心被打过补丁就跟着变）
MODES = ("section", "turn", "soul")

# 正文里若带 ChatML / project 包裹，注入后会形成第二套未闭合信封，模型当成内容读。
_STRIP = (
    (re.compile(r"<\|im_start\|>\s*system\s*:\s*", re.I), ""),
    (re.compile(r"</?project_instructions>", re.I), ""),
    (re.compile(r"<\|im_end\|>"), ""),
)

# 会话内「turn 模式」去重：session_id -> 已注入正文的指纹
_turn_injected: Dict[str, str] = {}
_TURN_CACHE_MAX = 64


# ------------------------------------------------------------------ 路径

def char_limit() -> int:
    """当前生效的段上限：核心常量优先，读不到才用 4000 兜底。"""
    try:
        from hermes_cli.plugins_dispatch import MAX_SYSTEM_PROMPT_SECTION_CHARS as core_max

        return max(1, int(core_max))
    except Exception:
        return MAX_CHARS


def _home() -> Path:
    """当前 profile 的 HERMES_HOME；读不到时按 env → ~/.hermes 回落。"""
    try:
        from hermes_constants import get_hermes_home

        return Path(get_hermes_home())
    except Exception:
        override = os.environ.get("HERMES_HOME", "").strip()
        if override:
            return Path(override).expanduser()
        return Path.home() / ".hermes"


def data_dir() -> Path:
    return _home() / "prompt-inject"


def text_path() -> Path:
    return data_dir() / "prompt.md"


def source_path() -> Path:
    """正文实际读取位置：state.json 里的 source 优先，可用于和别的工具共用一份文件。"""
    raw = str(read_state().get("source") or "").strip()
    if raw:
        return Path(raw).expanduser()
    return text_path()


def state_path() -> Path:
    return data_dir() / "state.json"


def render_path() -> Path:
    return data_dir() / "render.json"


# ------------------------------------------------------------------ 状态

def read_state() -> Dict[str, Any]:
    try:
        raw = json.loads(state_path().read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            return raw
    except Exception:
        pass
    return {}


def is_enabled() -> bool:
    """默认开：只有明确写成 false 才算关。"""
    return read_state().get("enabled") is not False


def mode() -> str:
    value = str(read_state().get("mode") or "section").strip().lower()
    return value if value in MODES else "section"


def _write_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name("%s.%d.tmp" % (path.name, os.getpid()))
    tmp.write_text(json.dumps(dict(payload), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def set_enabled(flag: bool) -> bool:
    state = read_state()
    state.update(enabled=bool(flag), at=datetime.now().astimezone().isoformat(timespec="seconds"))
    _write_json(state_path(), state)
    if not flag:
        _turn_injected.clear()
    return bool(flag)


def set_mode(value: str) -> str:
    value = str(value or "").strip().lower()
    if value not in MODES:
        raise ValueError("mode 只能是 section 或 turn")
    state = read_state()
    state.update(mode=value, at=datetime.now().astimezone().isoformat(timespec="seconds"))
    _write_json(state_path(), state)
    _turn_injected.clear()
    return value


# ------------------------------------------------------------------ 正文

def read_text() -> str:
    try:
        return source_path().read_text(encoding="utf-8")
    except Exception:
        return ""


def write_text(text: str) -> int:
    body = str(text if text is not None else "")
    target = source_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name("%s.%d.tmp" % (target.name, os.getpid()))
    tmp.write_text(body, encoding="utf-8")
    tmp.replace(target)
    _turn_injected.clear()
    return len(body)


def strip_wrapping(text: str) -> str:
    out = str(text or "")
    for pattern, repl in _STRIP:
        out = pattern.sub(repl, out)
    return out.strip()


def compose(session_info: Optional[Mapping[str, Any]], source: str) -> str:
    """组装要注入的正文；同时写 render.json —— 这是「真的被渲染了」的唯一硬证据。"""
    if not is_enabled() or mode() != source:
        return ""
    body = strip_wrapping(read_text())
    if not body:
        _record(source, 0, session_info, over_limit=False)
        return ""
    limit = char_limit()
    over = len(body) > limit
    if over:
        body = body[:limit]
        logger.warning("[prompt-inject] 正文超过 %d 字符，已截断（源文件未改）", limit)
    _record(source, len(body), session_info, over_limit=over)
    return body


def _record(source: str, chars: int, session_info: Optional[Mapping[str, Any]], *, over_limit: bool) -> None:
    info = dict(session_info or {})
    payload = {
        "at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "chars": chars,
        "source": source,
        "over_limit": over_limit,
        "session_id": str(info.get("session_id") or ""),
        "profile": str(info.get("profile_name") or ""),
        "pid": os.getpid(),
    }
    try:
        _write_json(render_path(), payload)
    except Exception as exc:  # 写不了记录不影响注入
        logger.debug("[prompt-inject] render.json 写入失败: %s", exc)


def last_render() -> Dict[str, Any]:
    try:
        data = json.loads(render_path().read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


# ------------------------------------------------------------------ soul 通道

SOUL_START = "<!-- prompt-inject:soul:start -->"
SOUL_END = "<!-- prompt-inject:soul:end -->"


def soul_path() -> Path:
    return _home() / "SOUL.md"


def soul_present() -> bool:
    try:
        text = soul_path().read_text(encoding="utf-8")
    except Exception:
        return False
    return SOUL_START in text and SOUL_END in text


def soul_cap() -> int:
    """SOUL.md 的截断上限：config 的 context_file_max_chars 优先，否则官方动态下限 20000。"""
    try:
        from hermes_cli.config import load_config

        value = (load_config() or {}).get("context_file_max_chars")
        if isinstance(value, (int, float)) and value > 0:
            return int(value)
    except Exception:
        pass
    return 20000


def _strip_soul_block(text: str) -> str:
    start = text.find(SOUL_START)
    if start < 0:
        return text
    end = text.find(SOUL_END, start)
    if end < 0:
        return text
    head = text[:start].rstrip("\n")
    rest = text[end + len(SOUL_END):].lstrip("\n")
    if head and rest:
        return head + "\n\n" + rest
    return head or rest


def _write_soul(text: str) -> None:
    path = soul_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name("%s.%d.tmp" % (path.name, os.getpid()))
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def soul_backup_path() -> Path:
    return data_dir() / "SOUL.original.md"


def soul_replaced() -> bool:
    return read_state().get("soul") == "replace"


def soul_on() -> str:
    """托管块：插在 SOUL.md 顶部，块外原文不动。"""
    if soul_replaced():
        raise ValueError("当前是替换模式（SOUL.md 已被整份替换）。先 soul off 还原原文，再开托管块。")
    body = strip_wrapping(read_text())
    if not body:
        raise ValueError("正文为空，先把 prompt.md 写出来再开 soul 通道")
    current = ""
    try:
        current = soul_path().read_text(encoding="utf-8")
    except Exception:
        current = ""
    base = _strip_soul_block(current)
    block = "%s\n%s\n%s" % (SOUL_START, body, SOUL_END)
    _write_soul(block + ("\n\n" + base if base else ""))
    set_mode("soul")
    return body


def soul_replace() -> tuple:
    """整份替换：先把原文备份到 prompt-inject/SOUL.original.md（另存一份带时间戳），再写正文。"""
    body = strip_wrapping(read_text())
    if not body:
        raise ValueError("正文为空，先把 prompt.md 写出来再替换 SOUL.md")
    try:
        current = soul_path().read_text(encoding="utf-8")
    except Exception:
        current = ""
    state = read_state()
    if state.get("soul") != "replace":
        data_dir().mkdir(parents=True, exist_ok=True)
        backup = soul_backup_path()
        backup.write_text(current, encoding="utf-8")
        # 只在内容变化时留时间戳副本，反复 on/off 不会堆一堆一样的备份
        archive = data_dir() / ("SOUL.original-%s.md" % datetime.now().strftime("%Y%m%d-%H%M%S"))
        if not archive.exists():
            same = any(x.read_text(encoding="utf-8") == current for x in data_dir().glob("SOUL.original*.md"))
            if not same:
                archive.write_text(current, encoding="utf-8")
        if not archive.exists():
            archive = backup
        state["soul"] = "replace"
        state["soul_backup"] = str(backup)
        state["soul_archive"] = str(archive)
        state["soul_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
        state["soul_chars"] = len(body)
        _write_json(state_path(), state)
        set_mode("soul")
    else:
        state["soul_chars"] = len(body)
        _write_json(state_path(), state)
    _write_soul(body)
    return body, soul_backup_path(), str(read_state().get("soul_archive") or "")


def soul_off() -> str:
    """还原：替换模式 → 写回备份原文；托管块 → 只删块。"""
    if soul_replaced():
        state = read_state()
        backup = Path(str(state.get("soul_backup") or soul_backup_path()))
        if not backup.exists():
            raise ValueError("备份不存在：%s，拒绝还原以防丢原文" % backup)
        original = backup.read_text(encoding="utf-8")
        if original.strip():
            _write_soul(original if original.endswith("\n") else original + "\n")
        else:
            try:
                soul_path().unlink()
            except Exception:
                _write_soul("")
        for key in ("soul", "soul_backup", "soul_archive", "soul_at", "soul_chars"):
            state.pop(key, None)
        _write_json(state_path(), state)
        return "restored"
    try:
        current = soul_path().read_text(encoding="utf-8")
    except Exception:
        return "noop"
    if SOUL_START not in current and SOUL_END not in current:
        return "noop"
    base = _strip_soul_block(current)
    if base.strip():
        _write_soul(base if base.endswith("\n") else base + "\n")
    else:
        try:
            soul_path().unlink()
        except Exception:
            _write_soul("")
    return "block-removed"


# ------------------------------------------------------------------ 两条通道

def _section_text(session_info: Mapping[str, Any]) -> str:
    """ctx.register_system_prompt_section 的回调：每个新会话调一次。"""
    return compose(session_info, "section")


def _on_pre_llm_call(**kwargs: Any) -> Optional[Dict[str, str]]:
    """turn 模式：同一会话、同一正文只注入一次；改正文或重开开关会重新注入。"""
    if mode() != "turn":
        return None
    key = str(kwargs.get("session_id") or "unknown")
    body = compose(kwargs, "turn")
    if not body:
        _turn_injected.pop(key, None)
        return None
    fingerprint = str(hash(body))
    if _turn_injected.get(key) == fingerprint:
        return None
    if len(_turn_injected) >= _TURN_CACHE_MAX:
        _turn_injected.clear()
    _turn_injected[key] = fingerprint
    return {"context": body}


# ------------------------------------------------------------------ 控制面

_USAGE = (
    "/prompt-inject status            当前状态与最近渲染记录\n"
    "/prompt-inject on | off          开 / 关\n"
    "/prompt-inject mode section      系统提示段（新会话生效）\n"
    "/prompt-inject mode turn         用户消息注入（下一轮生效）\n"
    "/prompt-inject set <正文>        覆盖正文\n"
    "/prompt-inject append <正文>     在正文末尾追加\n"
    "/prompt-inject show              看正文（截断显示）\n"
    "/prompt-inject soul on|off|sync 托管块写进 SOUL.md 顶部（块外原文不动）\n"
    "/prompt-inject soul replace      整份替换 SOUL.md（先备份原文，soul off 还原）\n"
    "/prompt-inject source [路径]     看/切换正文来源（可指向共享文件，source default 复位）\n"
    "/prompt-inject path              打印正文/状态/记录三个路径"
)


def _status() -> str:
    body = read_text()
    stripped = strip_wrapping(body)
    rec = last_render()
    enabled = is_enabled()
    current = mode()
    lines = [
        "prompt-inject: %s · 模式 %s（%s）" % (
            "开启" if enabled else "关闭",
            current,
            "系统提示段，新会话生效" if current == "section"
            else ("SOUL.md 顶部，新会话/压缩重建生效" if current == "soul" else "用户消息注入，下一轮生效"),
        ),
        "正文 %d 字符 · 注入时上限 %d%s" % (
            len(stripped),
            char_limit(),
            "（超出会被截断）" if len(stripped) > MAX_CHARS else "",
        ),
        "正文来源 %s%s" % (
            source_path(),
            "（默认位置 %s）" % text_path() if source_path() != text_path() else "",
        ),
        "状态 %s" % state_path(),
    ]
    if rec:
        lines.append("最近渲染 %s · %s 字符 · %s · session %s · pid %s" % (
            rec.get("at", "?"),
            rec.get("chars", "?"),
            rec.get("source", "?"),
            rec.get("session_id") or "-",
            rec.get("pid", "?"),
        ))
    else:
        lines.append("最近渲染 无记录 —— 还没在新会话里渲染过")
    if soul_replaced():
        state = read_state()
        lines.append("soul 通道 替换模式（SOUL.md = 正文快照 %s 字符 · 原文备份 %s）" % (
            state.get("soul_chars", "?"), state.get("soul_backup", soul_backup_path())))
    elif soul_present():
        lines.append("soul 通道 托管块已写入（快照 %d 字符 · SOUL 上限 %d）" % (len(stripped), soul_cap()))
    else:
        lines.append("soul 通道 未写入（/prompt-inject soul on|replace）")
    return "\n".join(lines)


def handle_command(raw: str) -> str:
    parts = str(raw or "").strip().split(None, 1)
    action = parts[0].lower() if parts else "status"
    rest = parts[1] if len(parts) > 1 else ""

    if action in ("status", "state"):
        return _status()
    if action == "on":
        set_enabled(True)
        if not read_text().strip():
            return "已开启，但正文是空的：用 /prompt-inject set <正文> 或编辑 %s" % text_path()
        current = mode()
        note = {
            "section": "下一个会话生效，当前会话不变。",
            "turn": "下一轮生效。",
            "soul": "SOUL.md 已换成注入版，新会话/压缩重建生效。",
        }.get(current, "")
        if current == "soul":
            try:
                body, backup, _archive = soul_replace()
            except ValueError as exc:
                return "已开启，但替换 SOUL 失败：%s" % exc
            return "已开启，SOUL.md = 注入版（%d 字符）。%s\n原文备份 %s（off 还原）" % (len(body), note, backup)
        return "已开启（%s 模式）。%s" % (current, note)
    if action == "off":
        restored = ""
        if soul_replaced():
            try:
                soul_off()
                restored = "SOUL.md 已还原成原文备份。"
            except ValueError as exc:
                restored = "还原 SOUL 失败：%s" % exc
        set_enabled(False)
        if restored:
            return "已关闭。" + restored
        return "已关闭。section 模式下当前会话已渲染的正文不会消失，下一个会话不再注入。"
    if action == "mode":
        try:
            value = set_mode(rest)
        except ValueError as exc:
            return "%s\n%s" % (exc, _USAGE)
        note = {"section": "新会话生效。", "turn": "下一轮生效。", "soul": "走 SOUL.md 顶部，先跑 soul on 写入。"}
        return "模式 = %s。%s" % (value, note.get(value, ""))
    if action == "set":
        size = write_text(rest)
        return "正文已覆盖为 %d 字符。%s" % (size, "新会话生效。" if mode() == "section" else "下一轮生效。")
    if action == "append":
        if not rest:
            return "append 需要正文。"
        old = read_text()
        size = write_text((old.rstrip() + "\n\n" + rest) if old.strip() else rest)
        return "已追加，正文 %d 字符。" % size
    if action == "show":
        body = strip_wrapping(read_text())
        if not body:
            return "正文为空。路径 %s" % text_path()
        shown = body[:2000] + ("\n…（截断，全文见 %s）" % text_path() if len(body) > 2000 else "")
        return shown
    if action == "soul":
        sub = rest.strip().lower()
        if sub == "":
            sub = "status"
        if sub in ("on", "sync"):
            try:
                body = soul_on()
            except ValueError as exc:
                return str(exc)
            warn = ""
            if len(body) > soul_cap():
                warn = "\n⚠️ 正文 %d 字符超过 SOUL 截断上限 %d，会被截断：改 context_file_max_chars 或精简。" % (
                    len(body), soul_cap())
            return "已写入 SOUL.md 顶部（%d 字符），模式切到 soul（section 不再重复注入）。%s%s\n新会话或压缩重建后生效。" % (
                len(body), "（快照，改正文后重跑 soul on 才更新）" if sub == "sync" else "", warn)
        if sub in ("replace", "take", "swap"):
            try:
                body, backup, archive = soul_replace()
            except ValueError as exc:
                return str(exc)
            warn = ""
            if len(body) > soul_cap():
                warn = "\n⚠️ 正文 %d 字符超过 SOUL 截断上限 %d，会被截断：改 context_file_max_chars 或精简。" % (
                    len(body), soul_cap())
            return ("已整份替换 SOUL.md（%d 字符），模式切到 soul。\n原文备份 %s（另存 %s）\n"
                    "soul off 还原原文；新会话或 hermes sessions refresh-prompts 后生效。%s" % (
                        len(body), backup, archive, warn))
        if sub == "off":
            try:
                result = soul_off()
            except ValueError as exc:
                return str(exc)
            if result == "restored":
                return "已还原：SOUL.md 写回原文备份，模式仍为 soul（正文不再注入）。"
            if result == "block-removed":
                return "已从 SOUL.md 删掉托管块，其余内容原样保留。"
            return "SOUL.md 没有被本插件动过，无需关闭。"
        if sub == "status":
            if soul_replaced():
                state = read_state()
                return "soul 通道 替换模式 · 正文 %d 字符 · 原文备份 %s · SOUL 上限 %d · %s" % (
                    state.get("soul_chars", 0), state.get("soul_backup", soul_backup_path()), soul_cap(), soul_path())
            return "soul 通道 %s · 正文 %d 字符 · SOUL 上限 %d · %s" % (
                "托管块已写入" if soul_present() else "未写入", len(strip_wrapping(read_text())), soul_cap(), soul_path())
        return "soul 子命令：on / replace / off / sync / status\n%s" % _USAGE
    if action == "source":
        if not rest.strip():
            return "正文来源 %s\n默认 %s" % (source_path(), text_path())
        if rest.strip().lower() in ("default", "-", "reset"):
            state = read_state()
            state.pop("source", None)
            _write_json(state_path(), state)
            _turn_injected.clear()
            return "正文来源已复位到 %s" % text_path()
        target = Path(rest.strip()).expanduser()
        state = read_state()
        state["source"] = str(target)
        _write_json(state_path(), state)
        _turn_injected.clear()
        exists = "存在" if target.exists() else "不存在（先写正文再开）"
        return "正文来源 = %s（%s）" % (target, exists)
    if action == "path":
        return "正文 %s\n状态 %s\n记录 %s" % (source_path(), state_path(), render_path())
    if action in ("help", "?"):
        return _USAGE
    return "未知子命令 %r\n%s" % (action, _USAGE)


def _safe_command(raw: str) -> str:
    try:
        return handle_command(raw)
    except Exception as exc:  # 斜杠命令不能把回合打断
        logger.warning("[prompt-inject] 命令失败: %s", exc)
        return "prompt-inject 执行失败: %s" % exc


# ------------------------------------------------------------------ CLI

def _cli_setup(subparser: Any) -> None:
    subparser.add_argument(
        "action",
        nargs="*",
        help="status | on | off | mode section|turn | set <正文> | append <正文> | show | path",
    )


def _cli_run(args: Any) -> int:
    raw = " ".join(str(x) for x in (getattr(args, "action", None) or []))
    print(_safe_command(raw))
    return 0


# ------------------------------------------------------------------ 注册

def register(ctx: Any) -> None:
    try:
        data_dir().mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        logger.warning("[prompt-inject] 数据目录不可用: %s", exc)

    try:
        ctx.register_system_prompt_section(
            SECTION_ID, _section_text, position=POSITION, max_chars=char_limit(),
        )
    except Exception as exc:
        logger.warning("[prompt-inject] 系统提示段注册失败: %s", exc)

    try:
        ctx.register_hook("pre_llm_call", _on_pre_llm_call)
    except Exception as exc:
        logger.warning("[prompt-inject] pre_llm_call 注册失败: %s", exc)

    try:
        ctx.register_command(
            SECTION_ID,
            _safe_command,
            description="系统提示附加器：status / on / off / mode / set / append / show / path",
            args_hint="[status|on|off|mode|set|append|show|path]",
        )
    except Exception as exc:
        logger.warning("[prompt-inject] 斜杠命令注册失败: %s", exc)

    try:
        ctx.register_cli_command(
            name=SECTION_ID,
            help="系统提示附加器：改正文、切开关、选注入通道",
            setup_fn=_cli_setup,
            handler_fn=_cli_run,
            description="Reads <HERMES_HOME>/prompt-inject/prompt.md into the system prompt (section) "
                        "or the user message (turn), with an on/off switch.",
        )
    except Exception as exc:
        logger.warning("[prompt-inject] CLI 命令注册失败: %s", exc)

    logger.info(
        "[prompt-inject] 已加载：enabled=%s mode=%s 正文=%s",
        is_enabled(), mode(), text_path(),
    )
