window.__ModuleLoader__.load({
  id: '@local/sidebar-marks',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    // Baseline externals the Web Module Loader exposes to plugin bundles:
    // the host's own controls keep hover, focus, and pressed behavior
    // identical to the shipped menus and notices.
    const { MenuItemButton, Toast } = require('@deepseek-ai/dsh-client-ui-primitives');

    const NS = 'sidebar-marks';
    const CHANNEL = 'sidebar-marks';
    const STYLE_ID = '@local/sidebar-marks/styles';
    const STATE_ROUTE = 'api/sidebar-marks.state';
    const MARK_ROUTE = 'api/sidebar-marks.mark';
    const TOAST_MS = 4000;
    const MENU_WINDOW_MS = 1500;

    /** Palette keys the Host accepts; must match the Host half. Marking is a
     * plain toggle with a black underline, so the stored key is only the
     * placeholder the Host schema requires. */
    const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
    const MARK_COLOR = COLORS[0];

    const DICTS = {
      en: {
        'menu.mark': 'Mark',
        'menu.unmark': 'Unmark',
        'spinner.running': 'Running',
        'spinner.runningCount': 'Running: {count}',
        'toast.failed': 'Could not save the mark ({message}).',
        'error.unknown': 'unknown error',
      },
      zh: {
        'menu.mark': '标记',
        'menu.unmark': '取消标记',
        'spinner.running': '正在运行',
        'spinner.runningCount': '正在运行 {count} 个',
        'toast.failed': '标注没有保存成功（{message}）。',
        'error.unknown': '未知错误',
      },
    };

    /*
     * Visual hierarchy in the sidebar: the open conversation is the most
     * prominent (light fill only — no side bar), a mark is a black underline
     * under the name and never a fill, a running row adds its accent spinner,
     * a heavier title, and a much lighter tint of the same fill (half the
     * open row's strength), and a running Workspace also shows the running
     * count. Only an expanded Workspace group is wrapped in a thin white
     * frame (the row plus its session rows); a collapsed Workspace stays
     * bare. The rules cascade in exactly that order: the running block
     * first, marks over it, the open row last.
     */
    const CSS = `
:root{
  --sm-red:#e5484d;--sm-orange:#f76b15;--sm-yellow:#c58a00;
  --sm-green:#2f9e6c;--sm-blue:#4176e6;--sm-purple:#8e4ec6;
}
/* Every --dsw-alias-* token is declared on body, never on :root, and a
   custom property resolves its var() where it is declared. Declaring these
   on :root therefore made them invalid everywhere below html. They belong
   on body, and the rules below still carry an inline fallback. */
body{
  --sm-frame:color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent);
  --sm-frame-fill:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent);
  --sm-frame-shadow:0 0 14px rgba(0,0,0,.10);
  --sm-frame-lift:inset 0 1px 0 rgba(255,255,255,.22);
  /* 透明白，不跟主色走：浅色/深色主题下都是同一层提亮，主色改成什么都不会串色。 */
  --sm-open-fill:rgba(255,255,255,.65);
  --sm-run-fill:rgba(255,255,255,.25);
}
[data-row-key][data-row-key][data-sm-running]:not([aria-selected=true]){background:var(--sm-run-fill,rgba(255,255,255,.3))}
/* 跑完还没看（官方 completionUnread → 状态点 data-state=done）的会话行同色同浓度。
   注意 StateDot 只有 ongoing 是 svg，done/idle/warning 都是 span，所以这里不能写 svg[...]。 */
[data-row-key^=session][data-row-key][data-row-key]:not([aria-selected=true]):has([data-state=done]){background:var(--sm-run-fill,rgba(255,255,255,.3))}
/* 运行行只加粗，不改颜色：主色调成白色时标题会变白、在浅底上看不清。 */
[data-row-key][data-sm-running] [data-sm-title]{font-weight:600}
[data-row-key][data-sm-mark] [data-sm-title]{text-decoration:underline;text-decoration-color:#000;text-decoration-thickness:2px;text-underline-offset:3px}
/* 选中行只改底色：标题颜色、字重、转圈、运行数字都保持平时那样（用户明确要求“字体颜色不要变”）。 */
[data-row-key][data-row-key][aria-selected=true]{background:var(--sm-open-fill,rgba(255,255,255,.3))}
[data-row-key^=session] svg[data-state=ongoing]{color:var(--dsw-alias-label-primary);transform:scale(1.25)}
.sm-run{display:inline-flex;align-items:center;gap:2px;height:20px;flex:none;color:var(--dsw-alias-label-primary)}
/* 工作区行的文件夹图标（含当前工作区那份 folderActive）也用文字色，别跟主色跑。 */
[data-row-key^="workspace:"] [class*="_folder"],
[data-row-key^="workspace:"] [class*="_chevron"]{color:var(--dsw-alias-label-primary)}
/* 选中/运行状态下标题都用主题文字色，不因状态变浅。 */
/* 选中 / 运行中 / 跑完没看：标题统一加深加粗，整行只有底色不同。 */
[data-row-key][aria-selected=true] [data-sm-title],
[data-row-key][data-sm-running] [data-sm-title],
[data-row-key^=session]:has([data-state=done]) [data-sm-title]{
  color:var(--dsw-alias-label-primary);font-weight:700
}
[data-row-key][aria-selected=true],
[data-row-key][aria-selected=true] [class*="_time"],
[data-row-key^=session]:has([data-state=done]) [class*="_time"]{
  color:var(--dsw-alias-label-primary)
}
.sm-run svg{display:block}
.sm-run-count{font-size:11px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums;color:currentColor}
.sm-spin-motion{transform-origin:center;animation:sm-spin-rotate 1.2s linear infinite}
.sm-spin-track,.sm-spin-arc{fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round}
.sm-spin-track{opacity:.25}
@keyframes sm-spin-rotate{to{transform:rotate(360deg)}}
[data-sm-frame=group]{box-sizing:border-box;border:1px solid var(--sm-frame,color-mix(in srgb,currentColor 22%,transparent));border-radius:12px;padding:3px;margin-bottom:18px;background:var(--sm-frame-fill,color-mix(in srgb,currentColor 5%,transparent));box-shadow:var(--sm-frame-lift,inset 0 1px 0 rgba(255,255,255,.22)),var(--sm-frame-shadow,0 0 14px rgba(0,0,0,.10))}
[data-sm-list][data-sm-list]{padding-top:8px}
[data-row-key][data-sm-frame]{box-sizing:border-box;margin-top:0;margin-bottom:0;border-left:1px solid var(--sm-frame,color-mix(in srgb,currentColor 22%,transparent));border-right:1px solid var(--sm-frame,color-mix(in srgb,currentColor 22%,transparent));border-radius:0}
[data-row-key][data-sm-frame=first]{border-top:1px solid var(--sm-frame,color-mix(in srgb,currentColor 22%,transparent));border-radius:12px 12px 0 0}
[data-row-key][data-sm-frame=last]{border-bottom:1px solid var(--sm-frame,color-mix(in srgb,currentColor 22%,transparent));border-radius:0 0 12px 12px;margin-bottom:6px}
[data-row-key][data-sm-frame=only]{border-top:1px solid var(--sm-frame,color-mix(in srgb,currentColor 22%,transparent));border-bottom:1px solid var(--sm-frame,color-mix(in srgb,currentColor 22%,transparent));border-radius:12px;margin-bottom:6px}
/* 官方 ScrollRestore 会 cloneNode 正在离场的行（clone 去掉 data-row-key、加 inert）来跑退出动画，
   徽标也跟着被复制；克隆体里的转圈不该再转一次。 */
[inert] .sm-run{display:none}
@media (prefers-reduced-motion:reduce){.sm-spin-motion{animation:none}}
`;

    const SPINNER_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" data-state="ongoing" aria-hidden="true" focusable="false">'
      + '<g class="sm-spin-motion">'
      + '<circle class="sm-spin-track" cx="12" cy="12" r="9"></circle>'
      + '<circle class="sm-spin-arc" cx="12" cy="12" r="9" stroke-dasharray="16 60"></circle>'
      + '</g></svg>';

    // Menu-row icons drawn in the plugin so they survive official icon
    // renames; stroke follows currentColor like the shipped outline icons.
    const TAG_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
      + '<path d="M3 3h8l10 10-8 8L3 11V3z"/><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none"/></svg>';

    function svgIcon(markup) {
      const host = document.createElement('div');
      host.innerHTML = markup;
      return host.firstElementChild;
    }

    function TagIcon({ size = 16 }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        focusable: 'false',
        'aria-hidden': 'true',
      },
        h('path', { d: 'M3 3h8l10 10-8 8L3 11V3z' }),
        h('circle', { cx: 7.5, cy: 7.5, r: 1.5, fill: 'currentColor', stroke: 'none' }),
      );
    }

    let snapshot = { toast: null };
    const listeners = new Set();
    const runtime = { sessions: null, workspaces: null };
    let channel = null;
    let fallbackTranslate = (key) => key;
    let marks = { sessions: {}, workspaces: {} };
    let decorateHandle = 0;

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

    function pickT(t) {
      return typeof t === 'function' ? t : fallbackTranslate;
    }

    function format(template, params) {
      return String(template).replace(/\{(\w+)\}/g, (all, key) => (
        Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : all
      ));
    }

    // ---------------------------------------------------------------- state

    async function request(path, options) {
      const response = await fetch(path, {
        ...options,
        headers: { accept: 'application/json', 'content-type': 'application/json', ...(options?.headers ?? {}) },
      });
      const payload = await response.json().catch(() => null);
      if (payload === null || payload.ok !== true) {
        const message = payload !== null && typeof payload.message === 'string' ? payload.message : `HTTP ${response.status}`;
        throw new Error(message);
      }
      return payload;
    }

    function adoptState(payload) {
      marks = {
        sessions: payload.sessions ?? {},
        workspaces: payload.workspaces ?? {},
      };
      scheduleDecorate();
    }

    function broadcast() {
      try {
        channel?.postMessage({ type: 'state', marks });
      } catch {
        // A closed channel only affects cross-tab sync.
      }
    }

    async function loadState() {
      try {
        adoptState(await request(STATE_ROUTE, { method: 'GET' }));
      } catch (error) {
        console.warn('[sidebar-marks] state load failed:', error);
      }
    }

    async function saveMark(kind, id, color) {
      try {
        adoptState(await request(MARK_ROUTE, {
          method: 'POST',
          body: JSON.stringify({ kind, id, color }),
        }));
        broadcast();
      } catch (error) {
        console.warn('[sidebar-marks] mark save failed:', error);
        publish({ ...snapshot, toast: { message: messageOf(error) } });
      }
    }

    /** Marking is a plain toggle: one click draws the black underline, the next clears it. */
    function toggleMark(kind, id) {
      const current = kind === 'session' ? marks.sessions[id]?.color : marks.workspaces[id]?.color;
      void saveMark(kind, id, typeof current === 'string' ? null : MARK_COLOR);
    }

    // ----------------------------------------------------------- decoration

    function workspaceItems() {
      try {
        const snapshotNow = runtime.workspaces?.list?.getSnapshot?.();
        return Array.isArray(snapshotNow?.items) ? snapshotNow.items : null;
      } catch {
        return null;
      }
    }

    function runningSessionIds() {
      const running = new Set();
      try {
        const snapshotNow = runtime.sessions?.list?.getSnapshot?.();
        for (const [key, row] of Object.entries(snapshotNow?.byId ?? {})) {
          if (row?.running === true) running.add(row.sessionId ?? key);
        }
      } catch {
        // Without the list there is simply no running decoration.
      }
      return running;
    }

    function runningWorkspaceCounts(running) {
      const counts = new Map();
      for (const item of workspaceItems() ?? []) {
        let count = 0;
        for (const sessionId of item.sessionIds ?? []) if (running.has(sessionId)) count += 1;
        if (count > 0) counts.set(item.workspaceId, count);
      }
      return counts;
    }

    /** The title span: second cell in a Session row, inside the text cell of a Workspace row. */
    function titleSpan(row, kind) {
      if (kind === 'session') return row.children[1] ?? null;
      const container = row.children[row.children.length - 2];
      return container?.firstElementChild ?? null;
    }

    /** Spinner plus running count, between the folder icon cells and the Workspace name. */
    function ensureRunBadge(row, count) {
      let badge = row.querySelector(':scope > .sm-run');
      for (const extra of row.querySelectorAll('.sm-run')) if (extra !== badge) extra.remove();
      if (badge === null) {
        badge = document.createElement('span');
        badge.className = 'sm-run';
        badge.innerHTML = SPINNER_SVG;
        row.insertBefore(badge, row.children[2] ?? null);
      }
      // One spinner per row: any shipped ongoing dot for the same state is
      // hidden so the row reads folder icon → spinner → count → name.
      for (const svg of row.querySelectorAll('svg[data-state="ongoing"]')) {
        if (svg.closest('.sm-run') !== null) continue;
        const owner = svg.closest('[data-row-key]');
        if (owner !== null && owner !== row) continue;
        if (svg.style.display !== 'none') svg.style.display = 'none';
      }
      badge.setAttribute('role', 'img');
      badge.setAttribute('aria-label', format(fallbackTranslate('spinner.runningCount'), { count }));
      let digit = badge.querySelector(':scope > .sm-run-count');
      if (digit === null) {
        digit = document.createElement('span');
        digit.className = 'sm-run-count';
        digit.setAttribute('aria-hidden', 'true');
        badge.appendChild(digit);
      }
      const text = String(count);
      if (digit.textContent !== text) digit.textContent = text;
    }

    function dropRunBadge(row) {
      row.querySelector(':scope > .sm-run')?.remove();
    }

    function decorate() {
      decorateHandle = 0;
      if (typeof document === 'undefined') return;
      // Badges from an older client half linger across hot reloads and would
      // spin beside the current one.
      for (const stale of document.querySelectorAll('.sm-spin')) stale.remove();
      const running = runningSessionIds();
      const runningWorkspaces = runningWorkspaceCounts(running);
      for (const row of document.querySelectorAll('[data-row-key^="session:"]')) {
        const id = row.getAttribute('data-row-key').slice('session:'.length);
        const color = marks.sessions[id]?.color;
        if (typeof color === 'string') row.setAttribute('data-sm-mark', color);
        else row.removeAttribute('data-sm-mark');
        if (running.has(id)) row.setAttribute('data-sm-running', '1');
        else row.removeAttribute('data-sm-running');
        const title = titleSpan(row, 'session');
        if (title !== null) title.setAttribute('data-sm-title', '');
      }
      for (const row of document.querySelectorAll('[data-row-key^="workspace:"]')) {
        const id = row.getAttribute('data-row-key').slice('workspace:'.length);
        const count = runningWorkspaces.get(id) ?? 0;
        if (id !== '') {
          const color = marks.workspaces[id]?.color;
          if (typeof color === 'string') row.setAttribute('data-sm-mark', color);
          else row.removeAttribute('data-sm-mark');
        }
        if (count > 0) {
          row.setAttribute('data-sm-running', '1');
          ensureRunBadge(row, count);
        } else {
          row.removeAttribute('data-sm-running');
          dropRunBadge(row);
        }
        const title = titleSpan(row, 'workspace');
        if (title !== null) title.setAttribute('data-sm-title', '');
      }
      decorateFrames();
    }

    /** The official group section wraps one Workspace row with its rows and is
     * the only element that sets --dsh-workspace-indent inline. */
    function groupContainer(row) {
      let node = row.parentElement;
      while (node !== null) {
        if (typeof node.style?.getPropertyValue === 'function'
          && node.style.getPropertyValue('--dsh-workspace-indent') !== '') return node;
        node = node.parentElement;
      }
      return null;
    }

    /**
     * Whether a Workspace group is open. The row's own flag is authoritative;
     * the fallback reads the rows the shipped browser renders only for an open
     * group, so a DOM change to the attribute cannot hide a real box.
     */
    function groupExpanded(row, container) {
      const flag = row.getAttribute('aria-expanded');
      if (flag === 'true') return true;
      if (flag === 'false') return false;
      const scope = container ?? row.parentElement;
      if (scope === null || scope === row) return false;
      return scope.querySelector('[data-row-key^="session:"], [data-row-key^="overflow:"]') !== null;
    }

    /** The sidebar list clips card shadows at its edges (overflow-y: auto), so
     * the first card's shadow needs headroom inside the list to render. */
    function markListContainer(container) {
      let node = container.parentElement;
      while (node !== null && node !== document.body) {
        if (node.hasAttribute?.('data-sm-list')) return;
        const overflow = typeof getComputedStyle === 'function' ? getComputedStyle(node).overflowY : '';
        if (overflow === 'auto' || overflow === 'scroll') {
          node.setAttribute('data-sm-list', '');
          return;
        }
        node = node.parentElement;
      }
    }

    /**
     * One thin frame per expanded Workspace group. The frame goes on the
     * official group container — one box, straight sides, rounded corners —
     * and rows rendered without such a container fall back to a connected
     * per-row frame. Collapsed Workspaces stay unframed either way.
     */
    function decorateFrames() {
      const rows = [...document.querySelectorAll('[data-row-key]')];
      for (const row of rows) row.removeAttribute('data-sm-frame');
      for (const stale of document.querySelectorAll('[data-sm-frame="group"]')) stale.removeAttribute('data-sm-frame');
      // Containers are claimed even when left bare, so the per-row fallback
      // below never rebuilds a box around a single collapsed row.
      const claimed = new Set();
      for (const row of rows) {
        const key = row.getAttribute('data-row-key') ?? '';
        if (!key.startsWith('workspace:')) continue;
        const container = groupContainer(row);
        if (container === null || claimed.has(container)) continue;
        claimed.add(container);
        markListContainer(container);
        if (groupExpanded(row, container)) container.setAttribute('data-sm-frame', 'group');
      }
      let group = [];
      const flush = () => {
        const members = group;
        group = [];
        if (members.length === 0) return;
        const [first, ...rest] = members;
        // Without a group container the spread of rows is the only signal: a
        // Workspace that owns no session rows is collapsed and stays bare.
        if ((first.getAttribute('data-row-key') ?? '').startsWith('workspace:')) {
          const flag = first.getAttribute('aria-expanded');
          if (flag === 'false') return;
          if (flag !== 'true' && rest.length === 0) return;
        }
        // Nested DOM: the Workspace row already contains its session rows, so
        // framing the outer row alone wraps the whole group.
        if (rest.length > 0 && rest.every((row) => first.contains(row))) {
          first.setAttribute('data-sm-frame', 'only');
          return;
        }
        const last = members.length - 1;
        members.forEach((row, index) => {
          const part = last === 0 ? 'only' : index === 0 ? 'first' : index === last ? 'last' : 'mid';
          row.setAttribute('data-sm-frame', part);
        });
      };
      for (const row of rows) {
        if (claimed.has(groupContainer(row))) continue;
        const key = row.getAttribute('data-row-key') ?? '';
        if (key.startsWith('workspace:')) {
          flush();
          group = [row];
        } else if ((key.startsWith('session:') || key.startsWith('overflow:')) && group.length > 0) {
          group.push(row);
        } else {
          flush();
        }
      }
      flush();
    }

    function scheduleDecorate() {
      if (decorateHandle !== 0 || typeof document === 'undefined') return;
      if (typeof requestAnimationFrame === 'function') decorateHandle = requestAnimationFrame(decorate);
      else decorateHandle = setTimeout(decorate, 16);
    }

    // ------------------------------------------- workspace "…" menu injection

    /*
     * The Workspace row menu (rename / delete) is built inside the shipped
     * ProjectRowItem: no slot exists for it. The rows this plugin adds are DOM
     * injections into the opened menu — a compatibility patch that follows the
     * same approach as the user-message action row. The menu is only touched
     * when the ellipsis of a Workspace row opened it (tracked below), the row
     * gained its menu-open state, and no plugin row is present yet.
     */
    let pendingMenu = null;

    function trackWorkspaceMenuOpen(event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const row = target.closest('[data-row-key^="workspace:"]');
      if (row === null) return;
      const key = row.getAttribute('data-row-key').slice('workspace:'.length);
      if (key === '') return;
      if (target.closest('button') === null) return;
      pendingMenu = { key, row, className: row.className, at: Date.now() };
    }

    function buildMenuRow(template, options) {
      const node = template.cloneNode(true);
      node.setAttribute('data-sm-menu', options.id);
      const button = node.querySelector('button[role="menuitem"]');
      if (button === null) return null;
      button.removeAttribute('aria-keyshortcuts');
      button.removeAttribute('disabled');
      button.classList.remove('danger');
      button.setAttribute('aria-label', options.label);
      // The clone keeps the shipped row styling; only the icon and the label
      // text are ours.
      button.textContent = '';
      button.append(svgIcon(options.icon), document.createTextNode(options.label));
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        options.onSelect();
        closeOpenMenu();
      });
      return node;
    }

    function closeOpenMenu() {
      pendingMenu = null;
      // The shipped Menu closes on an outside pointerdown; firing one at the
      // body dismisses it exactly like a click away from the menu.
      try {
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      } catch {
        // The menu stays open at worst; the action itself already happened.
      }
    }

    function injectWorkspaceMenu(menu) {
      if (menu.querySelector('[data-sm-menu]') !== null) return;
      const pending = pendingMenu;
      if (pending === null || Date.now() - pending.at > MENU_WINDOW_MS) return;
      if (pending.row.className === pending.className) return; // not our ellipsis
      // The shipped Menu wraps its rows in a viewport inside role="menu": the
      // rows are the parents of the menuitem buttons, never menu.children.
      const buttons = [...menu.querySelectorAll('button[role="menuitem"]')]
        .filter((button) => button.getAttribute('aria-haspopup') !== 'menu');
      if (buttons.length === 0) return;
      const rows = buttons.map((button) => button.parentElement ?? button);
      const key = pending.key;
      const isMarked = typeof marks.workspaces[key]?.color === 'string';
      const template = rows[0];
      const before = rows[rows.length - 1];
      const container = before.parentElement ?? menu;
      // Same layout as the Session "…" menu: the mark sits just before the
      // final destructive row (order 470 there).
      const entries = [
        {
          id: 'mark',
          icon: TAG_ICON,
          labelKey: isMarked ? 'menu.unmark' : 'menu.mark',
          at: before,
          onSelect: () => toggleMark('workspace', key),
        },
      ];
      for (const entry of entries) {
        const node = buildMenuRow(template, { ...entry, label: fallbackTranslate(entry.labelKey) });
        if (node !== null) container.insertBefore(node, entry.at);
      }
    }

    // --------------------------------------------------------------- rows

    function MarkMenuItem(props) {
      const { sessionId, useMenuOpenState } = props;
      const t = pickT(props.t);
      const menuState = typeof useMenuOpenState === 'function' ? useMenuOpenState() : [false, () => {}];
      const setMenuOpen = menuState[1];
      const marked = typeof marks.sessions[sessionId]?.color === 'string';
      return h(MenuItemButton, {
        icon: h(TagIcon, {}),
        onSelect: () => {
          setMenuOpen(false);
          toggleMark('session', sessionId);
        },
      }, t(marked ? 'menu.unmark' : 'menu.mark'));
    }

    // Marking needs no dialog: the menu row toggles the black underline and
    // only a failed save surfaces, as the shipped Toast.
    function MarkOverlay(props) {
      const state = useSnapshot();
      const t = pickT(props.t);
      if (state.toast === null) return null;
      return h(Toast, {
        text: format(t('toast.failed'), {
          message: state.toast.message !== '' ? state.toast.message : t('error.unknown'),
        }),
        tone: 'warning',
        holdMs: TOAST_MS,
        onDone: () => {
          if (snapshot.toast === state.toast) publish({ ...snapshot, toast: null });
        },
      });
    }

    /**
     * One-shot self-check: probes the shipped anchors this plugin builds on so
     * a Harness upgrade reports what moved instead of failing silently. Runs
     * once after the first paint (one bounded retry while the shell mounts),
     * then never again — no timer, no observer, no recurring cost.
     */
    function selfCheck(label, checks) {
      let runs = 0;
      const run = () => {
        runs += 1;
        const misses = [];
        for (const check of checks) {
          let ok = false;
          try { ok = check.probe() === true; } catch { ok = false; }
          if (!ok) misses.push(check);
        }
        if (runs === 1 && misses.length === checks.length) {
          setTimeout(run, 1500); // shell not mounted yet is not a broken anchor
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
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
      else setTimeout(run, 16);
    }

    return {
      inject: ['slots', 'locale', 'sessions'],
      apply(ctx) {
        fallbackTranslate = ctx.locale.bind(NS);
        runtime.sessions = ctx.sessions;
        try {
          runtime.workspaces = typeof ctx.get === 'function' ? ctx.get('workspaces') : ctx.workspaces;
        } catch {
          runtime.workspaces = ctx.workspaces ?? null;
        }

        ctx.effect(() => ctx.locale.register(NS, DICTS));

        ctx.effect(() => {
          if (typeof document === 'undefined') return;
          // Always mount a fresh tag: an "already exists" early return leaves a
          // stale stylesheet alive after hot reload, and every CSS tweak after
          // that silently does nothing.
          for (const stale of document.querySelectorAll('style[data-plugin-css="' + STYLE_ID + '"]')) stale.remove();
          const tag = document.createElement('style');
          tag.setAttribute('data-plugin-css', STYLE_ID);
          tag.textContent = CSS;
          document.head.appendChild(tag);
          return () => tag.remove();
        });

        ctx.effect(() => {
          if (typeof document === 'undefined') return;
          // Only row churn matters: chat updates must not trigger a pass.
          const touchesRows = (node) => node instanceof Element && (
            node.matches('[data-row-key]')
            || node.querySelector('[data-row-key]') !== null
            || node.closest('[data-row-key]') !== null
          );
          const observer = new MutationObserver((records) => {
            let menu = null;
            let rowsChanged = false;
            for (const record of records) {
              // Opening or closing a Workspace may leave its rows untouched (an
              // empty group): the expand flag then drives the frame alone.
              if (record.type === 'attributes') {
                rowsChanged = true;
                continue;
              }
              for (const node of record.addedNodes) {
                if (!(node instanceof Element)) continue;
                if (node.matches?.('[role="menu"]')) menu = node;
                else menu = node.querySelector?.('[role="menu"]') ?? menu;
                rowsChanged = touchesRows(node) || rowsChanged;
              }
              for (const node of record.removedNodes) rowsChanged = touchesRows(node) || rowsChanged;
            }
            if (menu !== null) {
              try {
                injectWorkspaceMenu(menu);
              } catch (error) {
                console.warn('[sidebar-marks] workspace menu injection failed:', error);
              }
            }
            if (rowsChanged) scheduleDecorate();
          });
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['aria-expanded'],
          });
          document.addEventListener('pointerdown', trackWorkspaceMenuOpen, true);
          scheduleDecorate();
          return () => {
            observer.disconnect();
            document.removeEventListener('pointerdown', trackWorkspaceMenuOpen, true);
          };
        });

        ctx.effect(() => {
          const subscriptions = [];
          const subscribe = (list) => {
            if (typeof list?.subscribe !== 'function') return;
            subscriptions.push(list.subscribe(() => {
              scheduleDecorate();
            }));
          };
          subscribe(runtime.sessions?.list);
          subscribe(runtime.workspaces?.list);
          return () => {
            for (const dispose of subscriptions) {
              try { dispose(); } catch { /* a torn-down store is already gone */ }
            }
          };
        });

        ctx.effect(() => {
          if (typeof BroadcastChannel !== 'function') return;
          channel = new BroadcastChannel(CHANNEL);
          const onMessage = (event) => {
            const data = event?.data;
            if (data?.type !== 'state') return;
            marks = data.marks ?? marks;
            scheduleDecorate();
          };
          channel.addEventListener('message', onMessage);
          return () => {
            channel?.removeEventListener('message', onMessage);
            channel?.close();
            channel = null;
          };
        });

        ctx.effect(() => {
          void loadState();
          return () => {
            publish({ toast: null });
          };
        });

        // The mark row rides the Session "…" menu beside fork and delete; the
        // shipped MenuItemButton supplies its exact look and menu behavior.
        ctx.effect(() => ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
          name: 'sidebar.workspaces.session.menu.item',
          id: 'sidebar-marks.mark',
          order: 470,
          locale: NS,
        }, MarkMenuItem)));

        // The overlay only carries the failure Toast, through the shipped
        // component so its portal and timing match the rest of the shell.
        ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'sidebar-marks.overlay',
          order: 50,
          locale: NS,
        }, MarkOverlay)));

        selfCheck(NS, [
          {
            anchor: '侧栏行 data-row-key（会话/工作区）',
            impact: '标注、卡片框、运行中转圈全部失效',
            probe: () => document.querySelector('[data-row-key^="session:"], [data-row-key^="workspace:"]') !== null,
          },
          {
            anchor: '工作区分组容器 --dsh-workspace-indent',
            impact: '工作区卡片框不显示（回退到按行拼框）',
            probe: () => {
              const row = document.querySelector('[data-row-key^="workspace:"]');
              if (row === null) return true; // no Workspace rows: nothing to frame
              let node = row.parentElement;
              while (node !== null) {
                if (typeof node.style?.getPropertyValue === 'function'
                  && node.style.getPropertyValue('--dsh-workspace-indent') !== '') return true;
                node = node.parentElement;
              }
              return false;
            },
          },
        ]);
      },
    };
  },
});
