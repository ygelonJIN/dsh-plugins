window.__ModuleLoader__.load({
  id: '@local/session-delete',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    // Baseline externals the Web Module Loader exposes to plugin bundles:
    // using the host's own controls keeps hover, focus, pressed, disabled, and
    // modal behavior identical to the shipped menus and dialogs.
    const {
      Button,
      IconTrashOutlineRegular,
      MenuItemButton,
      Modal,
      Toast,
    } = require('@deepseek-ai/dsh-client-ui-primitives');

    const NS = 'session-delete';
    const ROUTE = 'api/session-delete.delete';
    const CHANNEL = 'session-delete';
    const STYLE_ID = '@local/session-delete/styles';
    const TOAST_MS = 4000;
    const WORKSPACE_VIEW_KEY = 'dsh.workspace.view.v5';

    const DICTS = {
      en: {
        'menu.delete': 'Delete conversation',
        'dialog.title': 'Permanently delete this conversation?',
        'dialog.body': 'Delete “{title}” from disk, including its subagent conversations, projection cache, and Workspace, archive, and pin records. Running work is stopped first. A conversation still in use is archived now and removed when DSH restarts. This cannot be undone.',
        'dialog.cancel': 'Cancel',
        'dialog.confirm': 'Delete permanently',
        'dialog.deleting': 'Deleting…',
        'dialog.close': 'Close',
        'dialog.untitled': 'Untitled',
        'dialog.activity': 'Running work',
        'error.inUse': 'This conversation is in use. Switch to another conversation, then try again.',
        'error.activeLead': 'This conversation still has running work. Stop it first, then delete:',
        'error.notFound': 'This conversation no longer exists.',
        'error.badRequest': 'The delete request was invalid.',
        'error.failed': 'Delete failed: {message}',
        'error.requestFailed': 'The Host could not complete the request ({message}).',
        'error.unauthorized': 'The request was not authorized. Reload the page and try again.',
        'error.unknown': 'unknown error',
        'family.turn': 'a running turn',
        'family.subagent': 'running subagents',
        'family.job': 'background jobs',
        'family.schedule': 'scheduled reminders',
        'family.work': 'running work',
        'detail.separator': ': ',
        'list.separator': ', ',
        'toast.deleted': 'Deleted “{title}”',
        'toast.queued': 'Queued for deletion: “{title}”. Quit and reopen DSH to finish removing it.',
      },
      zh: {
        'menu.delete': '删除对话',
        'dialog.title': '永久删除此对话？',
        'dialog.body': '将从磁盘删除“{title}”的聊天记录，包括它的子代理对话、投影缓存，以及工作区、归档和置顶记录。运行中的工作会先停止；仍在使用的对话会先归档，下次启动 DSH 时删除。此操作无法撤销。',
        'dialog.cancel': '取消',
        'dialog.confirm': '永久删除',
        'dialog.deleting': '正在删除…',
        'dialog.close': '关闭',
        'dialog.untitled': '未命名',
        'dialog.activity': '正在运行的工作',
        'error.inUse': '这个对话正在使用中。请切换到其他对话后再试。',
        'error.activeLead': '这个对话还有正在运行的任务，请先停止后再删除：',
        'error.notFound': '这个对话已经不存在了。',
        'error.badRequest': '删除请求无效。',
        'error.failed': '删除失败：{message}',
        'error.requestFailed': '宿主没有完成这次请求（{message}）。',
        'error.unauthorized': '请求没有通过鉴权。请刷新页面后重试。',
        'error.unknown': '未知错误',
        'family.turn': '正在进行的回合',
        'family.subagent': '运行中的子代理',
        'family.job': '后台任务',
        'family.schedule': '定时提醒',
        'family.work': '运行中的工作',
        'detail.separator': '：',
        'list.separator': '、',
        'toast.deleted': '已删除“{title}”',
        'toast.queued': '已加入删除队列：“{title}”。退出并重新打开 DSH 后完成删除。',
      },
    };

    // Only the three classes the shipped dialogs also add themselves: the
    // destructive outline button, the error line, the status line, and the
    // activity list. Everything else is the primitive's own styling.
    const CSS = `
.sd-delete-action:not(:disabled){color:var(--dsw-alias-state-error-primary)}
.sd-status{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.sd-error{color:var(--dsw-alias-state-error-primary);margin-top:8px;font-size:12px;line-height:18px}
.sd-activity{color:var(--dsw-alias-label-primary);margin:0 0 8px;padding-left:18px;font-size:13px;line-height:20px}
.sd-activity li{overflow-wrap:anywhere}
`;

    let snapshot = { request: null, busy: false, error: null, toast: null };
    const listeners = new Set();
    const runtime = { sessions: null, uiWorkspace: null };
    let channel = null;
    let fallbackTranslate = (key) => key;

    function publish(next) {
      snapshot = next;
      for (const listener of listeners) listener();
    }

    function useSnapshot() {
      const [value, setValue] = React.useState(snapshot);
      React.useEffect(() => {
        const listener = () => setValue(snapshot);
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      }, []);
      return value;
    }

    function messageOf(error) {
      return error instanceof Error ? error.message : String(error);
    }

    async function refreshSessions() {
      try {
        await runtime.sessions?.refresh?.();
      } catch (error) {
        console.warn('[session-delete] session list refresh failed:', error);
      }
      pruneUnknownSessions();
    }

    function navigateAway() {
      try {
        runtime.uiWorkspace?.startSession?.();
      } catch (error) {
        console.warn('[session-delete] could not open a new session:', error);
      }
    }

    function notifyOtherTabs(sessionId) {
      try {
        channel?.postMessage({ type: 'deleted', sessionId });
      } catch {
        // A closed channel only affects cross-tab refresh.
      }
    }

    function pruneWorkspaceOrder(ids) {
      if (ids.length === 0) return;
      try {
        const raw = localStorage.getItem(WORKSPACE_VIEW_KEY);
        if (raw === null) return;
        const data = JSON.parse(raw);
        const removed = new Set(ids);
        const orders = data.sessionOrderByAccount;
        if (orders !== null && typeof orders === 'object') {
          for (const key of Object.keys(orders)) {
            if (Array.isArray(orders[key])) orders[key] = orders[key].filter((id) => !removed.has(id));
          }
        }
        localStorage.setItem(WORKSPACE_VIEW_KEY, JSON.stringify(data));
      } catch {
        // A malformed cache is not worth failing the delete.
      }
    }

    function mainSessionId() {
      try {
        const snapshot = runtime.sessions?.list?.getSnapshot?.();
        for (const row of Object.values(snapshot?.byId ?? {})) {
          if ((row.retainedBy?.mainView ?? 0) > 0) return row.sessionId;
        }
      } catch {
        // Fall through.
      }
      return runtime.uiWorkspace?.mainReference?.sessionId;
    }

    function knownSessionIds() {
      try {
        const snapshot = runtime.sessions?.list?.getSnapshot?.();
        const rows = snapshot?.byId;
        if (rows === undefined || rows === null || Object.keys(rows).length === 0) return null;
        return new Set(Object.keys(rows));
      } catch {
        return null;
      }
    }

    /** Drop ids the Host no longer lists; a deleted Session otherwise lingers as an empty row. */
    function pruneUnknownSessions() {
      const known = knownSessionIds();
      if (known === null) return;
      try {
        const raw = localStorage.getItem(WORKSPACE_VIEW_KEY);
        if (raw === null) return;
        const data = JSON.parse(raw);
        const orders = data.sessionOrderByAccount;
        if (orders === null || typeof orders !== 'object') return;
        const stale = new Set();
        for (const key of Object.keys(orders)) {
          if (!Array.isArray(orders[key])) continue;
          for (const id of orders[key]) if (!known.has(id)) stale.add(id);
        }
        pruneWorkspaceOrder([...stale]);
      } catch {
        // Ignore cache damage.
      }
    }

    function requestDeletion(request) {
      publish({ request, busy: false, error: null, toast: snapshot.toast });
    }

    function cancelDeletion() {
      if (snapshot.busy) return;
      publish({ ...snapshot, request: null, error: null });
    }

    function normalizeError(payload, status) {
      if (payload !== null && typeof payload === 'object' && typeof payload.code === 'string') {
        return {
          code: payload.code,
          message: typeof payload.message === 'string' ? payload.message : '',
          activity: Array.isArray(payload.activity) ? payload.activity : [],
        };
      }
      if (status === 401 || status === 403) return { code: 'unauthorized', message: '', activity: [] };
      return { code: 'failed', message: `HTTP ${status}`, activity: [] };
    }

    async function confirmDeletion() {
      const current = snapshot;
      const request = current.request;
      if (request === null || current.busy) return;
      publish({ ...current, busy: true, error: null });
      let status = 0;
      let payload = null;
      try {
        const response = await fetch(ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ sessionId: request.sessionId }),
        });
        status = response.status;
        payload = await response.json().catch(() => null);
      } catch (error) {
        publish({ ...snapshot, busy: false, error: { code: 'failed', message: messageOf(error), activity: [] } });
        return;
      }
      if (status >= 200 && status < 300 && payload !== null && payload.ok === true) {
        const queued = payload.queued === true;
        publish({
          request: null,
          busy: false,
          error: null,
          toast: { kind: queued ? 'queued' : 'deleted', title: request.title },
        });
        await refreshSessions();
        if (request.isMain) navigateAway();
        notifyOtherTabs(request.sessionId);
        return;
      }
      publish({ ...snapshot, busy: false, error: normalizeError(payload, status) });
    }

    function familyLabel(t, kind) {
      const key = `family.${kind}`;
      const label = t(key);
      return label === key ? kind : label;
    }

    function activityLine(entry, t) {
      const family = familyLabel(t, entry.kind);
      const items = (entry.items ?? [])
        .map((item) => item.label ?? item.id)
        .filter((value) => typeof value === 'string' && value !== '');
      return items.length > 0
        ? `${family}${t('detail.separator')}${items.join(t('list.separator'))}`
        : family;
    }

    function errorText(error, t) {
      switch (error.code) {
        case 'in-use':
          return t('error.inUse');
        case 'not-found':
          return t('error.notFound');
        case 'bad-request':
          return t('error.badRequest');
        case 'unauthorized':
          return t('error.unauthorized');
        case 'active':
          return t('error.activeLead');
        case 'failed':
          return error.message === ''
            ? t('error.failed', { message: t('error.unknown') })
            : t('error.requestFailed', { message: error.message });
        default:
          return t('error.failed', { message: error.message !== '' ? error.message : t('error.unknown') });
      }
    }

    function pickT(t, translate) {
      return typeof t === 'function' ? t : translate;
    }

    function DeleteMenuItem(props) {
      const { sessionId, displayTitle, useMenuOpenState, useSessions } = props;
      const t = pickT(props.t, fallbackTranslate);
      const menuState = useMenuOpenState();
      const setMenuOpen = menuState[1];
      const isMain = typeof useSessions === 'function'
        ? useSessions((list) => (list?.byId?.[sessionId]?.retainedBy?.mainView ?? 0) > 0)
        : false;
      return h(MenuItemButton, {
        danger: true,
        icon: h(IconTrashOutlineRegular, {}),
        onSelect: () => {
          setMenuOpen(false);
          requestDeletion({ sessionId, title: displayTitle ?? '', isMain });
        },
      }, t('menu.delete'));
    }

    function DeleteOverlay(props) {
      const { request, busy, error, toast } = useSnapshot();
      const t = pickT(props.t, fallbackTranslate);
      const title = request === null
        ? ''
        : (request.title !== '' ? request.title : t('dialog.untitled'));

      const body = [];
      if (busy) {
        body.push(h('div', { key: 'status', className: 'sd-status', role: 'status' }, t('dialog.deleting')));
      }
      if (error !== null) {
        const activity = error.code === 'active' && Array.isArray(error.activity) ? error.activity : [];
        if (activity.length === 0) {
          body.push(h('div', { key: 'error', className: 'sd-error', role: 'alert' }, errorText(error, t)));
        } else {
          body.push(h('p', { key: 'lead', className: 'sd-error', role: 'alert' }, t('error.activeLead')));
          body.push(h('ul', {
            key: 'activity',
            className: 'sd-activity',
            'aria-label': t('dialog.activity'),
          }, activity.map((entry, index) => h(
            'li',
            { key: `${String(entry.kind)}-${String(index)}` },
            activityLine(entry, t),
          ))));
        }
      }

      const modalProps = {
        open: request !== null,
        onClose: cancelDeletion,
        closeLabel: t('dialog.close'),
        title: t('dialog.title'),
        footer: h(React.Fragment, null,
          h(Button, {
            variant: 'outline',
            disabled: busy,
            onClick: cancelDeletion,
          }, t('dialog.cancel')),
          h(Button, {
            variant: 'outline',
            className: 'sd-delete-action',
            disabled: busy,
            onClick: () => { void confirmDeletion(); },
          }, t('dialog.confirm')),
        ),
      };
      if (request !== null) modalProps.description = t('dialog.body', { title });
      if (body.length > 0) modalProps.children = body;

      const modal = h(Modal, modalProps);

      const notice = toast === null ? null : h(Toast, {
        text: t(toast.kind === 'queued' ? 'toast.queued' : 'toast.deleted', {
          title: toast.title !== '' ? toast.title : t('dialog.untitled'),
        }),
        tone: 'success',
        holdMs: toast.kind === 'queued' ? TOAST_MS * 2 : TOAST_MS,
        onDone: () => {
          if (snapshot.toast === toast) publish({ ...snapshot, toast: null });
        },
      });

      return h(React.Fragment, null, modal, notice);
    }

    /**
     * One-shot self-check: probes the shipped anchors this plugin builds on so
     * a Harness upgrade reports what moved instead of failing silently. Runs
     * once after the first paint (one bounded retry while the shell mounts),
     * and again only on the panel's manual `dsh-self-check:run`; no recurring timer.
     */
    function selfCheck(ctx, label, checks) {
      let runs = 0;
      let timer = 0;
      const run = () => {
        runs += 1;
        const misses = [];
        const unchecked = [];
        for (const check of checks) {
          let ok = false;
          try { ok = check.probe() === true; } catch { ok = false; }
          if (ok) continue;
          // optional = 随内容出现的块；启动时没渲染不算锚点变了。
          if (check.optional === true) {
            unchecked.push({ anchor: check.anchor, impact: check.impact });
            continue;
          }
          misses.push(check);
        }
        if (runs === 1 && misses.length === checks.length) {
          timer = setTimeout(run, 1500); // shell not mounted yet is not a broken anchor
          return;
        }
        // Keep the last result where a human can read it without DevTools:
        // localStorage['dsh.self-check'] holds one entry per plugin.
        try {
          const key = 'dsh.self-check';
          const all = JSON.parse(localStorage.getItem(key) ?? '{}');
          all[label] = {
            ok: misses.length === 0,
            misses: misses.map((m) => ({ anchor: m.anchor, impact: m.impact })),
            unchecked,
            at: Date.now(),
          };
          localStorage.setItem(key, JSON.stringify(all));
        } catch {
          // Storage unavailable: the console warning still carries the result.
        }
        if (misses.length === 0) return;
        console.warn('[' + label + '] 自检：' + misses.length + ' 处官方锚点变了，受影响的功能：');
        for (const miss of misses) console.warn('  · ' + miss.anchor + ' → ' + miss.impact);
        console.warn('[' + label + '] 修复参照 经验文档/插件开发.md「升级后失效排查」。');
      };
      const schedule = () => {
        if (timer !== 0) { clearTimeout(timer); timer = 0; }
        runs = 0;
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
        else timer = setTimeout(run, 16);
      };
      schedule();
      ctx.effect(() => {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
        const rerun = () => schedule();
        window.addEventListener('dsh-self-check:run', rerun);
        return () => {
          window.removeEventListener('dsh-self-check:run', rerun);
          if (timer !== 0) { clearTimeout(timer); timer = 0; }
        };
      });
    }

    return {
      inject: ['slots', 'locale', 'sessions', 'uiWorkspace'],
      apply(ctx) {
        const translate = ctx.locale.bind(NS);
        fallbackTranslate = translate;
        runtime.sessions = ctx.sessions;
        runtime.uiWorkspace = ctx.uiWorkspace;

        ctx.effect(() => ctx.locale.register(NS, DICTS));

        ctx.effect(() => {
          if (typeof document === 'undefined') return;
          if (document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]') !== null) return;
          const tag = document.createElement('style');
          tag.setAttribute('data-plugin-css', STYLE_ID);
          tag.textContent = CSS;
          document.head.appendChild(tag);
          return () => tag.remove();
        });

        ctx.effect(() => {
          if (typeof BroadcastChannel !== 'function') return;
          channel = new BroadcastChannel(CHANNEL);
          const onMessage = (event) => {
            if (event?.data?.type === 'deleted') void refreshSessions();
          };
          channel.addEventListener('message', onMessage);
          return () => {
            channel?.removeEventListener('message', onMessage);
            channel?.close();
            channel = null;
          };
        });

        ctx.effect(() => () => {
          publish({ request: null, busy: false, error: null, toast: null });
        });

        // Closing and reopening the window does not restart the Host, so a
        // queued deletion also gets a chance on every page load.
        ctx.effect(() => {
          const timers = [
            setTimeout(() => { pruneUnknownSessions(); }, 2500),
            setTimeout(() => { pruneUnknownSessions(); }, 8000),
          ];
          return () => {
            for (const timer of timers) clearTimeout(timer);
          };
        }, 'session-delete: prune stale rows');

        ctx.effect(() => {
          const timer = setTimeout(() => {
            void fetch('api/session-delete.purge', {
              method: 'POST',
              headers: { accept: 'application/json' },
            }).then(async (response) => {
              const payload = await response.json().catch(() => null);
              if (payload?.ok !== true || !Array.isArray(payload.deleted) || payload.deleted.length === 0) return;
              const main = mainSessionId();
              pruneWorkspaceOrder(payload.deleted);
              await refreshSessions();
              if (typeof main === 'string' && payload.deleted.includes(main)) {
                try { runtime.uiWorkspace?.startSession?.(); } catch { /* ignore */ }
              }
              for (const sessionId of payload.deleted) notifyOtherTabs(sessionId);
            }).catch(() => {});
          }, 1500);
          return () => clearTimeout(timer);
        }, 'session-delete: purge on page load');

        // Native destructive row: the shared MenuItemButton supplies the exact
        // shipped height, padding, icon, hover, focus, and danger colors.
        ctx.effect(() => ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
          name: 'sidebar.workspaces.session.menu.item',
          id: 'session-delete.delete',
          order: 500,
          locale: NS,
        }, DeleteMenuItem)));

        // The dialog is the shipped Modal, so mask, panel, header, close button,
        // body typography, footer layout, focus trap, and Escape all match.
        ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'session-delete.overlay',
          order: 50,
          locale: NS,
        }, DeleteOverlay)));

        selfCheck(ctx, NS, [{
          anchor: '侧栏会话行 data-row-key^=session:',
          impact: '会话「…」菜单里的删除入口不出现',
          probe: () => document.querySelector('[data-row-key^="session:"]') !== null,
        }]);
      },
    };
  },
});
