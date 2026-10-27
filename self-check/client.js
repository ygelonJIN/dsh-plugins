window.__ModuleLoader__.load({
  id: '@local/self-check',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'self-check';
    const STYLE_ID = '@local/self-check/styles';
    /** Written by every @local client half's one-shot self-check. */
    const STORAGE_KEY = 'dsh.self-check';

    const DICTS = {
      en: {
        'tab.label': 'Self-check',
        'panel.title': 'Upgrade self-check',
        'panel.body': 'Every @local plugin probes the shipped anchors it builds on once after start. '
          + 'This page shows the last result; a miss names the anchor that moved and what stopped working.',
        'panel.refresh': 'Refresh',
        'panel.empty': 'No result yet — reload the page once so the plugins run their probe.',
        'panel.ok': 'OK',
        'panel.bad': 'Changed',
        'panel.misses': 'Affected:',
        'panel.checkedAt': 'checked',
        'panel.host': 'Host-only plugins (workspace-ledger, approval-alert) write their result to '
          + '~/.dsh/storages/self-check/*.json.',
      },
      zh: {
        'tab.label': '自检',
        'panel.title': '升级自检',
        'panel.body': '每个 @local 插件启动后探一次它依赖的官方锚点。这里显示最近一次结果；'
          + '异常会列出改动的锚点和受影响的功能。',
        'panel.refresh': '刷新',
        'panel.empty': '还没有结果——刷新一次页面让插件跑完探针。',
        'panel.ok': '正常',
        'panel.bad': '有变化',
        'panel.misses': '受影响：',
        'panel.checkedAt': '检查于',
        'panel.host': '纯宿主插件（workspace-ledger、approval-alert）的结果写在 ~/.dsh/storages/self-check/*.json。',
      },
    };

    const CSS = `
.sm-check{font-size:13px;line-height:20px;padding:4px 0}
.sm-check h3{margin:0 0 4px;font-size:15px;font-weight:600}
.sm-check>p{margin:0 0 12px;color:var(--dsw-alias-label-secondary)}
.sm-check-bar{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.sm-check-refresh{border:1px solid var(--dsw-alias-border-l4);border-radius:8px;background:0 0;color:var(--dsw-alias-label-primary);padding:2px 10px;line-height:22px;cursor:pointer;font-size:12px}
.sm-check-refresh:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sm-check-list{display:flex;flex-direction:column;gap:8px}
.sm-check-row{border:1px solid var(--dsw-alias-border-l4);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:4px}
.sm-check-head{display:flex;align-items:center;gap:8px}
.sm-check-name{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.sm-check-badge{font-size:11px;font-weight:600;border-radius:999px;padding:0 8px;line-height:18px}
.sm-check-badge[data-ok=true]{color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent)}
.sm-check-badge[data-ok=false]{color:var(--dsw-alias-state-error-primary,#e5484d);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#e5484d) 14%,transparent)}
.sm-check-time{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-size:11px}
.sm-check-miss{color:var(--dsw-alias-label-secondary);font-size:12px}
.sm-check-foot{margin-top:14px;color:var(--dsw-alias-label-tertiary);font-size:12px}
`;

    function pickT(t) {
      return typeof t === 'function' ? t : (key) => key;
    }

    function readResults() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const all = raw === null ? {} : JSON.parse(raw);
        if (all === null || typeof all !== 'object') return [];
        return Object.entries(all)
          .map(([name, value]) => ({
            name,
            ok: value?.ok === true,
            misses: Array.isArray(value?.misses) ? value.misses : [],
            at: typeof value?.at === 'number' ? value.at : 0,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      } catch {
        return [];
      }
    }

    function timeText(at, t) {
      if (at === 0) return '';
      return t('panel.checkedAt') + ' ' + new Date(at).toLocaleTimeString();
    }

    /** Settings → Plugins → Self-check. Reads the aggregated one-shot results. */
    function SelfCheckTab(props) {
      const t = pickT(props.t);
      const [rows, setRows] = React.useState(() => readResults());
      return h('div', { className: 'sm-check' },
        h('h3', null, t('panel.title')),
        h('p', null, t('panel.body')),
        h('div', { className: 'sm-check-bar' },
          h('button', {
            type: 'button',
            className: 'sm-check-refresh',
            onClick: () => setRows(readResults()),
          }, t('panel.refresh')),
        ),
        rows.length === 0 ? h('p', null, t('panel.empty')) : null,
        h('div', { className: 'sm-check-list' },
          rows.map((row) => h('div', { key: row.name, className: 'sm-check-row' },
            h('div', { className: 'sm-check-head' },
              h('span', { className: 'sm-check-name' }, row.name),
              h('span', {
                className: 'sm-check-badge',
                'data-ok': row.ok ? 'true' : 'false',
              }, t(row.ok ? 'panel.ok' : 'panel.bad')),
              h('span', { className: 'sm-check-time' }, timeText(row.at, t)),
            ),
            row.ok ? null : h(React.Fragment, null,
              h('div', { className: 'sm-check-miss' }, t('panel.misses')),
              row.misses.map((miss, index) => h('div', {
                key: index,
                className: 'sm-check-miss',
              }, '· ' + String(miss?.anchor ?? '') + ' → ' + String(miss?.impact ?? ''))),
            ),
          )),
        ),
        h('div', { className: 'sm-check-foot' }, t('panel.host')),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const translate = ctx.locale.bind(NS);

        ctx.effect(() => ctx.locale.register(NS, DICTS));

        ctx.effect(() => {
          if (typeof document === 'undefined') return;
          // Always mount a fresh tag so a hot reload never keeps stale CSS.
          for (const stale of document.querySelectorAll('style[data-plugin-css="' + STYLE_ID + '"]')) stale.remove();
          const tag = document.createElement('style');
          tag.setAttribute('data-plugin-css', STYLE_ID);
          tag.textContent = CSS;
          document.head.appendChild(tag);
          return () => tag.remove();
        });

        ctx.effect(() => ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
          name: 'settings.plugins.tab',
          id: 'self-check',
          order: 20,
          label: () => translate('tab.label'),
          locale: NS,
        }, SelfCheckTab)));
      },
    };
  },
});
