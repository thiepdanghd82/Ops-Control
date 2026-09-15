/** Runner: node --test src/components/Layout/sidebarAutoHide.test.js */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSidebarLayout, shouldHideOnPointerDown, AUTO_HIDE_KEY } from './sidebarAutoHide.js';

const cls = (s) => resolveSidebarLayout(s);

test('pinned mode is byte-identical to the behaviour before auto-hide existed', () => {
  assert.deepEqual(cls({}), {
    layout: 'app-layout',
    aside: 'sidebar',
    showHotzone: false,
    inert: false,
  });
  const collapsed = cls({ collapsed: true });
  assert.equal(collapsed.layout, 'app-layout sidebar-collapsed');
  assert.equal(collapsed.aside, 'sidebar sidebar-collapsed');
});

test('a pinned sidebar is never treated as hidden, whatever `revealed` says', () => {
  // revealed is meaningless while pinned; it must not leak a class or inert.
  const out = cls({ autoHide: false, revealed: false });
  assert.equal(out.aside, 'sidebar');
  assert.equal(out.inert, false);
  assert.equal(out.showHotzone, false);
});

test('auto-hide while hidden: edge strip on, content inert', () => {
  const out = cls({ autoHide: true, revealed: false });
  assert.equal(out.layout, 'app-layout sidebar-auto');
  assert.equal(out.aside, 'sidebar sidebar-auto');
  assert.equal(out.showHotzone, true);
  assert.equal(out.inert, true, 'off-canvas nav must be out of the tab order');
});

test('auto-hide while revealed: strip off so it cannot swallow the first nav click', () => {
  const out = cls({ autoHide: true, revealed: true });
  assert.equal(out.aside, 'sidebar sidebar-auto sidebar-revealed');
  assert.equal(out.showHotzone, false);
  assert.equal(out.inert, false);
});

test('the width choice survives auto-hide — the two are orthogonal', () => {
  const out = cls({ autoHide: true, collapsed: true, revealed: true });
  assert.equal(out.layout, 'app-layout sidebar-collapsed sidebar-auto');
  assert.equal(out.aside, 'sidebar sidebar-collapsed sidebar-auto sidebar-revealed');
});

// ── click-outside rule ───────────────────────────────────────────────

const fakeSidebar = (inside) => ({ contains: (n) => n === inside });
const el = (className) => ({
  classList: { contains: (c) => c === className },
});

test('a press in the work area hides', () => {
  const inside = el('nav-item');
  assert.equal(shouldHideOnPointerDown(el('table-cell'), fakeSidebar(inside)), true);
});

test('a press inside the sidebar does NOT hide', () => {
  const inside = el('nav-item');
  assert.equal(shouldHideOnPointerDown(inside, fakeSidebar(inside)), false);
});

test('a press on the edge strip does NOT hide — that gesture is opening it', () => {
  assert.equal(shouldHideOnPointerDown(el('sidebar-edge-hotzone'), fakeSidebar(el('x'))), false);
});

test('missing node or target is safe', () => {
  assert.equal(shouldHideOnPointerDown(null, fakeSidebar(el('x'))), false);
  assert.equal(shouldHideOnPointerDown(el('x'), null), false);
  assert.equal(shouldHideOnPointerDown(el('x'), {}), false);
});

test('the storage key is a sibling of the collapse key, not a clash', () => {
  assert.equal(AUTO_HIDE_KEY, 'ops_sidebar_autohide');
  assert.notEqual(AUTO_HIDE_KEY, 'ops_sidebar_collapsed');
});
