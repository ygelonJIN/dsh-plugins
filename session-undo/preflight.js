/** Conversation-only preflight for `@local/session-undo`. No file access. */

function countTokens(events) {
  let input = 0;
  let output = 0;
  for (const event of events) {
    if (event.type !== 'assistant/message' || event.data.usage === undefined) continue;
    input += (Number(event.data.usage.inputTokens) || 0)
      + (Number(event.data.usage.cacheReadTokens) || 0)
      + (Number(event.data.usage.cacheWriteTokens) || 0);
    output += Number(event.data.usage.outputTokens) || 0;
  }
  return { input, output };
}

function describeActivity(activity) {
  return activity.map((entry) => ({
    kind: typeof entry?.kind === 'string' && entry.kind !== '' ? entry.kind : 'work',
    items: Array.isArray(entry?.items)
      ? entry.items
        .map((item) => ({
          ...(typeof item?.id === 'string' ? { id: item.id } : {}),
          ...(typeof item?.label === 'string' && item.label !== '' ? { label: item.label } : {}),
        }))
        .filter((item) => item.id !== undefined || item.label !== undefined)
      : [],
  }));
}

async function inspectActivity(ctx, sessionId) {
  if (typeof ctx.waterfall !== 'function') return [];
  try {
    const pending = ctx.waterfall('workspace/session-activity', { sessionId }, () => Promise.resolve([]));
    const value = await Promise.race([pending, new Promise((resolve) => setTimeout(() => resolve([]), 1500))]);
    return Array.isArray(value) ? describeActivity(value) : [];
  } catch {
    return [];
  }
}

/** The user message that opened the target turn, used to seed the new draft. */
function userPrompt(events, turn, turnStartSeq) {
  const boundary = events.find((candidate) => candidate.seq > turnStartSeq && (
    candidate.type === 'turn/start'
    || (candidate.type === 'turn/end' && candidate.data?.turn === turn)
  ));
  const endSeq = boundary === undefined ? Number.POSITIVE_INFINITY : boundary.seq;
  const event = events.find((candidate) => candidate.type === 'user/message'
    && candidate.seq > turnStartSeq
    && candidate.seq < endSeq
    && candidate.data?.source?.kind === 'user');
  const content = Array.isArray(event?.data?.content) ? event.data.content : [];
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

export async function preflight(ctx, sessionId, turn) {
  const observation = await ctx.sessionQuery.observeSession(sessionId);
  let events;
  let subagent = false;
  try {
    subagent = observation.header?.origin === 'subagent';
    events = Array.isArray(observation.events) ? [...observation.events] : [];
  } finally {
    try {
      observation?.[Symbol.dispose]?.();
    } catch {
      // Best-effort.
    }
  }
  if (subagent) return { ok: false, code: 'subagent', message: '子代理会话不能撤回。' };
  const turnStart = events.find((event) => event.type === 'turn/start' && event.data?.turn === turn);
  if (turnStart === undefined) throw new Error(`turn ${turn} is not in session ${sessionId}`);
  const cutSeq = turnStart.seq - 1;
  const removed = events.filter((event) => event.seq > cutSeq);
  const lastTurn = removed.reduce((max, event) => {
    const value = event.data?.turn;
    return Number.isInteger(value) && value > max ? value : max;
  }, turn);
  const stats = {
    turn,
    lastTurn,
    cutSeq,
    turns: lastTurn - turn + 1,
    messages: removed.filter((event) => event.type === 'user/message' || event.type === 'assistant/message').length,
    toolCalls: removed.filter((event) => event.type === 'tool/call').length,
    tokens: countTokens(removed),
  };
  const lastStart = [...events].reverse().find((event) => event.type === 'turn/start');
  const lastEnd = [...events].reverse().find((event) => event.type === 'turn/end');
  if (lastStart !== undefined && (lastEnd === undefined || lastEnd.seq < lastStart.seq)) {
    return {
      ok: false,
      code: 'busy',
      message: '当前还有回合在生成，先停止或等它结束再撤回。',
      stats,
      firstTurn: cutSeq < 0,
      oldSession: { activity: await inspectActivity(ctx, sessionId), subagents: 0 },
    };
  }
  return {
    ok: true,
    sessionId,
    stats,
    firstTurn: cutSeq < 0,
    oldSession: { activity: await inspectActivity(ctx, sessionId), subagents: 0 },
    prompt: userPrompt(events, turn, turnStart.seq),
    warnings: [],
  };
}
