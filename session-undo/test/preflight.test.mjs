import assert from 'node:assert/strict';
import { preflight } from '../preflight.js';

const SESSION = 'session-aaaaaaaa-1111-4111-8111-111111111111';

function eventsFor(lastEnded = true) {
  const events = [
    { seq: 0, type: 'turn/start', data: { turn: 1 } },
    { seq: 1, type: 'user/message', data: { turn: 1 } },
    { seq: 2, type: 'assistant/message', data: { turn: 1, usage: { inputTokens: 1, outputTokens: 2 } } },
    { seq: 3, type: 'turn/end', data: { turn: 1 } },
    { seq: 4, type: 'turn/start', data: { turn: 2 } },
    { seq: 5, type: 'user/message', data: { turn: 2, source: { kind: 'user' }, content: [{ type: 'text', text: '把 a 改成 b' }] } },
    { seq: 6, type: 'tool/call', data: { turn: 2, name: 'edit', arguments: '{}' } },
    { seq: 7, type: 'assistant/message', data: { turn: 2, usage: { inputTokens: 3, outputTokens: 4 } } },
  ];
  if (lastEnded) events.push({ seq: 8, type: 'turn/end', data: { turn: 2 } });
  return events;
}

function ctxFor(options = {}) {
  return {
    async waterfall() { return options.activity ?? []; },
    sessionQuery: {
      async observeSession() {
        return {
          header: { id: SESSION, origin: options.origin },
          events: eventsFor(options.ended !== false),
          [Symbol.dispose]() {},
        };
      },
    },
  };
}

const ready = await preflight(ctxFor(), SESSION, 2);
assert.equal(ready.ok, true);
assert.equal(ready.stats.turns, 1);
assert.equal(ready.stats.messages, 2);
assert.equal(ready.stats.toolCalls, 1);
assert.equal(ready.stats.tokens.input, 3);
assert.equal(ready.stats.tokens.output, 4);
assert.equal(ready.firstTurn, false);
assert.equal(ready.prompt, '把 a 改成 b');

const first = await preflight(ctxFor(), SESSION, 1);
assert.equal(first.ok, true);
assert.equal(first.firstTurn, true);
assert.equal(first.stats.cutSeq, -1);

const busy = await preflight(ctxFor({ ended: false }), SESSION, 2);
assert.equal(busy.ok, false);
assert.equal(busy.code, 'busy');

const subagent = await preflight(ctxFor({ origin: 'subagent' }), SESSION, 2);
assert.equal(subagent.ok, false);
assert.equal(subagent.code, 'subagent');

console.log('session-undo preflight tests passed');
