/**
 * @local/prompt-inject — 客户端半
 *
 * 只有一个入口：设置 → 插件 → 「提示词」页签。
 * 不往界面上加悬浮按钮、不加 dock、不加胶囊。
 */
window.__ModuleLoader__.load({
  id: '@local/prompt-inject',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback, useRef } = React;

    const NS = 'settings.prompt-inject';

    const DICTS = {
      zh: {
        'tab.label': '系统提示',
        'title': '系统提示文本',
        'lead': '这里写的内容每轮都会附加到系统提示词的最前面。开关关掉后一个字都不发，正文仍保留。',
        'state.on': '已开启 · 每轮生效',
        'state.off': '已关闭 · 不附加',
        'state.unknown': '读取中…',
        'btn.apply': '应用（开启）',
        'btn.restore': '还原（关闭）',
        'btn.save': '只保存正文',
        'btn.reload': '重新读取',
        'meta.chars': '正文 {n} 字',
        'meta.path': '文件',
        'meta.unsaved': '有未保存的改动',
        'meta.inject': '实际附加 {n} 字',
        'meta.lastInject': '上次附加：{t}',
        'meta.lastInject.never': '上次附加：还没有（下一轮对话才会发生）',
        'meta.saved': '已保存',
        'hint': '也可以直接用编辑器改这个文件，存盘后下一轮对话就生效，不用重启。',
        'ok.apply': '已开启，下一轮对话生效',
        'ok.restore': '已关闭，正文保留；随时可以再点「应用」',
        'ok.save': '已保存',
        'err.load': '读取失败：{e}',
        'err.save': '保存失败：{e}',
        'err.toggle': '切换失败：{e}',
        'warn.empty': '正文是空的，开启后也不会发出任何内容',
        'warn.dir': '正文目录不可用（外接盘没挂载？）：{p}',
      },
      en: {
        'tab.label': 'System prompt',
        'title': 'System prompt text',
        'lead': 'The text below is prepended to the system prompt on every turn. Turning the switch off sends nothing; the text is kept.',
        'state.on': 'On · every turn',
        'state.off': 'Off · not applied',
        'state.unknown': 'Loading…',
        'btn.apply': 'Apply (turn on)',
        'btn.restore': 'Restore (turn off)',
        'btn.save': 'Save text only',
        'btn.reload': 'Reload',
        'meta.chars': '{n} characters',
        'meta.path': 'File',
        'meta.unsaved': 'Unsaved changes',
        'meta.inject': '{n} characters applied',
        'meta.lastInject': 'Last applied: {t}',
        'meta.lastInject.never': 'Last applied: not yet (happens on the next turn)',
        'meta.saved': 'Saved',
        'hint': 'You can also edit that file directly; the next turn picks it up with no restart.',
        'ok.apply': 'Injection on — applies from the next turn',
        'ok.restore': 'Injection off — text kept',
        'ok.save': 'Saved',
        'err.load': 'Load failed: {e}',
        'err.save': 'Save failed: {e}',
        'err.toggle': 'Toggle failed: {e}',
        'warn.empty': 'The text is empty — enabled but sends nothing',
        'warn.dir': 'Prompt directory unavailable (external drive unmounted?): {p}',
      },
    };

    /** 读 JSON，空响应/非 JSON 都转成人话，绝不抛 "Unexpected end of JSON input"。 */
    async function api(path, init) {
      const res = await fetch(path, init);
      const raw = await res.text();
      if (!raw) throw new Error(`空响应（HTTP ${res.status}）`);
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(`返回的不是 JSON（HTTP ${res.status}）`);
      }
      if (data && data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    }

    function formatTime(iso) {
      try {
        const d = new Date(iso);
        return d.toLocaleTimeString('zh-CN', { hour12: false });
      } catch {
        return String(iso || '');
      }
    }

    const S = {
      root: { display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 2px 24px' },
      head: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
      title: { fontSize: 15, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      pill: (on) => ({
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '2px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600,
        color: on ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)',
        border: '1px solid color-mix(in srgb, currentColor 35%, transparent)',
        background: on ? 'color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent)' : 'transparent',
      }),
      dot: (on) => ({
        width: 6, height: 6, borderRadius: 999,
        background: on ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-tertiary)',
      }),
      lead: { fontSize: 12.5, lineHeight: 1.7, color: 'var(--dsw-alias-label-secondary)', maxWidth: 720 },
      row: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
      btn: (primary) => ({
        appearance: 'none', cursor: 'pointer', height: 30, padding: '0 14px',
        borderRadius: 8, fontSize: 12.5, fontWeight: primary ? 600 : 500,
        border: primary
          ? '1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 70%, transparent)'
          : '1px solid var(--dsw-alias-border-l1)',
        background: primary
          ? 'color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent)'
          : 'var(--dsw-alias-bg-layer-2)',
        color: primary ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-primary)',
      }),
      meta: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', fontFamily: 'var(--dsw-font-family-mono, monospace)' },
      mono: { fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)', fontFamily: 'var(--dsw-font-family-mono, monospace)', wordBreak: 'break-all' },
      area: {
        width: '100%', minHeight: 320, resize: 'vertical', boxSizing: 'border-box',
        padding: '10px 12px', borderRadius: 10, lineHeight: 1.6, fontSize: 12.5,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'var(--dsw-font-family-mono, monospace)',
        outline: 'none',
      },
      notice: (kind) => ({
        fontSize: 12.5, lineHeight: 1.6, padding: '7px 10px', borderRadius: 8,
        color: kind === 'error' ? 'var(--dsw-alias-state-error)' : 'var(--dsw-alias-label-secondary)',
        background: kind === 'error'
          ? 'color-mix(in srgb, var(--dsw-alias-state-error) 10%, transparent)'
          : 'color-mix(in srgb, var(--dsw-alias-label-secondary) 8%, transparent)',
      }),
    };

    function PromptTab() {
      const t = useT();
      const [info, setInfo] = useState(null);
      const [text, setText] = useState('');
      const [dirty, setDirty] = useState(false);
      const [busy, setBusy] = useState(false);
      const [notice, setNotice] = useState(null);
      const textRef = useRef('');
      textRef.current = text;

      const load = useCallback(async () => {
        try {
          const [status, body] = await Promise.all([
            api('/prompt-inject/status'),
            api('/prompt-inject/text'),
          ]);
          setInfo(status);
          setText(body.text || '');
          setDirty(false);
          setNotice(null);
        } catch (error) {
          setNotice({ kind: 'error', text: t('err.load', { e: String(error.message || error) }) });
        }
      }, [t]);

      useEffect(() => { load(); }, [load]);

      const saveText = useCallback(async () => {
        const payload = JSON.stringify({ text: textRef.current });
        return api('/prompt-inject/text', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: payload,
        });
      }, []);

      const onApply = useCallback(async () => {
        if (busy) return;
        setBusy(true);
        try {
          await saveText();
          await api('/prompt-inject/enabled', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ enabled: true }),
          });
          setDirty(false);
          setNotice({ kind: 'ok', text: t('ok.apply') });
          await load();
        } catch (error) {
          setNotice({ kind: 'error', text: t('err.toggle', { e: String(error.message || error) }) });
        } finally {
          setBusy(false);
        }
      }, [busy, load, saveText, t]);

      const onRestore = useCallback(async () => {
        if (busy) return;
        setBusy(true);
        try {
          await api('/prompt-inject/enabled', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ enabled: false }),
          });
          setNotice({ kind: 'ok', text: t('ok.restore') });
          await load();
        } catch (error) {
          setNotice({ kind: 'error', text: t('err.toggle', { e: String(error.message || error) }) });
        } finally {
          setBusy(false);
        }
      }, [busy, load, t]);

      const onSave = useCallback(async () => {
        if (busy) return;
        setBusy(true);
        try {
          await saveText();
          setDirty(false);
          setNotice({ kind: 'ok', text: t('ok.save') });
          await load();
        } catch (error) {
          setNotice({ kind: 'error', text: t('err.save', { e: String(error.message || error) }) });
        } finally {
          setBusy(false);
        }
      }, [busy, load, saveText, t]);

      const enabled = info ? info.enabled !== false : false;
      const chars = text.length;

      return h('div', { style: S.root },
        h('div', { style: S.head },
          h('span', { style: S.title }, t('title')),
          h('span', { style: S.pill(enabled) },
            h('span', { style: S.dot(enabled) }),
            info ? (enabled ? t('state.on') : t('state.off')) : t('state.unknown'),
          ),
          h('span', { style: S.meta }, t('meta.chars', { n: chars })),
          info && typeof info.inject_chars === 'number'
            ? h('span', { style: S.meta }, '· ' + t('meta.inject', { n: info.inject_chars }))
            : null,
          dirty ? h('span', { style: S.meta }, '· ' + t('meta.unsaved')) : null,
        ),

        h('div', { style: S.lead }, t('lead')),

        h('div', { style: S.row },
          h('button', {
            type: 'button', style: S.btn(true), disabled: busy, onClick: onApply,
          }, t('btn.apply')),
          h('button', {
            type: 'button', style: S.btn(false), disabled: busy, onClick: onRestore,
          }, t('btn.restore')),
          h('button', {
            type: 'button', style: S.btn(false), disabled: busy || !dirty, onClick: onSave,
          }, t('btn.save')),
          h('button', {
            type: 'button', style: S.btn(false), disabled: busy, onClick: load,
          }, t('btn.reload')),
        ),

        h('div', { style: S.meta },
          info && info.last_inject && info.last_inject.at
            ? t('meta.lastInject', { t: formatTime(info.last_inject.at) + ' · ' + info.last_inject.chars + ' 字' })
            : t('meta.lastInject.never'),
        ),

        info && info.available === false
          ? h('div', { style: S.notice('error') }, t('warn.dir', { p: info.dir || info.path }))
          : null,
        notice ? h('div', { style: S.notice(notice.kind) }, notice.text) : null,
        enabled && chars === 0 ? h('div', { style: S.notice('warn') }, t('warn.empty')) : null,

        h('textarea', {
          style: S.area,
          value: text,
          spellCheck: false,
          onChange: (event) => { setText(event.target.value); setDirty(true); },
        }),

        h('div', { style: S.mono }, t('meta.path') + '：' + (info ? info.path : '—')),
        h('div', { style: S.meta }, t('hint')),
      );
    }

    let translate = (key) => key;
    function useT() { return translate; }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const bound = ctx.locale.bind(NS);
        translate = bound;

        ctx.effect(() => ctx.locale.register(NS, DICTS));

        ctx.effect(() => ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
          name: 'settings.plugins.tab',
          id: 'prompt-inject',
          order: 30,
          label: () => bound('tab.label'),
          locale: NS,
        }, PromptTab)));
      },
    };
  },
});
