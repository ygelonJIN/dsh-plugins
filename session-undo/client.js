window.__ModuleLoader__.load({
  id: '@local/session-undo',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { Button, Modal, Toast } = require('@deepseek-ai/dsh-client-ui-primitives');

    const NS = 'session-undo';
    const PREFLIGHT = 'api/session-undo.preflight';
    const DELETE_SESSION = 'api/session-delete.delete';
    const CONVERSATION_STORE = 'dsh.conversation';
    const TOAST_MS = 6000;

    const DICTS = {
      en: {
        'entry.undo': 'Undo this turn',
        'entry.title': 'Undo this turn and everything after it',
        'entry.noSession': 'No active conversation found.',
        'dialog.title': 'Undo this turn and everything after it?',
        'dialog.loading': 'Reading the conversation…',
        'dialog.cancel': 'Cancel',
        'dialog.confirm': 'Undo',
        'dialog.close': 'Close',
        'dialog.forking': 'Opening the new conversation…',
        'dialog.failed': 'Undo failed: {message}',
        'dialog.blocked': 'Cannot undo',
        'dialog.removed': 'Removes {turns} turn(s), {messages} message(s), {tools} tool call(s).',
        'dialog.kept': 'The prefix keeps its token, cost, and context totals.',
        'dialog.filesUntouched': 'Files are not changed.',
        'dialog.tailTokens': 'Tokens spent in the removed turns: {input} in / {output} out. They leave the statistics; the money was still spent.',
        'dialog.firstTurn': 'This is the first turn: a new empty conversation opens and the old one is archived.',
        'dialog.oldSession': 'The old conversation is archived now. Its files are removed right away when no agent holds them, otherwise on the next start.',
        'dialog.oldActivity': 'These stop with it: {list}',
        'activity.turn': 'a running turn',
        'activity.subagent': 'running subagents',
        'activity.job': 'background jobs',
        'activity.schedule': 'scheduled reminders',
        'activity.work': 'work',
        'toast.done': 'Undone. The new conversation is open.',
        'toast.queued': 'Undone. The old conversation is archived and will be deleted on the next start, because an agent still holds it.',
        'toast.forkFailed': 'The new conversation could not be created.',
        'toast.deleteFailed': 'The old conversation could not be removed: {message}',
        'toast.failed': 'Request failed: {message}',
      },
      zh: {
        'entry.undo': '撤回这一轮及之后',
        'entry.title': '撤回这一轮及之后',
        'entry.noSession': '没有找到当前对话。',
        'dialog.title': '撤回这一轮及之后？',
        'dialog.loading': '正在读取对话…',
        'dialog.cancel': '取消',
        'dialog.confirm': '撤回',
        'dialog.close': '关闭',
        'dialog.forking': '正在打开新对话…',
        'dialog.failed': '撤回失败：{message}',
        'dialog.blocked': '无法撤回',
        'dialog.removed': '将移除 {turns} 轮、{messages} 条消息、{tools} 次工具调用。',
        'dialog.kept': '切点之前的 token、金额、上下文都会保留。',
        'dialog.filesUntouched': '文件不会改动。',
        'dialog.tailTokens': '被撤轮次消耗：输入 {input} / 输出 {output} token。它们会从统计里消失，但钱已经花了。',
        'dialog.firstTurn': '这是第 1 轮：会新建一个空白对话，旧对话归档。',
        'dialog.oldSession': '旧对话会立即归档：没有 Agent 占着就当场删文件，否则下次启动时删。',
        'dialog.oldActivity': '会一并停掉：{list}',
        'activity.turn': '正在进行的回合',
        'activity.subagent': '运行中的子代理',
        'activity.job': '后台任务',
        'activity.schedule': '定时提醒',
        'activity.work': '运行中的工作',
        'toast.done': '已撤回：新对话已打开。',
        'toast.queued': '已撤回：旧对话已归档，但还有 Agent 持有它，会在下次启动时删除。',
        'toast.forkFailed': '新对话创建失败。',
        'toast.deleteFailed': '旧对话删除失败：{message}',
        'toast.failed': '请求失败：{message}',
      },
    };

    function messageOf(error) {
      return error instanceof Error ? error.message : String(error);
    }

    async function post(path, body, timeoutMs = 0) {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        ...(timeoutMs > 0 ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
      });
      const payload = await response.json().catch(() => null);
      return { status: response.status, payload };
    }

    // --- root toast -------------------------------------------------------
    let toastValue = null;
    const toastListeners = new Set();
    function showToast(text, tone = 'success') {
      toastValue = { text, tone, id: Date.now() };
      for (const listener of toastListeners) listener();
    }
    function ToastHost() {
      const [value, setValue] = React.useState(toastValue);
      React.useEffect(() => {
        const listener = () => setValue(toastValue);
        toastListeners.add(listener);
        return () => { toastListeners.delete(listener); };
      }, []);
      if (value === null) return null;
      return h(Toast, {
        text: value.text,
        tone: value.tone,
        holdMs: TOAST_MS,
        onDone: () => {
          if (toastValue === value) {
            toastValue = null;
            for (const listener of toastListeners) listener();
          }
        },
      });
    }

    // --- undo dialog store ------------------------------------------------
    let dialogValue = null;
    const dialogListeners = new Set();
    function openUndo(sessionId, turn) {
      dialogValue = { sessionId, turn };
      for (const listener of dialogListeners) listener();
    }
    function closeUndo() {
      dialogValue = null;
      for (const listener of dialogListeners) listener();
    }

    /**
     * The composer owns the draft document (`dsh.conversation.<sessionId>`,
     * read once when the input source mounts). Injection goes through the
     * official seam; `writeDraft` stays as the fallback for a composer that
     * refuses it, because a second writer would race the store's own persist.
     */
    function draftStore(sessionId) {
      try {
        const key = `${CONVERSATION_STORE}.${sessionId}`;
        const raw = localStorage.getItem(key);
        const stored = raw === null ? {} : (JSON.parse(raw) ?? {});
        return { key, stored };
      } catch {
        return undefined;
      }
    }

    function writeDraft(sessionId, text) {
      if (typeof text !== 'string' || text === '') return;
      const store = draftStore(sessionId);
      if (store === undefined) return;
      try {
        store.stored.draft = text;
        localStorage.setItem(store.key, JSON.stringify(store.stored));
      } catch {
        // Draft restoration is best effort.
      }
    }

    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function activityLine(entry, t) {
      const key = `activity.${entry.kind}`;
      const label = t(key) === key ? t('activity.work') : t(key);
      const items = (entry.items ?? [])
        .map((item) => item.label ?? item.id)
        .filter((value) => typeof value === 'string' && value !== '');
      return items.length > 0 ? `${label}: ${items.join(', ')}` : label;
    }

    function UndoDialog(props) {
      const { sessionId, turn, t, onClose, sessions, openSession, startSession, refreshSessions } = props;
      const [phase, setPhase] = React.useState('loading');
      const [plan, setPlan] = React.useState(null);
      const [error, setError] = React.useState(null);

      const load = React.useCallback(async () => {
        setPhase('loading');
        setError(null);
        setPlan(null);
        try {
          const { payload } = await post(PREFLIGHT, { sessionId, turn }, 60_000);
          if (payload === null) {
            setError('empty response');
            setPhase('error');
            return;
          }
          setPlan(payload);
          setPhase(payload.ok === true ? 'ready' : 'blocked');
        } catch (failure) {
          setError(messageOf(failure));
          setPhase('error');
        }
      }, [sessionId, turn]);

      React.useEffect(() => {
        void load();
      }, [load]);

      const close = () => {
        if (phase === 'forking') return;
        onClose();
      };

      const confirm = async () => {
        if (plan === null || plan.ok !== true) return;
        setPhase('forking');
        const prompt = typeof plan.prompt === 'string' ? plan.prompt : '';
        try {
          if (plan.stats.cutSeq >= 0) {
            const childId = await sessions.fork({
              sessionId,
              atSeq: plan.stats.cutSeq,
              increaseTitle: false,
            });
            await openSession(childId);
            // The fork copies the prefix, so an inherited goal would restart its
            // rounds in the child: clear it before anything else touches the new
            // conversation.
            await props.clearGoal(childId);
            const injected = await props.applyDraft(childId, prompt);
            if (injected !== true) writeDraft(childId, prompt);
          } else {
            await startSession(prompt === '' ? undefined : { prompt, clearPreviousDraft: true });
          }
          // startSession/openSession navigate asynchronously; wait until the new
          // Session is actually the main view before deleting the old one.
          for (let attempt = 0; attempt < 20; attempt += 1) {
            if (!props.isCurrentSession(sessionId)) break;
            await delay(50);
          }
        } catch (failure) {
          setError(`${t('toast.forkFailed')} ${messageOf(failure)}`);
          setPhase('error');
          return;
        }
        let outcome = 'deleted';
        try {
          const removed = await post(DELETE_SESSION, { sessionId }, 30_000);
          if (removed.status < 200 || removed.status >= 300) {
            outcome = 'failed';
            showToast(t('toast.deleteFailed', { message: removed.payload?.message ?? `HTTP ${removed.status}` }), 'error');
          } else if (removed.payload?.queued === true) {
            // 202: session-delete archived the Session and queued the files for
            // the next Host start, because an Agent still owns them. Never
            // report that as a finished deletion.
            outcome = 'queued';
          }
        } catch (failure) {
          outcome = 'failed';
          showToast(t('toast.deleteFailed', { message: messageOf(failure) }), 'error');
        }
        try { await refreshSessions(); } catch { /* ignore */ }
        if (outcome === 'deleted') showToast(t('toast.done'));
        else if (outcome === 'queued') showToast(t('toast.queued'));
        onClose();
      };

      const footer = phase === 'ready' || phase === 'error'
        ? h(React.Fragment, null,
          h(Button, { variant: 'outline', onClick: close }, t('dialog.cancel')),
          h(Button, { variant: 'outline', disabled: phase !== 'ready', onClick: () => { void confirm(); } }, t('dialog.confirm')),
        )
        : h(Button, { variant: 'outline', onClick: close }, t('dialog.cancel'));

      const body = [];
      if (phase === 'loading') body.push(h('div', { key: 'loading' }, t('dialog.loading')));
      if (phase === 'forking') body.push(h('div', { key: 'forking' }, t('dialog.forking')));
      if (error !== null) body.push(h('div', { key: 'error', role: 'alert' }, t('dialog.failed', { message: error })));

      if (plan !== null) {
        if (plan.ok !== true) {
          body.push(h('div', { key: 'blocked', role: 'alert' }, plan.message ?? t('dialog.blocked')));
          if (plan.stats !== undefined) {
            body.push(h('div', { key: 'stats' }, t('dialog.removed', {
              turns: plan.stats.turns,
              messages: plan.stats.messages,
              tools: plan.stats.toolCalls,
            })));
          }
        } else {
          body.push(h('div', { key: 'stats' }, t('dialog.removed', {
            turns: plan.stats.turns,
            messages: plan.stats.messages,
            tools: plan.stats.toolCalls,
          })));
          body.push(h('div', { key: 'kept' }, t('dialog.kept')));
          body.push(h('div', { key: 'files-untouched' }, t('dialog.filesUntouched')));
          if (plan.stats.tokens !== undefined) {
            body.push(h('div', { key: 'tokens' }, t('dialog.tailTokens', {
              input: plan.stats.tokens.input,
              output: plan.stats.tokens.output,
            })));
          }
          if (plan.firstTurn === true) body.push(h('div', { key: 'first-turn' }, t('dialog.firstTurn')));
          if (plan.oldSession !== undefined) {
            body.push(h('div', { key: 'old-session' }, t('dialog.oldSession')));
            const activity = plan.oldSession.activity ?? [];
            if (activity.length > 0) {
              body.push(h('div', { key: 'old-activity' }, t('dialog.oldActivity', {
                list: activity.map((entry) => activityLine(entry, t)).join('; '),
              })));
            }
          }
        }
      }

      return h(Modal, {
        open: true,
        onClose: close,
        closeLabel: t('dialog.close'),
        title: t('dialog.title'),
        footer,
        children: body.length > 0 ? body : undefined,
      });
    }

    function UndoHost(props) {
      const [request, setRequest] = React.useState(dialogValue);
      React.useEffect(() => {
        const listener = () => setRequest(dialogValue);
        dialogListeners.add(listener);
        return () => { dialogListeners.delete(listener); };
      }, []);
      if (request === null) return null;
      return h(UndoDialog, {
        key: `${request.sessionId}:${request.turn}`,
        sessionId: request.sessionId,
        turn: request.turn,
        t: props.t,
        onClose: closeUndo,
        sessions: props.services.sessions,
        openSession: props.services.openSession,
        startSession: props.services.startSession,
        refreshSessions: props.services.refreshSessions,
        clearGoal: props.services.clearGoal,
        applyDraft: props.services.applyDraft,
        isCurrentSession: props.services.isCurrentSession,
      });
    }

    function mainSessionId(ctx) {
      try {
        const snapshot = ctx.sessions.list?.getSnapshot?.();
        for (const row of Object.values(snapshot?.byId ?? {})) {
          if ((row.retainedBy?.mainView ?? 0) > 0) return row.sessionId;
        }
      } catch {
        // Fall through to the workspace reference.
      }
      return ctx.uiWorkspace?.mainReference?.sessionId;
    }

    function sessionIdFromNode(node) {
      const key = Object.keys(node).find((name) => name.startsWith('__reactFiber$'));
      let fiber = key === undefined ? undefined : node[key];
      for (let depth = 0; fiber !== undefined && fiber !== null && depth < 200; depth += 1, fiber = fiber.return) {
        const props = fiber.memoizedProps;
        if (typeof props?.sessionId === 'string') return props.sessionId;
      }
      return undefined;
    }

    /** The official user-message action row has no slot; add a native clone next to Copy. */
    function installUserAction(ctx, t) {
      if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return () => {};
      let scheduled = false;
      let observer = null;

      const copyLabel = (label) => {
        if (typeof label !== 'string') return false;
        return label.includes('复制') || label.toLowerCase().includes('copy');
      };

      const scan = () => {
        for (const copy of document.querySelectorAll('button[aria-label]')) {
          if (!copyLabel(copy.getAttribute('aria-label'))) continue;
          if (copy.closest('[class*="_userRow"]') === null) continue;
          const actionsRow = copy.closest('[class*="_actions"]');
          if (actionsRow === null) continue;
          if (actionsRow.querySelector('[data-session-undo]') !== null) continue;
          const turnElement = copy.closest('[data-chat-turn]');
          const turn = turnElement === null ? Number.NaN : Number(turnElement.getAttribute('data-chat-turn'));
          if (!Number.isSafeInteger(turn)) continue;
          const button = document.createElement('button');
          button.type = 'button';
          button.className = copy.className;
          button.dataset.sessionUndo = '1';
          button.setAttribute('aria-label', t('entry.undo'));
          button.title = t('entry.title');
          button.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.2 6.2a5 5 0 1 1 1.1 5.1"/><path d="M4.2 2.9v3.3h3.3"/></svg>';
          button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const sessionId = sessionIdFromNode(copy) ?? sessionIdFromNode(turnElement) ?? mainSessionId(ctx);
            if (typeof sessionId !== 'string') {
              showToast(t('entry.noSession'), 'error');
              return;
            }
            openUndo(sessionId, turn);
          });
          const holder = copy.parentElement;
          const anchor = holder !== null && holder.parentElement === actionsRow ? holder : copy;
          anchor.after(button);
        }
      };

      const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        window.setTimeout(() => {
          scheduled = false;
          scan();
        }, 80);
      };

      const root = document.body;
      if (root === null) return () => {};
      const relevant = (node) => node.nodeType === 1 && (
        node.matches?.('[class*="_userRow"]')
        || node.matches?.('button[aria-label]')
        || node.matches?.('[data-session-undo]')
        || node.querySelector?.('[class*="_userRow"]') !== null
      );
      observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of [...record.addedNodes, ...record.removedNodes]) {
            if (relevant(node)) {
              schedule();
              return;
            }
          }
        }
      });
      observer.observe(root, { childList: true, subtree: true });
      schedule();
      return () => {
        observer?.disconnect();
        observer = null;
        for (const button of document.querySelectorAll('[data-session-undo]')) button.remove();
      };
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
      inject: ['slots', 'locale', 'sessions', 'uiWorkspace', 'remote', 'remote.goals'],
      apply(ctx) {
        const translate = ctx.locale.bind(NS);
        ctx.effect(() => ctx.locale.register(NS, DICTS));
        ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'session-undo.toast',
          order: 60,
          locale: NS,
        }, ToastHost)));
        ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'session-undo.dialog',
          order: 55,
          locale: NS,
        }, (props) => h(UndoHost, {
          ...props,
          t: translate,
          services: {
            sessions: ctx.sessions,
            openSession: (id) => ctx.uiWorkspace.openSession(id),
            startSession: (options) => ctx.uiWorkspace.startSession(undefined, options),
            refreshSessions: () => ctx.sessions.refresh(),
            applyDraft: async (sessionId, prompt) => {
              if (typeof prompt !== 'string' || prompt === '') return true;
              const conversation = ctx.get?.('conversation');
              for (let attempt = 0; attempt < 20; attempt += 1) {
                try {
                  const binding = ctx.sessions.binding(sessionId);
                  const input = conversation?.input;
                  if (binding !== undefined && typeof input?.requestDraftInitialization === 'function') {
                    // Returns "applied" | "preserved" | "blocked"; blocked means
                    // the composer is mid-submit and the text was not written.
                    const status = input.requestDraftInitialization(binding, { prompt, clearPreviousDraft: true });
                    if (status !== 'blocked') return true;
                  }
                } catch {
                  // Retry while the binding or the composer mounts.
                }
                await delay(100);
              }
              return false;
            },
            isCurrentSession: (sessionId) => mainSessionId(ctx) === sessionId,
            clearGoal: async (sessionId) => {
              try {
                for (let attempt = 0; attempt < 20; attempt += 1) {
                  const goal = ctx.sessions.binding(sessionId)?.session.projections.faceOf('goal')?.getSnapshot()?.goal;
                  if (goal !== undefined && goal !== null) {
                    if (goal.phase !== 'complete') {
                      await ctx.remote.goals.clear(sessionId, { id: goal.id, revision: goal.revision });
                    }
                    return;
                  }
                  await delay(100);
                }
              } catch {
                // A goal left over from the prefix must not fail the undo.
              }
            },
          },
        }))));
        ctx.effect(() => installUserAction(ctx, translate));
        ctx.effect(() => () => { closeUndo(); });

        selfCheck(NS, [{
          anchor: '用户消息行 [class*="_userRow"] + 复制按钮',
          impact: '撤回入口不出现',
          // Blank Sessions have no user rows yet: absence is inconclusive.
          probe: () => {
            const rows = [...document.querySelectorAll('[class*="_userRow"]')];
            if (rows.length === 0) return true;
            return rows.some((row) => row.querySelector('button[aria-label]') !== null);
          },
        }]);
      },
    };
  },
});
