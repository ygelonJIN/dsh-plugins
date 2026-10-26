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
        'dialog.firstTurn': 'This is the first turn: a new empty conversation opens and the old conversation is removed.',
        'dialog.oldSession': 'The old conversation is archived now and queued for deletion.',
        'dialog.oldActivity': 'These stop with it: {list}',
        'activity.turn': 'a running turn',
        'activity.subagent': 'running subagents',
        'activity.job': 'background jobs',
        'activity.schedule': 'scheduled reminders',
        'activity.work': 'work',
        'toast.done': 'Undone. The new conversation is open.',
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
        'dialog.firstTurn': '这是第 1 轮：会新建一个空白对话，并删除旧对话。',
        'dialog.oldSession': '旧对话会先归档，并排队删除。',
        'dialog.oldActivity': '会一并停掉：{list}',
        'activity.turn': '正在进行的回合',
        'activity.subagent': '运行中的子代理',
        'activity.job': '后台任务',
        'activity.schedule': '定时提醒',
        'activity.work': '运行中的工作',
        'toast.done': '已撤回：新对话已打开。',
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

    function writeDraft(sessionId, text) {
      if (typeof text !== 'string' || text === '') return;
      try {
        const key = `${CONVERSATION_STORE}.${sessionId}`;
        const raw = localStorage.getItem(key);
        const stored = raw === null ? {} : (JSON.parse(raw) ?? {});
        stored.draft = text;
        localStorage.setItem(key, JSON.stringify(stored));
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
            writeDraft(childId, prompt);
            await openSession(childId);
            await props.applyDraft(childId, prompt);
            await props.clearGoal(childId);
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
        try {
          const removed = await post(DELETE_SESSION, { sessionId }, 30_000);
          if (removed.status < 200 || removed.status >= 300) {
            showToast(t('toast.deleteFailed', { message: removed.payload?.message ?? `HTTP ${removed.status}` }), 'error');
          }
        } catch (failure) {
          showToast(t('toast.deleteFailed', { message: messageOf(failure) }), 'error');
        }
        try { await refreshSessions(); } catch { /* ignore */ }
        showToast(t('toast.done'));
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
              if (typeof prompt !== 'string' || prompt === '') return;
              const conversation = ctx.get?.('conversation');
              for (let attempt = 0; attempt < 6; attempt += 1) {
                try {
                  const binding = ctx.sessions.binding(sessionId);
                  if (binding !== undefined) {
                    conversation?.input?.requestDraftInitialization?.(binding, { prompt, clearPreviousDraft: true });
                    return;
                  }
                } catch {
                  // Retry while the binding appears.
                }
                await delay(50);
              }
            },
            isCurrentSession: (sessionId) => mainSessionId(ctx) === sessionId,
            clearGoal: async (sessionId) => {
              try {
                for (let attempt = 0; attempt < 5; attempt += 1) {
                  const goal = ctx.sessions.binding(sessionId)?.session.projections.faceOf('goal')?.getSnapshot()?.goal;
                  if (goal !== undefined && goal !== null) {
                    if (goal.phase !== 'complete') {
                      await ctx.remote.goals.clear(sessionId, { id: goal.id, revision: goal.revision });
                    }
                    return;
                  }
                  await delay(60);
                }
              } catch {
                // A goal left over from the prefix must not fail the undo.
              }
            },
          },
        }))));
        ctx.effect(() => installUserAction(ctx, translate));
        ctx.effect(() => () => { closeUndo(); });
      },
    };
  },
});
