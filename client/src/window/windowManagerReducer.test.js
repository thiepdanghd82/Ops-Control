// @ts-check
/**
 * windowManagerReducer + windowLogic — pure-logic regression for the
 * in-app window manager (Phase 1).
 *
 * Covers open/focus/minimize/maximize/close/restore, the singleton
 * focus-instead-of-duplicate rule, focusedTabId derivation, and layout
 * serialize/deserialize incl. a stale-tabId drop.
 *
 * Runner: node --test src/window/windowManagerReducer.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WM_ACTIONS as A,
  windowManagerReducer as reduce,
  initialWindowState,
} from './windowManagerReducer.js';
import {
  isSingleton,
  isLandingTab,
  isFixedTab,
  serializeLayout,
  deserializeLayout,
  focusedTabId,
  WINDOW_Z_BASE,
} from './windowLogic.js';

function open(state, tabId, opts = {}) {
  return reduce(state, {
    type: A.OPEN,
    payload: {
      tabId,
      title: opts.title || tabId,
      singleton: isSingleton(tabId),
      fixed: isFixedTab(tabId),
      rect: opts.rect,
    },
  });
}

test('OPEN pushes a normal window with raised z', () => {
  const s = open(initialWindowState(), 'standard');
  assert.equal(s.windows.length, 1);
  const w = s.windows[0];
  assert.equal(w.tabId, 'standard');
  assert.equal(w.state, 'normal');
  assert.equal(w.z, s.zTop);
  assert.ok(w.z > WINDOW_Z_BASE);
  assert.equal(w.id, 'win-1');
});

test('OPEN singleton twice → focuses existing, no duplicate', () => {
  let s = open(initialWindowState(), 'standard');
  const firstId = s.windows[0].id;
  const zAfterFirst = s.windows[0].z;
  s = open(s, 'standard');
  assert.equal(s.windows.length, 1, 'no duplicate standard window');
  assert.equal(s.windows[0].id, firstId, 'same window');
  assert.ok(s.windows[0].z > zAfterFirst, 'z raised on re-open');
});

test('OPEN singleton that is minimized → un-minimizes + focuses', () => {
  let s = open(initialWindowState(), 'standard');
  const id = s.windows[0].id;
  s = reduce(s, { type: A.MINIMIZE, payload: { id } });
  assert.equal(s.windows[0].state, 'min');
  s = open(s, 'standard');
  assert.equal(s.windows.length, 1);
  assert.equal(s.windows[0].state, 'normal', 'restored to normal on re-open');
});

test('OPEN multi-instance tab twice → two distinct windows', () => {
  let s = open(initialWindowState(), 'lib-mat');
  s = open(s, 'lib-mat');
  assert.equal(s.windows.length, 2);
  assert.notEqual(s.windows[0].id, s.windows[1].id);
});

test('FOCUS raises z and un-minimizes', () => {
  let s = open(initialWindowState(), 'lib-mat');
  s = open(s, 'dashboard');
  const libId = s.windows[0].id;
  s = reduce(s, { type: A.MINIMIZE, payload: { id: libId } });
  s = reduce(s, { type: A.FOCUS, payload: { id: libId } });
  const lib = s.windows.find((w) => w.id === libId);
  assert.equal(lib.state, 'normal');
  assert.equal(lib.z, s.zTop, 'focused window is top z');
});

test('MINIMIZE keeps the window present (mounted contract)', () => {
  let s = open(initialWindowState(), 'standard');
  const id = s.windows[0].id;
  s = reduce(s, { type: A.MINIMIZE, payload: { id } });
  assert.equal(s.windows.length, 1, 'still in store → stays mounted');
  assert.equal(s.windows[0].state, 'min');
});

test('MAXIMIZE captures prevRect; RESTORE returns to it', () => {
  let s = open(initialWindowState(), 'standard', { rect: { x: 30, y: 40, w: 500, h: 400 } });
  const id = s.windows[0].id;
  s = reduce(s, { type: A.MAXIMIZE, payload: { id } });
  let w = s.windows[0];
  assert.equal(w.state, 'max');
  assert.deepEqual(w.prevRect, { x: 30, y: 40, w: 500, h: 400 });
  s = reduce(s, { type: A.RESTORE, payload: { id } });
  w = s.windows[0];
  assert.equal(w.state, 'normal');
  assert.equal(w.x, 30);
  assert.equal(w.w, 500);
  assert.equal(w.prevRect, null, 'prevRect cleared after restore');
});

test('MAXIMIZE is idempotent (no double-capture of prevRect)', () => {
  let s = open(initialWindowState(), 'standard', { rect: { x: 10, y: 10, w: 600, h: 500 } });
  const id = s.windows[0].id;
  s = reduce(s, { type: A.MAXIMIZE, payload: { id } });
  const after1 = s.windows[0];
  s = reduce(s, { type: A.MAXIMIZE, payload: { id } });
  assert.equal(s.windows[0], after1, 'no-op when already max (ref-equal window)');
});

test('CLOSE removes only the target; others keep their z', () => {
  let s = open(initialWindowState(), 'lib-mat');
  s = open(s, 'dashboard');
  const dashId = s.windows[1].id;
  const libZ = s.windows[0].z;
  s = reduce(s, { type: A.CLOSE, payload: { id: dashId } });
  assert.equal(s.windows.length, 1);
  assert.equal(s.windows[0].tabId, 'lib-mat');
  assert.equal(s.windows[0].z, libZ, 'survivor z untouched');
});

test('MOVE / RESIZE commit geometry', () => {
  let s = open(initialWindowState(), 'standard');
  const id = s.windows[0].id;
  s = reduce(s, { type: A.MOVE, payload: { id, x: 111, y: 222 } });
  s = reduce(s, { type: A.RESIZE, payload: { id, w: 700, h: 480 } });
  const w = s.windows[0];
  assert.equal(w.x, 111);
  assert.equal(w.y, 222);
  assert.equal(w.w, 700);
  assert.equal(w.h, 480);
});

test('RESIZE clamps below the minimum', () => {
  let s = open(initialWindowState(), 'standard');
  const id = s.windows[0].id;
  s = reduce(s, { type: A.RESIZE, payload: { id, w: 10, h: 10 } });
  const w = s.windows[0];
  assert.ok(w.w >= 320);
  assert.ok(w.h >= 200);
});

test('focusedTabId → highest-z non-minimized window', () => {
  let s = open(initialWindowState(), 'lib-mat'); // z low
  s = open(s, 'standard'); // z highest
  assert.equal(focusedTabId(s), 'standard');
  // Minimize standard → focus falls to lib-mat.
  const stdId = s.windows.find((w) => w.tabId === 'standard').id;
  s = reduce(s, { type: A.MINIMIZE, payload: { id: stdId } });
  assert.equal(focusedTabId(s), 'lib-mat');
});

test('focusedTabId null when empty or all minimized', () => {
  assert.equal(focusedTabId(initialWindowState()), null);
  let s = open(initialWindowState(), 'standard');
  const id = s.windows[0].id;
  s = reduce(s, { type: A.MINIMIZE, payload: { id } });
  assert.equal(focusedTabId(s), null);
});

// ── fixed (Home base) window ──
test('fixed window: opens at base z, below floating windows', () => {
  let s = open(initialWindowState(), 'home');
  const home = s.windows[0];
  assert.equal(home.fixed, true);
  assert.equal(home.z, WINDOW_Z_BASE, 'home pinned to base z');
  s = open(s, 'standard');
  const std = s.windows.find((w) => w.tabId === 'standard');
  assert.ok(std.z > home.z, 'floating window above home');
  assert.equal(focusedTabId(s), 'standard', 'home never grabs focus over a float');
});

test('fixed window: CLOSE / MINIMIZE / MAXIMIZE are no-ops', () => {
  let s = open(initialWindowState(), 'home');
  const id = s.windows[0].id;
  s = reduce(s, { type: A.CLOSE, payload: { id } });
  assert.equal(s.windows.length, 1, 'home cannot be closed');
  s = reduce(s, { type: A.MINIMIZE, payload: { id } });
  assert.equal(s.windows[0].state, 'normal', 'home cannot be minimized');
  s = reduce(s, { type: A.MAXIMIZE, payload: { id } });
  assert.equal(s.windows[0].state, 'normal', 'home cannot be maximized');
  assert.equal(s.windows[0].fixed, true);
});

test('fixed window: FOCUS does not raise it above floats', () => {
  let s = open(initialWindowState(), 'home');
  s = open(s, 'standard');
  const homeId = s.windows.find((w) => w.tabId === 'home').id;
  const stdZ = s.windows.find((w) => w.tabId === 'standard').z;
  s = reduce(s, { type: A.FOCUS, payload: { id: homeId } });
  const home = s.windows.find((w) => w.id === homeId);
  assert.ok(home.z < stdZ, 'home stays behind the float even when focused');
});

test('fixed window: re-OPEN home never duplicates', () => {
  let s = open(initialWindowState(), 'home');
  s = open(s, 'home');
  assert.equal(s.windows.filter((w) => w.tabId === 'home').length, 1);
});

test('fixed survives serialize → deserialize (fixed recomputed)', () => {
  let s = open(initialWindowState(), 'home');
  s = open(s, 'lib-mat');
  const layout = serializeLayout(s);
  const back = deserializeLayout(layout, () => true);
  const home = back.windows.find((w) => w.tabId === 'home');
  assert.equal(home.fixed, true);
  assert.equal(home.z, WINDOW_Z_BASE);
  assert.equal(back.windows.find((w) => w.tabId === 'lib-mat').fixed, false);
});

// ── classification ──
test('isSingleton classification', () => {
  assert.equal(isSingleton('standard'), true);
  assert.equal(isSingleton('complex'), true);
  assert.equal(isSingleton('quote-history'), true, 'audit-safe singleton');
  assert.equal(isSingleton('rfq-tracking'), true, 'audit-safe singleton');
  assert.equal(isSingleton('lib-mat'), false);
  assert.equal(isSingleton('dashboard'), false);
  assert.equal(isSingleton('help'), false);
  assert.equal(isSingleton('landing:quoting'), false);
  assert.equal(isLandingTab('landing:quoting'), true);
  assert.equal(isSingleton('some-unknown-tab'), true, 'unknown → singleton (fail-safe)');
  assert.equal(isSingleton('home'), true, 'home is a single fixed window');
  assert.equal(isFixedTab('home'), true);
  assert.equal(isFixedTab('standard'), false);
});

// ── persistence ──
test('serialize → deserialize round-trip (known tabs kept)', () => {
  let s = open(initialWindowState(), 'standard');
  s = open(s, 'lib-mat');
  s = open(s, 'lib-mat');
  const layout = serializeLayout(s);
  assert.equal(layout.v, 1);
  assert.equal(layout.windows.length, 3);
  const back = deserializeLayout(layout, () => true);
  assert.equal(back.windows.length, 3);
  assert.equal(back.windows[0].tabId, 'standard');
  // singleton recomputed on hydrate
  assert.equal(back.windows[0].singleton, true);
  assert.equal(back.windows[1].singleton, false);
});

test('deserialize drops a stale tabId; all-stale → null', () => {
  let s = open(initialWindowState(), 'standard');
  s = open(s, 'gone-tab');
  const layout = serializeLayout(s);
  const known = (t) => t === 'standard';
  const back = deserializeLayout(layout, known);
  assert.equal(back.windows.length, 1, 'stale gone-tab dropped');
  assert.equal(back.windows[0].tabId, 'standard');

  const allStale = deserializeLayout(
    {
      v: 1,
      windows: [{ id: 'x', tabId: 'nope', x: 0, y: 0, w: 400, h: 300, z: 1001, state: 'normal' }],
    },
    () => false
  );
  assert.equal(allStale, null, 'all-stale → null so caller falls back to default');
});

test('deserialize rejects garbage', () => {
  assert.equal(
    deserializeLayout(null, () => true),
    null
  );
  assert.equal(
    deserializeLayout({ windows: 'nope' }, () => true),
    null
  );
  assert.equal(
    deserializeLayout({ windows: [] }, () => true),
    null
  );
});

test('HYDRATE replaces the store', () => {
  const s = open(initialWindowState(), 'standard');
  const layout = serializeLayout(s);
  const hydrated = deserializeLayout(layout, () => true);
  const next = reduce(initialWindowState(), { type: A.HYDRATE, payload: hydrated });
  assert.equal(next.windows.length, 1);
  assert.equal(next.windows[0].tabId, 'standard');
});
