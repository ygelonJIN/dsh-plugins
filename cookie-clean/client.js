window.__ModuleLoader__.load({
  id: '@local/cookie-clean',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'cookie-clean';
    const STYLE_ID = '@local/cookie-clean/styles';
    // 相对路径，跟 self-check 的写法一致（页面在 dsh-app://app/，base href="./"）。
    const SUMMARY_ROUTE = 'api/cookie-clean.summary';
    const RUN_ROUTE = 'api/cookie-clean.run';

    const DICTS = {
      en: {
        'tab.label': 'Cookies',
        'panel.title': 'Loopback authentication cookies',
        'panel.body': 'Every launch mints one dsh-auth-* cookie for a random port and nothing removes the old ones; '
          + 'each lives 30 days. Chromium sends every cookie for 127.0.0.1, so the request header grows until it crosses '
          + 'the 16 KiB limit (~70 cookies), the Host answers 431, and the shell reports "Web authentication failed". '
          + 'Cleaning deletes only rows whose port no longer exists, so this session keeps its own cookie.',
        'panel.current': 'This session',
        'panel.total': 'In the jar',
        'panel.stale': 'Stale',
        'panel.header': 'Header estimate',
        'panel.runs': 'Launches left',
        'panel.runsValue': '{n}',
        'panel.level.ok': 'OK',
        'panel.level.warn': 'High',
        'panel.level.danger': 'Near limit',
        'panel.clean': 'Clean stale cookies',
        'panel.cleaning': 'Cleaning…',
        'panel.refresh': 'Refresh',
        'panel.done': 'Deleted {n}, {m} left, header ~{bytes} bytes.',
        'panel.none': 'Nothing stale to clean.',
        'panel.error': 'Could not read the jar: {e}',
        'panel.path': 'Database',
        'panel.limit': 'Limit {limit} bytes',
        'panel.busy': 'The cookie jar is in use — retry in a moment.',
        'panel.log': 'Journal',
        'common.loading': 'Loading…',
      },
      zh: {
        'tab.label': 'Cookie 清理',
        'panel.title': '本地认证 Cookie',
        'panel.body': '每次启动 App 都会按随机端口生成一条 dsh-auth-* cookie，旧的不会自动删除，各自活 30 天。'
          + 'Chromium 把 127.0.0.1 的 cookie 全部塞进同一个请求头，攒到约 70 条就会超过 16 KiB 上限，'
          + 'Host 返回 431，外壳报「Web authentication failed」。清理只删端口已经不存在的条目，'
          + '当前会话不受影响。',
        'panel.current': '当前会话',
        'panel.total': '库内总条数',
        'panel.stale': '其中陈旧',
        'panel.header': '请求头估算',
        'panel.runs': '按当前速度还能启动',
        'panel.runsValue': '{n} 次',
        'panel.level.ok': '正常',
        'panel.level.warn': '偏高',
        'panel.level.danger': '接近上限',
        'panel.clean': '清理陈旧 Cookie',
        'panel.cleaning': '清理中…',
        'panel.refresh': '刷新',
        'panel.done': '已清理 {n} 条，剩余 {m} 条，请求头约 {bytes} 字节。',
        'panel.none': '没有可清理的陈旧条目。',
        'panel.error': '读取失败：{e}',
        'panel.path': '数据库',
        'panel.limit': '上限 {limit} 字节',
        'panel.busy': 'Cookie 库正被占用，稍后重试。',
        'panel.log': '记录',
        'common.loading': '加载中…',
      },
    };

    const CSS = `
.cc { display: flex; flex-direction: column; gap: 14px; }
.cc-lead { margin: 0; font-size: 13px; line-height: 1.65; opacity: .78; max-width: 60em; }
.cc-error { padding: 10px 12px; border-radius: 8px; font-size: 13px;
  background: color-mix(in oklab, var(--dsw-alias-state-error-primary, #d9534f) 12%, transparent);
  color: var(--dsw-alias-state-error-primary, #c0392b); }
.cc-muted { font-size: 13px; opacity: .6; }
.cc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: 10px; }
.cc-card { border: 1px solid color-mix(in oklab, currentColor 14%, transparent); border-radius: 10px; padding: 10px 12px; }
.cc-card-key { font-size: 11px; letter-spacing: .02em; opacity: .6; }
.cc-card-val { margin-top: 4px; font-size: 16px; font-variant-numeric: tabular-nums; }
.cc-card-val[data-level="warn"] { color: var(--dsw-alias-state-warning-primary, #b7791f); }
.cc-card-val[data-level="danger"] { color: var(--dsw-alias-state-error-primary, #c0392b); }
.cc-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; font-weight: 400; }
.cc-bar { height: 6px; border-radius: 999px; overflow: hidden;
  background: color-mix(in oklab, currentColor 10%, transparent); }
.cc-bar-fill { height: 100%; border-radius: 999px; background: #4c8dff; transition: width .25s ease; }
.cc-bar-fill[data-level="warn"] { background: #d99a2b; }
.cc-bar-fill[data-level="danger"] { background: #d9534f; }
.cc-scale { display: flex; justify-content: space-between; font-size: 11px; opacity: .5;
  font-variant-numeric: tabular-nums; }
.cc-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.cc-btn { appearance: none; border: 1px solid color-mix(in oklab, currentColor 18%, transparent);
  background: color-mix(in oklab, currentColor 6%, transparent); color: inherit;
  font: inherit; font-size: 13px; padding: 7px 14px; border-radius: 8px; cursor: pointer; }
.cc-btn:hover:not(:disabled) { background: color-mix(in oklab, currentColor 12%, transparent); }
.cc-btn:disabled { opacity: .45; cursor: default; }
.cc-btn-primary { background: #4c8dff; border-color: #4c8dff; color: #fff; }
.cc-btn-primary:hover:not(:disabled) { background: #3f7ce8; border-color: #3f7ce8; }
.cc-note { font-size: 12px; line-height: 1.6; opacity: .7; }
.cc-note[data-tone="ok"] { color: #2e9e5b; opacity: 1; }
.cc-foot { font-size: 11px; opacity: .5; line-height: 1.6; word-break: break-all; }
`;

    function pickT(t) {
      return typeof t === 'function' ? t : (key) => key;
    }

    /** Replace `{name}` placeholders; missing values keep the placeholder visible. */
    function format(text, vars) {
      if (typeof text !== 'string') return '';
      if (vars === undefined) return text;
      return text.replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole));
    }

    /** One JSON call against the host half; a non-ok body throws with its message. */
    async function call(path, init) {
      const response = await fetch(path, init);
      const raw = await response.text();
      let body = null;
      try {
        body = raw === '' ? null : JSON.parse(raw);
      } catch {
        throw new Error(`HTTP ${response.status}`);
      }
      if (response.ok && body !== null && body.ok === true) return body;
      throw new Error(body?.message ?? `HTTP ${response.status}`);
    }

    function bytes(value) {
      return Number.isFinite(value) ? String(value) : '—';
    }

    /** Settings → Plugins → Cookies. */
    function CookieTab(props) {
      const t = pickT(props.t);
      const [summary, setSummary] = React.useState(null);
      const [error, setError] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [note, setNote] = React.useState(null);

      const load = React.useCallback(() => {
        if (typeof fetch !== 'function') return;
        void call(SUMMARY_ROUTE, { cache: 'no-store' })
          .then((value) => {
            setSummary(value);
            setError(null);
          })
          .catch((failure) => setError(failure instanceof Error ? failure.message : String(failure)));
      }, []);

      React.useEffect(() => { load(); }, [load]);

      const clean = () => {
        if (busy) return;
        setBusy(true);
        setNote(null);
        void call(RUN_ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
          .then((value) => {
            setSummary((previous) => ({
              ...(previous ?? {}),
              ...value,
            }));
            setError(null);
            setNote(value.deleted > 0
              ? { tone: 'ok', text: format(t('panel.done'), { n: value.deleted, m: value.total, bytes: value.headerBytes }) }
              : { tone: 'plain', text: t('panel.none') });
          })
          .catch((failure) => {
            const message = failure instanceof Error ? failure.message : String(failure);
            setError(message);
            if (/busy|in use|占用/i.test(message)) setNote({ tone: 'plain', text: t('panel.busy') });
          })
          .finally(() => setBusy(false));
      };

      const level = summary?.level ?? 'ok';
      const used = summary?.headerBytes ?? 0;
      const limit = summary?.limit ?? 16384;
      const percent = Math.min(100, Math.round((used / limit) * 100));
      const stale = summary?.stale ?? 0;

      const card = (key, value, options = {}) => h('div', { className: 'cc-card' },
        h('div', { className: 'cc-card-key' }, t(key)),
        h('div', {
          className: options.mono === true ? 'cc-card-val cc-mono' : 'cc-card-val',
          'data-level': options.level,
        }, value),
      );

      return h('div', { className: 'cc' },
        h('h3', null, t('panel.title')),
        h('p', { className: 'cc-lead' }, t('panel.body')),

        error !== null ? h('div', { className: 'cc-error' }, format(t('panel.error'), { e: error })) : null,

        summary === null
          ? h('div', { className: 'cc-muted' }, error === null ? t('common.loading') : '')
          : h('div', { className: 'cc' },
            h('div', { className: 'cc-grid' },
              card('panel.current', summary.authority ?? '—', { mono: true }),
              card('panel.total', String(summary.total ?? 0)),
              card('panel.stale', String(stale)),
              card('panel.header', `${bytes(used)} / ${bytes(limit)}`, { level }),
              card('panel.runs', format(t('panel.runsValue'), { n: bytes(summary.runsLeft ?? 0) })),
            ),
            h('div', { className: 'cc-bar' },
              h('div', { className: 'cc-bar-fill', 'data-level': level, style: { width: `${percent}%` } }),
            ),
            h('div', { className: 'cc-scale' },
              h('span', null, t('panel.level.ok')),
              h('span', null, format(t('panel.limit'), { limit: bytes(limit) })),
            ),
            h('div', { className: 'cc-actions' },
              h('button', {
                type: 'button',
                className: 'cc-btn cc-btn-primary',
                disabled: busy || stale === 0,
                onClick: clean,
              }, busy ? t('panel.cleaning') : t('panel.clean')),
              h('button', {
                type: 'button',
                className: 'cc-btn',
                disabled: busy,
                onClick: () => { setNote(null); load(); },
              }, t('panel.refresh')),
            ),
            note !== null ? h('div', { className: 'cc-note', 'data-tone': note.tone }, note.text) : null,
            h('div', { className: 'cc-foot' },
              `${t('panel.path')}: ${summary.dbPath ?? '—'}`,
              summary.logPath ? h('div', null, `${t('panel.log')}: ${summary.logPath}`) : null,
            ),
          ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const bound = ctx.locale.bind(NS);

        ctx.effect(() => ctx.locale.register(NS, DICTS));

        ctx.effect(() => {
          if (typeof document === 'undefined') return;
          // Mount a fresh tag so a hot reload never keeps stale CSS.
          for (const stale of document.querySelectorAll('style[data-plugin-css="' + STYLE_ID + '"]')) stale.remove();
          const tag = document.createElement('style');
          tag.setAttribute('data-plugin-css', STYLE_ID);
          tag.textContent = CSS;
          document.head.appendChild(tag);
          return () => tag.remove();
        });

        ctx.effect(() => ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
          name: 'settings.plugins.tab',
          id: 'cookie-clean',
          order: 36,
          label: () => bound('tab.label'),
          locale: NS,
        }, CookieTab)));
      },
    };
  },
});
