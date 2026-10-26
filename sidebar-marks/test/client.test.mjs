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
assert.equal(entry.id, '@local/sidebar-marks');

const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (value) => [value, () => {}],
  useEffect: () => {},
  Fragment: 'Fragment',
};
const primitives = {
  MenuItemButton: 'MenuItemButton',
  Toast: 'Toast',
};
const module = entry.factory((name) => {
  if (name === 'react') return React;
  if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives;
  throw new Error(`unexpected require ${name}`);
});

assert.deepEqual(module.inject, ['slots', 'locale', 'sessions']);

const slots = [];
const cleanups = [];
const ctx = {
  effect(callback) {
    const dispose = callback();
    if (typeof dispose === 'function') cleanups.push(dispose);
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
    register(configuration, component) {
      slots.push({ configuration, component });
      return () => {};
    },
  },
  sessions: {
    list: {
      getSnapshot: () => ({ byId: {} }),
    },
  },
  get() {
    return null;
  },
};
module.apply(ctx);

assert.deepEqual(
  slots.map((slot) => `${slot.configuration.name}:${slot.configuration.id}`),
  [
    'sidebar.workspaces.session.menu.item:sidebar-marks.mark',
    'shell.overlay:sidebar-marks.overlay',
  ],
);

// The Session menu row toggles the mark through the shipped MenuItemButton,
// closing the row menu first.
const markItem = slots.find((slot) => slot.configuration.id === 'sidebar-marks.mark').component;
let menuClosed = false;
const row = markItem({
  sessionId: 'session-aaaa',
  displayTitle: 'A title',
  useMenuOpenState: () => [true, (next) => { menuClosed = next === false; }],
  t: (key) => key,
});
assert.equal(row.type, 'MenuItemButton');
assert.deepEqual(row.children, ['menu.mark']);
assert.equal(typeof row.props.onSelect, 'function');
row.props.onSelect();
assert.equal(menuClosed, true, 'the row menu closes on select');

// The overlay only carries the failure Toast; with no failure it renders nothing.
const overlay = slots.find((slot) => slot.configuration.id === 'sidebar-marks.overlay').component;
assert.equal(overlay({ t: (key) => key }), null);

for (const dispose of cleanups) {
  try { dispose(); } catch { /* a stub service may not need tearing down */ }
}
console.log('client.test.mjs ok');
