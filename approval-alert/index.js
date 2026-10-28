import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

/**
 * Host half of `@local/approval-alert`.
 *
 * 审批请求由 `approval/request` waterfall 发出:本插件只是旁观者,
 * 收到后立刻把决定权交给下一位 answerer(桌面 UI),绝不替用户作答。
 *
 * 通知走 vendor/DshNotifier.app:它是 terminal-notifier 的副本,换了
 * ygelon Harness 的图标与显示名,所以横幅左侧是 Y 图标,
 * 顶部显示 "ygelon Harness";点通知会把 DSH 带到前台。
 */

const NOTIFIER = fileURLToPath(
  new URL('./vendor/DshNotifier.app/Contents/MacOS/DshNotifier', import.meta.url),
);
const OSASCRIPT = '/usr/bin/osascript';

const DEFAULTS = Object.freeze({
  enabled: true,
  sound: 'Glass',
  cooldownMs: 2500,
  reasonLimit: 160,
});

/** AppleScript 字符串字面量:JSON 的引号与反斜杠转义规则可直接复用。 */
function literal(value) {
  return JSON.stringify(String(value).replace(/\s+/g, ' ').trim());
}

function clip(text, limit) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  return flat.slice(0, Math.max(0, limit - 1)) + '…';
}

/** 审批文案带多语言表示时优先中文,其次英文,最后退回原始 reason。 */
function reasonText(request) {
  const display = request?.displayReason;
  if (display !== null && typeof display === 'object') {
    for (const key of ['zh', 'en']) {
      const value = display[key];
      if (typeof value === 'string' && value.trim() !== '') return value;
    }
  }
  return typeof request?.reason === 'string' ? request.reason : '';
}

function notifyMac({ title, subtitle, message, sound }) {
  if (process.platform !== 'darwin') return;
  if (existsSync(NOTIFIER)) {
    const args = [
      '-title', title,
      '-subtitle', subtitle,
      '-message', message,
      // 点通知正文:把 DSH 带到前台(没运行也会被 open 拉起)。
      '-activate', 'com.deepseek.dsh',
      '-execute', '/usr/bin/open -a "DeepSeek Harness"',
    ];
    if (sound !== '') args.push('-sound', sound);
    execFile(NOTIFIER, args, { timeout: 15000 }, () => {});
    return;
  }
  // 兜底:没有 vendor 通知器时退回 osascript(图标会是「脚本编辑器」)。
  const pieces = ['display notification ' + literal(message)];
  if (title !== '') pieces.push('with title ' + literal(title));
  if (subtitle !== '') pieces.push('subtitle ' + literal(subtitle));
  if (sound !== '') pieces.push('sound name ' + literal(sound));
  execFile(OSASCRIPT, ['-e', pieces.join(' ')], { timeout: 8000 }, () => {});
}

/** Shared self-check record: the Settings → Plugins tab reads these files. */
function recordSelfCheck(misses) {
  try {
    const dir = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'storages', 'self-check');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'approval-alert.json'),
      JSON.stringify({ ok: misses.length === 0, misses, at: Date.now() }, null, 2),
      { mode: 0o600 },
    );
  } catch {
    // A failed record must never block the plugin itself.
  }
}

/**
 * The notifier binary can exist and still be silenced by macOS. `-diagnose` is
 * the only local source of truth (it exits 3 and prints `authorization denied`
 * when the system switch is off), so run it once at activation and turn a
 * denial into a self-check miss with a concrete fix. Never blocks the plugin.
 */
function diagnoseNotifier(report) {
  if (process.platform !== 'darwin' || !existsSync(NOTIFIER)) return;
  execFile(NOTIFIER, ['-diagnose'], { timeout: 6000 }, (error, stdout) => {
    const match = String(stdout ?? '').match(/authorization\s+(\S+)/);
    if (match === null || match[1] === 'authorized') return;
    report({
      anchor: 'macOS 通知权限 com.deepseek.dsh.notifier',
      impact: '审批横幅不会弹出（系统里通知被关掉了）',
      hint: '系统设置 → 通知 → “DeepSeek Harness 提醒” → 允许通知；'
        + '或 tccutil reset UserNotification com.deepseek.dsh.notifier',
    });
  });
}

export function apply(ctx, config = {}) {
  const options = { ...DEFAULTS, ...config };
  if (options.enabled === false) return;

  // One-shot self-check: the waterfall name is unofficial and the notifier is
  // a vendored binary; either going missing silences the plugin.
  const misses = [];
  if (typeof ctx.on !== 'function') {
    misses.push({ anchor: 'ctx.on', impact: '无法挂审批监听，提醒不会触发' });
  }
  if (!existsSync(NOTIFIER)) {
    misses.push({ anchor: '通知程序 ' + NOTIFIER, impact: '提醒不会弹出' });
  } else if (!existsSync(OSASCRIPT)) {
    misses.push({ anchor: OSASCRIPT, impact: '提醒不会弹出' });
  }
  recordSelfCheck(misses);
  for (const miss of misses) {
    console.warn('[approval-alert] 自检：' + miss.anchor + ' → ' + miss.impact);
  }

  // macOS 权限是“插件装好了但不弹”的常见原因；只查文件存在发现不了。
  diagnoseNotifier((miss) => {
    if (misses.some((item) => item.anchor === miss.anchor)) return;
    misses.push(miss);
    recordSelfCheck(misses);
    console.warn('[approval-alert] 自检：' + miss.anchor + ' → ' + miss.impact);
    if (miss.hint !== undefined) console.warn('[approval-alert] 修复：' + miss.hint);
  });

  if (typeof ctx.on !== 'function') return;

  const lastByTool = new Map();

  const announce = (request) => {
    const toolName = typeof request?.toolName === 'string' && request.toolName !== ''
      ? request.toolName
      : '工具';
    const now = Date.now();
    const previous = lastByTool.get(toolName) ?? 0;
    if (now - previous < options.cooldownMs) return;
    lastByTool.set(toolName, now);
    if (lastByTool.size > 32) {
      for (const [key, at] of lastByTool) {
        if (now - at > 60_000) lastByTool.delete(key);
      }
    }
    notifyMac({
      title: 'ygelon Harness',
      subtitle: '需要你的审批 · ' + toolName,
      message: clip(reasonText(request), options.reasonLimit)
        || '在 ygelon Harness 里点「允许」或「拒绝」。',
      sound: typeof options.sound === 'string' ? options.sound : '',
    });
  };

  // prepend 是关键:人类 answerer(桌面 UI)会直接「认领」请求并等用户点按钮,
  // 注册在它后面的监听器永远轮不到。我们抢在它前面,只观察,再 next() 交还决定权。
  ctx.on('approval/request', (request, next) => {
    try {
      announce(request);
    } catch {
      // 通知失败绝不能影响审批本身。
    }
    return next();
  }, true);
}
