/**
 * The auto-hide overlay must out-rank the MDI window layer.
 *
 * Shipped broken first time round: the sidebar overlay was z-index 60 and
 * its edge strip 59, while `.opswin-window` is **4500**. None of the
 * ancestors (.app-layout, .app-main, .app-content, .opswin-root,
 * .opswin-desktop) sets transform / filter / opacity / contain / isolation
 * or a z-index of its own, so that 4500 is not trapped in a nested
 * stacking context — it competes at the root and painted straight over
 * both. Turning auto-hide on with any window open therefore hid the
 * sidebar with no way to bring it back, because the only control that
 * leaves the mode lives inside the sidebar.
 *
 * Parsing the stylesheets rather than asserting a literal: the point is
 * the ORDERING against whatever the window layer uses, so this keeps
 * holding if someone renumbers either side.
 *
 * Runner: node --test src/components/Layout/sidebarAutoHide.css.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../..');
const sidebarCss = fs.readFileSync(path.join(HERE, 'Sidebar.css'), 'utf8');
const windowCss = fs.readFileSync(path.join(SRC, 'window/WindowLayer.css'), 'utf8');

/** Highest z-index declared under a selector, or null. */
function zIndexOf(css, selector) {
  const at = css.indexOf(selector + ' {');
  if (at === -1) return null;
  const block = css.slice(at, css.indexOf('}', at));
  const m = /z-index:\s*(\d+)/.exec(block);
  return m ? Number(m[1]) : null;
}

const WINDOW_Z = (() => {
  const all = [...windowCss.matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(all.length > 0, 'WindowLayer.css should declare a z-index');
  return Math.max(...all);
})();

test('the revealed sidebar paints above the MDI windows', () => {
  const z = zIndexOf(sidebarCss, '.app-layout.sidebar-auto .sidebar');
  assert.ok(z != null, 'auto-hide sidebar rule must declare a z-index');
  assert.ok(z > WINDOW_Z, `sidebar z-index ${z} must beat the window layer's ${WINDOW_Z}`);
});

test('the edge handle paints above the MDI windows too, or it can never be hovered', () => {
  const z = zIndexOf(sidebarCss, '.sidebar-edge-handle');
  assert.ok(z != null, 'the handle must declare a z-index');
  assert.ok(z > WINDOW_Z, `handle z-index ${z} must beat the window layer's ${WINDOW_Z}`);
});

test('the handle sits just under the sidebar it opens', () => {
  const sidebar = zIndexOf(sidebarCss, '.app-layout.sidebar-auto .sidebar');
  const handle = zIndexOf(sidebarCss, '.sidebar-edge-handle');
  assert.ok(handle < sidebar, 'a revealed sidebar must cover the handle, not the other way round');
});

test('modals and banners still cover the sidebar', () => {
  // 9999+ is the modal / toast / connection-banner tier across the app.
  const sidebar = zIndexOf(sidebarCss, '.app-layout.sidebar-auto .sidebar');
  assert.ok(sidebar < 9999, `sidebar z-index ${sidebar} must stay below the modal tier`);
});

test('the handle is visible, not an invisible strip', () => {
  const at = sidebarCss.indexOf('.sidebar-edge-handle {');
  const block = sidebarCss.slice(at, sidebarCss.indexOf('}', at));
  assert.match(block, /background:/, 'an invisible edge strip is undiscoverable');
  assert.match(block, /cursor:\s*pointer/, 'it must read as clickable');
});
