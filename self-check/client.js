window.__ModuleLoader__.load({
  id: '@local/self-check',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'self-check';
    const STYLE_ID = '@local/self-check/styles';
    /** Written by every @local client half's one-shot self-check. */
    const STORAGE_KEY = 'dsh.self-check';
    /** 上次启动看到的 DSH 版本与插件名单，用来判断「升级了没」「谁没加载」。 */
    const WATCH_KEY = 'dsh.self-check.watch';

    /**
     * 仓库里应该被加载的客户端插件。加/删插件时同步改这里；
     * 少写只会漏报（不弹），多写会误报（弹出来但那个包已经删了）。
     */
    const EXPECTED = [
      '@local/usage-cost',
      '@local/harness-period',
      '@local/skin',
      '@local/session-delete',
      '@local/session-undo',
      '@local/sidebar-marks',
      '@local/self-check',
      '@local/prompt-inject',
      '@local/workspace-ledger',
      '@local/approval-alert',
    ];

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
        'panel.unchecked': 'Not on screen this time (not a failure):',
        'panel.checkedAt': 'checked',
        'panel.host': 'Host-only plugins (workspace-ledger, approval-alert) write their result to '
          + '~/.dsh/storages/self-check/*.json.',
        'watch.title': 'Runtime',
        'watch.version': 'DSH version',
        'watch.seen': 'Last start',
        'watch.plugins': 'Client plugins loaded',
        'watch.missing': 'Not loaded',
        'watch.never': 'not recorded yet',
        'alert.upgraded': 'DSH upgraded: {from} → {to}',
        'alert.missing': 'These plugins did not load: {list}',
        'alert.hint': 'Run scripts/doctor.sh in the plugin repo to find out why.',
        'alert.dismiss': 'Got it',
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
        'panel.unchecked': '这次界面上没有出现，未检查（不算失效）：',
        'panel.checkedAt': '检查于',
        'panel.host': '纯宿主插件（workspace-ledger、approval-alert）的结果写在 ~/.dsh/storages/self-check/*.json。',
        'watch.title': '运行状态',
        'watch.version': 'DSH 版本',
        'watch.seen': '上次启动',
        'watch.plugins': '已加载的客户端插件',
        'watch.missing': '没加载',
        'watch.never': '还没记录',
        'alert.upgraded': 'DSH 已升级：{from} → {to}',
        'alert.missing': '这些插件没加载：{list}',
        'alert.hint': '到插件仓库跑 scripts/doctor.sh 看原因。',
        'alert.dismiss': '知道了',
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
.sm-check-skip{margin-top:2px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}
.sm-check-foot{margin-top:14px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.sm-check-watch{margin:0 0 16px;border:1px solid var(--dsw-alias-border-l4);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:6px}
.sm-check-watch-row{display:flex;align-items:baseline;gap:8px;font-size:12px}
.sm-check-watch-key{min-width:92px;color:var(--dsw-alias-label-tertiary)}
.sm-check-watch-val{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dsw-alias-label-primary);word-break:break-all}
.sm-check-watch-val[data-bad=true]{color:var(--dsw-alias-state-error-primary,#e5484d)}
/* 启动提示：不依赖官方 Toast，自己画一条，位置在右下，躲开输入框 */
.sm-alert{position:fixed;right:16px;bottom:16px;z-index:2147483000;max-width:min(420px,calc(100vw - 32px));
  display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:12px;
  border:1px solid var(--dsw-alias-border-l4);
  background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary);
  box-shadow:0 8px 24px rgba(0,0,0,.14);font-size:13px;line-height:19px}
.sm-alert[data-tone=warn]{border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,transparent)}
.sm-alert-body{display:flex;flex-direction:column;gap:3px;min-width:0}
.sm-alert-title{font-weight:600}
.sm-alert-desc{color:var(--dsw-alias-label-secondary)}
.sm-alert-hint{color:var(--dsw-alias-label-tertiary);font-size:12px}
.sm-alert-close{flex:none;border:0;background:0 0;color:var(--dsw-alias-label-tertiary);cursor:pointer;
  font-size:12px;line-height:18px;padding:1px 6px;border-radius:6px}
.sm-alert-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
`;

    function pickT(t) {
      return typeof t === 'function' ? t : (key) => key;
    }

    function readJson(key) {
      try {
        const raw = localStorage.getItem(key);
        const value = raw === null ? null : JSON.parse(raw);
        return value !== null && typeof value === 'object' ? value : null;
      } catch {
        return null;
      }
    }

    function writeJson(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* 隐私模式/配额满：提示会少一次，不影响插件本身 */
      }
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
            unchecked: Array.isArray(value?.unchecked) ? value.unchecked : [],
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

    /**
     * 读这次页面拿到的启动清单。`__DSH_BOOT__` 由宿主注入：
     * release.version 是 dsh 版本，entries 是本次组合进前端的包（每项 id = 包名）。
     * 任何一个包被跳过，它就不在这里出现 —— 这是唯一能在界面里看见「插件没加载」的地方。
     */
    function readRuntime() {
      const boot = typeof window === 'undefined' ? undefined : window.__DSH_BOOT__;
      const version = typeof boot?.release?.version === 'string' ? boot.release.version : null;
      const entries = Array.isArray(boot?.entries) ? boot.entries : [];
      const ids = entries
        .map((entry) => (typeof entry === 'string' ? entry : entry?.id))
        .filter((id) => typeof id === 'string');
      const local = ids.filter((id) => id.startsWith('@local/'));
      return { version, ids, local };
    }

    /** 把当前状态记成新基线。只在「正常」或「用户确认过」时调用。 */
    function record(version, plugins, missing) {
      writeJson(WATCH_KEY, { version, plugins, missing, at: Date.now() });
    }

    /**
     * 比对上次记录，决定要不要提示。
     * 关键：**发现问题时不推进基线** —— 只有用户点了「知道了」才推进，
     * 所以没看到提示（直接关窗口）下次启动还会弹，直到确认。
     */
    function inspect() {
      const runtime = readRuntime();
      if (runtime.version === null) return { runtime, notice: null };
      const previous = readJson(WATCH_KEY);
      const missing = EXPECTED.filter((name) => !runtime.local.includes(name));
      const previousMissing = Array.isArray(previous?.missing) ? previous.missing : [];
      const firstRun = typeof previous?.version !== 'string';

      // 第一次装上：只记录基线，不打扰
      if (firstRun) {
        record(runtime.version, runtime.local, missing);
        return { runtime, notice: null };
      }

      const upgraded = previous.version !== runtime.version;
      const missingChanged = missing.length > 0
        && JSON.stringify(missing) !== JSON.stringify(previousMissing);

      // 一切正常：基线跟着走
      if (!upgraded && !missingChanged) {
        record(runtime.version, runtime.local, missing);
        return { runtime, notice: null };
      }

      return {
        runtime,
        notice: {
          from: upgraded ? previous.version : null,
          to: runtime.version,
          missing,
        },
      };
    }

    /** 右下角一条提示，可关闭；不依赖官方 Toast，坏不了别的东西。 */
    function showAlert(notice, t, onDismiss) {
      if (typeof document === 'undefined' || document.body === null) return () => {};
      const el = document.createElement('div');
      el.className = 'sm-alert';
      el.setAttribute('data-tone', 'warn');
      el.setAttribute('role', 'status');

      const body = document.createElement('div');
      body.className = 'sm-alert-body';

      const text = (key, fallback, vars) => {
        const out = typeof t === 'function' ? t(key, vars) : key;
        if (typeof out !== 'string' || out === key) {
          return (fallback ?? key).replace(/\{(\w+)\}/g, (_, name) => String(vars?.[name] ?? ''));
        }
        return out;
      };

      if (notice.from !== null) {
        const title = document.createElement('div');
        title.className = 'sm-alert-title';
        title.textContent = text('alert.upgraded', 'DSH 已升级：{from} → {to}',
          { from: notice.from, to: notice.to });
        body.appendChild(title);
      }
      if (notice.missing.length > 0) {
        const desc = document.createElement('div');
        desc.className = 'sm-alert-desc';
        desc.textContent = text('alert.missing', '这些插件没加载：{list}',
          { list: notice.missing.join('、') });
        body.appendChild(desc);
      }
      const hint = document.createElement('div');
      hint.className = 'sm-alert-hint';
      hint.textContent = text('alert.hint', '到插件仓库跑 scripts/doctor.sh 看原因。');
      body.appendChild(hint);

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'sm-alert-close';
      close.textContent = text('alert.dismiss', '知道了');
      close.addEventListener('click', () => {
        onDismiss?.();
        el.remove();
      });

      el.append(body, close);
      document.body.appendChild(el);
      return () => el.remove();
    }

    /** Settings → Plugins → Self-check. */
    function SelfCheckTab(props) {
      const t = pickT(props.t);
      const [rows, setRows] = React.useState(() => readResults());
      const [watch, setWatch] = React.useState(() => readJson(WATCH_KEY));
      const runtime = readRuntime();
      const missing = EXPECTED.filter((name) => !runtime.local.includes(name));

      return h('div', { className: 'sm-check' },
        h('h3', null, t('panel.title')),
        h('p', null, t('panel.body')),

        h('div', { className: 'sm-check-watch' },
          h('div', { className: 'sm-check-watch-row' },
            h('span', { className: 'sm-check-watch-key' }, t('watch.version')),
            h('span', { className: 'sm-check-watch-val' },
              runtime.version ?? t('watch.never')),
          ),
          h('div', { className: 'sm-check-watch-row' },
            h('span', { className: 'sm-check-watch-key' }, t('watch.seen')),
            h('span', { className: 'sm-check-watch-val' },
              typeof watch?.version === 'string' ? watch.version : t('watch.never')),
          ),
          h('div', { className: 'sm-check-watch-row' },
            h('span', { className: 'sm-check-watch-key' }, t('watch.plugins')),
            h('span', { className: 'sm-check-watch-val', 'data-bad': missing.length > 0 ? 'true' : 'false' },
              `${runtime.local.length} / ${EXPECTED.length}`),
          ),
          missing.length > 0
            ? h('div', { className: 'sm-check-watch-row' },
              h('span', { className: 'sm-check-watch-key' }, t('watch.missing')),
              h('span', { className: 'sm-check-watch-val', 'data-bad': 'true' },
                missing.join('、')),
            )
            : null,
        ),

        h('div', { className: 'sm-check-bar' },
          h('button', {
            type: 'button',
            className: 'sm-check-refresh',
            onClick: () => {
              setRows(readResults());
              setWatch(readJson(WATCH_KEY));
            },
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
            row.unchecked.length === 0 ? null : h('div', { className: 'sm-check-skip' },
              h('div', null, t('panel.unchecked')),
              row.unchecked.map((item, index) => h('div', {
                key: index,
              }, '· ' + String(item?.anchor ?? ''))),
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

        // 启动对账：DSH 升级了、或者有插件没加载，就在右下角提示一次。
        // 放到 rAF 之后，等外壳挂完再插 DOM，避免和首屏抢。
        ctx.effect(() => {
          let remove = () => {};
          let cancelled = false;
          const frame = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame(() => {
              if (cancelled) return;
              try {
                const { notice } = inspect();
                if (notice !== null) {
                  remove = showAlert(notice, translate, () => {
                    record(notice.to, readRuntime().local, notice.missing);
                  });
                }
              } catch {
                /* 提示失败不影响插件本身 */
              }
            })
            : 0;
          return () => {
            cancelled = true;
            if (frame !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
            remove();
          };
        });
      },
    };
  },
});
