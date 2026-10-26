import assert from 'node:assert/strict';

/** The client half registers through the Web Module Loader; load it with stubs. */
let entry;
globalThis.window = {
  __ModuleLoader__: {
    load(candidate) {
      entry = candidate;
    },
  },
};

await import('../client.js');
assert.equal(entry.id, '@local/session-undo');

const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (value) => [value, () => {}],
  useEffect: () => {},
  Fragment: 'Fragment',
};
const primitives = {
  Button: 'Button',
  Modal: 'Modal',
  Toast: 'Toast',
};
const module = entry.factory((name) => {
  if (name === 'react') return React;
  if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives;
  throw new Error(`unexpected require ${name}`);
});

assert.deepEqual(module.inject, ['slots', 'locale', 'sessions', 'uiWorkspace', 'remote', 'remote.goals']);
const slots = [];
const ctx = {
  effect(callback) {
    callback();
  },
  locale: {
    bind: () => (key) => key,
    register() {
      return () => {};
    },
  },
  slots: {
    inject(name, register) {
      register();
    },
    register(configuration) {
      slots.push(configuration);
      return () => {};
    },
  },
  sessions: {},
  uiWorkspace: {},
};
module.apply(ctx);
assert.deepEqual(slots.map((slot) => `${slot.name}:${slot.id}`), [
  'shell.overlay:session-undo.toast',
  'shell.overlay:session-undo.dialog',
]);
console.log('session-undo client smoke test passed');
