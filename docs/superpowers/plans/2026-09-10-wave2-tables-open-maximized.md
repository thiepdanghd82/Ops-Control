# Table Screens Open Maximized Implementation Plan

> **STATUS: SHIPPED — do not re-execute.** Shipped 2026-09-10 — PRs #286 (`b151eb5`), #289 (`5e6f3b0`), #290 (`641c98b`). Every non-calculator screen opens maximized; the four floating utilities and both pricing worksheets were settled in #289/#290. Taskbar "Đóng tất cả" landed with #286.
>
> Every box below is ticked because the work is on `main`, not because someone walked the plan a second time. Read it as a record of what was decided and why.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give data-grid screens the full window instead of a 900px floating box they cannot fit in.

**Architecture:** The window manager already has everything needed — a `MAXIMIZE` action, a `state: 'max'` flag, and an established Set-of-tab-ids idiom (`MULTI_INSTANCE_TABS`) for classifying tabs. This adds one more Set, `MAXIMIZED_BY_DEFAULT`, plus a predicate `opensMaximized(tabId)`, and has the `OPEN` reducer case honour it. No new concepts, no changes to how windows are dragged, resized, restored or persisted. Floating stays the default for calculators, where side-by-side comparison is the point.

**Tech Stack:** React 19, `node:test` + `node:assert/strict`, ESM.

**Spec:** UI/UX audit findings, 2026-09-10 (this session). Measured live at viewport 1440×900 with six windows open: every window 898px wide = **62% of the viewport**, while the widest table's `scrollWidth` was **3333px**. The table gets 27% of the width it needs while 38% of the screen sits empty behind the floating window.

## Global Constraints

- **Do not touch the MDI model.** It is a deliberate product bet (PR #258) and the operator confirmed it stays. This plan changes only the _initial state_ of certain windows.
- **Window state values are exactly `'normal' | 'min' | 'max'`.** No other strings.
- **`prevRect` is what Restore returns to.** A window that opens maximized must still carry a sensible `prevRect`, or clicking Restore leaves it with nothing to restore to.
- Follow the existing Set idiom in `windowLogic.js` — a new classifier goes next to `MULTI_INSTANCE_TABS`, not into a config file or a component.
- Test style follows `window/windowManagerReducer.test.js`: `import test from 'node:test'`, `import assert from 'node:assert/strict'`, and the local `open(state, tabId, opts)` helper.
- Run: `cd client && node --test 'src/**/*.test.js'` (1797 tests green as of this plan).

---

### Task 1: Classify which tabs open maximized

**Files:**

- Modify: `client/src/window/windowLogic.js` (add after the `MULTI_INSTANCE_TABS` block, around line 58)
- Test: `client/src/window/windowLogic.test.js` (create)

**Interfaces:**

- Consumes: nothing.
- Produces: `export const MAXIMIZED_BY_DEFAULT: Set<string>` and `export function opensMaximized(tabId: string): boolean`. Task 2 imports `opensMaximized`.

- [x] **Step 1: Write the failing test**

Create `client/src/window/windowLogic.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { opensMaximized } from './windowLogic.js';

test('data-grid screens open maximized', () => {
  for (const id of [
    'quote-history',
    'rfq-tracking',
    'lib-inventory',
    'npi-parts-list',
    'rfq-tracker',
    'sample-tracking',
    'lib-mat',
    'approvals-inbox',
    'audit-log',
  ]) {
    assert.equal(opensMaximized(id), true, `${id} should open maximized`);
  }
});

test('calculators keep floating so they can be compared side by side', () => {
  for (const id of ['standard', 'complex', 'ink-calc', 'print-area']) {
    assert.equal(opensMaximized(id), false, `${id} should stay floating`);
  }
});

test('home is never maximized — it is the fixed base layer', () => {
  assert.equal(opensMaximized('home'), false);
});

test('an unknown tab id is not maximized', () => {
  assert.equal(opensMaximized('does-not-exist'), false);
  assert.equal(opensMaximized(undefined), false);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd client && node --test src/window/windowLogic.test.js`
Expected: FAIL — `does not provide an export named 'opensMaximized'`.

- [x] **Step 3: Add the Set and the predicate**

In `client/src/window/windowLogic.js`, directly after the closing `]);` of `MULTI_INSTANCE_TABS`:

```js
/**
 * Tabs whose content is a data grid. Measured 2026-09-10 at viewport
 * 1440×900: the widest of these tables reports scrollWidth 3333px while a
 * default window is 900px, so a floating window shows roughly a quarter of
 * the columns and leaves 38% of the screen empty behind it. These open
 * maximized; the operator can still restore, move and resize them.
 *
 * Calculators are deliberately absent — comparing Standard against Complex
 * side by side is the reason the MDI shell exists.
 */
export const MAXIMIZED_BY_DEFAULT = new Set([
  'quote-history',
  'rfq-tracking',
  'lib-inventory',
  'npi-parts-list',
  'rfq-tracker',
  'sample-tracking',
  'lib-mat',
  'approvals-inbox',
  'audit-log',
]);

export function opensMaximized(tabId) {
  return !isFixedTab(tabId) && MAXIMIZED_BY_DEFAULT.has(tabId);
}
```

`isFixedTab` is already defined in this file; the guard keeps Home floating-free even if someone adds `'home'` to the Set by mistake.

- [x] **Step 4: Run the test to verify it passes**

Run: `cd client && node --test src/window/windowLogic.test.js`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add client/src/window/windowLogic.js client/src/window/windowLogic.test.js
git commit -m "$(cat <<'EOF'
feat(apps/client): classify which tabs should open maximized

Data-grid screens need more width than a floating window can give them:
measured at viewport 1440x900, the widest table reports scrollWidth
3333px while a default window is 900px, so the operator sees about a
quarter of the columns while 38% of the screen sits empty behind the
window.

Adds MAXIMIZED_BY_DEFAULT next to MULTI_INSTANCE_TABS, following the
same Set-of-tab-ids idiom. Calculators are deliberately excluded —
comparing Standard against Complex side by side is why the MDI shell
exists. No behaviour change yet; Task 2 wires it into OPEN.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Honour the classification when a window opens

**Files:**

- Modify: `client/src/window/windowManagerReducer.js:58-94` (the `A.OPEN` case) and its import block at the top
- Test: `client/src/window/windowManagerReducer.test.js`

**Interfaces:**

- Consumes: `opensMaximized` from Task 1.
- Produces: a window opened for a `MAXIMIZED_BY_DEFAULT` tab has `state: 'max'` and a non-null `prevRect`. Nothing later depends on this.

- [x] **Step 1: Write the failing test**

Append to `client/src/window/windowManagerReducer.test.js`:

```js
test('a data-grid tab opens maximized with a restorable prevRect', () => {
  const s = open(initialWindowState(), 'quote-history');
  const w = s.windows[s.windows.length - 1];

  assert.equal(w.state, 'max');
  assert.ok(w.prevRect, 'must carry a prevRect or Restore has nowhere to go');
  assert.ok(w.prevRect.w >= 320 && w.prevRect.h >= 200, 'prevRect must be a usable size');
});

test('a calculator tab still opens as a normal floating window', () => {
  const s = open(initialWindowState(), 'standard');
  const w = s.windows[s.windows.length - 1];

  assert.equal(w.state, 'normal');
  assert.equal(w.prevRect, null);
});

test('re-focusing an already-maximized singleton does not shrink it', () => {
  let s = open(initialWindowState(), 'quote-history');
  s = open(s, 'quote-history'); // singleton → focus path, not a second window
  const w = s.windows[s.windows.length - 1];

  assert.equal(s.windows.length, 1);
  assert.equal(w.state, 'max', 'clicking the sidebar item again must not un-maximize it');
});

test('re-focusing a minimized window still restores it to normal', () => {
  let s = open(initialWindowState(), 'quote-history');
  const id = s.windows[0].id;
  s = reduce(s, { type: A.MINIMIZE, payload: { id } });
  assert.equal(s.windows[0].state, 'min');

  s = open(s, 'quote-history');
  assert.notEqual(s.windows[0].state, 'min', 'a minimized window must come back');
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd client && node --test src/window/windowManagerReducer.test.js`
Expected: FAIL — `Expected values to be strictly equal: 'normal' !== 'max'`.

- [x] **Step 3: Import the predicate**

In `client/src/window/windowManagerReducer.js`, extend the existing import from `./windowLogic.js` (the block starting at line 16 that already pulls `DEFAULT_WINDOW_W`) to also import `opensMaximized`.

- [x] **Step 4: Set the initial state in the OPEN case**

Replace the `win` object literal and the singleton re-focus mapper in `case A.OPEN`:

```js
if (singleton) {
  const existing = state.windows.find((w) => w.tabId === tabId);
  if (existing) {
    const z = raise(state);
    return {
      ...state,
      zTop: z,
      windows: state.windows.map((w) =>
        // Un-minimize, but never un-maximize: clicking the sidebar
        // item again means "bring it forward", not "shrink it".
        w.id === existing.id ? { ...w, z, state: w.state === 'min' ? 'normal' : w.state } : w
      ),
    };
  }
}
const counter = state.counter + 1;
const z = raise(state);
const geo = cascadeRect(state.counter, rect);
const maximized = opensMaximized(tabId);
const win = {
  id: `win-${counter}`,
  tabId,
  title,
  x: geo.x,
  y: geo.y,
  w: geo.w,
  h: geo.h,
  z,
  state: maximized ? 'max' : 'normal',
  singleton: !!singleton,
  fixed: !!fixed,
  // A window that opens maximized still needs somewhere to go when
  // the operator clicks Restore — the cascade rect it would have had.
  prevRect: maximized ? { x: geo.x, y: geo.y, w: geo.w, h: geo.h } : null,
};
```

- [x] **Step 5: Run the test to verify it passes**

Run: `cd client && node --test src/window/windowManagerReducer.test.js`
Expected: PASS, including every pre-existing reducer test.

- [x] **Step 6: Run the full client suite**

Run: `cd client && node --test 'src/**/*.test.js'`
Expected: PASS.

- [x] **Step 7: Verify in the running app**

The installed app at `:3100` serves a built bundle, not this code. Start the dev client and point its proxy at the live API:

1. In `client/vite.config.js`, temporarily change the three `target: 'http://localhost:3000'` entries to `http://localhost:3100` and add `'/health'` and `'/metrics'` proxy entries. **This edit is for verification only — revert it before committing.**
2. Start the dev server on port 5174 and log in.
3. Open **Quote History**.

Expected: it fills the frame, no cascade offset, no horizontal scrollbar on the outer window.
Expected: its Restore button returns it to a normal floating window that can be dragged.
Expected: **Pricing (Std)** still opens as a floating window.

Confirm from the browser console:

```js
[...document.querySelectorAll('.opswin-frame')].map((w) => {
  const r = w.getBoundingClientRect();
  return { w: Math.round(r.width), pctOfViewport: Math.round((r.width / innerWidth) * 100) };
});
```

Expected: the Quote History frame reports ~100% of viewport width, against the 62% measured before this change.

4. Revert `client/vite.config.js` and confirm `git status` shows it unmodified.

- [x] **Step 8: Commit**

```bash
git add client/src/window/windowManagerReducer.js client/src/window/windowManagerReducer.test.js
git commit -m "$(cat <<'EOF'
feat(apps/client): open data-grid screens maximized

Quote History, RFQ Tracking, IFS Inventory and the other grids opened as
900px floating windows — 62% of a 1440px viewport — while their widest
table needs 3333px. The operator saw about a quarter of the columns and
scrolled sideways through the rest, with 38% of the screen empty behind
the window.

OPEN now consults opensMaximized(tabId) and starts those windows in the
'max' state, carrying the cascade rect as prevRect so Restore still has
somewhere to go. Calculators are unaffected.

Also stops the singleton re-focus path forcing state:'normal' — clicking
a sidebar item again should raise the window, not shrink a maximized one.
Minimized windows still come back to normal.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Give the taskbar a "close all" control

**Files:**

- Modify: `client/src/window/Taskbar.jsx`
- Modify: `client/src/window/WindowLayer.css` (append the button rule)

**Interfaces:**

- Consumes: `onCloseAll: () => void`, a new prop that `WindowLayer.jsx` supplies by dispatching one `CLOSE` per non-fixed window.
- Produces: nothing.

Six windows accumulated during a five-minute audit and none of them ever closed themselves. Without a bulk control the operator closes them one at a time or leaves them stacked forever.

- [x] **Step 1: Add the prop and the button**

In `client/src/window/Taskbar.jsx`, extend the signature on line 8 and render the control at the end of the strip:

```jsx
export default function Taskbar({ windows, focusedId, onFocus, onRestore, onCloseAll }) {
```

Immediately before the closing element of the taskbar strip:

```jsx
{
  windows.filter((w) => !w.fixed).length > 1 && (
    <button
      type="button"
      className="ops-taskbar__close-all"
      onClick={onCloseAll}
      title={t('window.close_all')}
      aria-label={t('window.close_all')}
    >
      {t('window.close_all')}
    </button>
  );
}
```

The control only appears once there is more than one closable window, so a single-window session gains no clutter. `t` comes from the same `useI18n()` hook `Window.jsx` already uses for `window.restore` / `window.maximize`.

- [x] **Step 2: Add the two i18n strings**

In `client/src/i18n/strings.js`, next to the existing `window.*` keys:

```js
  'window.close_all': { en: 'Close all', vi: 'Đóng tất cả' },
```

- [x] **Step 3: Wire it in WindowLayer**

In `client/src/window/WindowLayer.jsx`, pass a handler that closes every non-fixed window:

```jsx
        onCloseAll={() =>
          windows.filter((w) => !w.fixed).forEach((w) => dispatch({ type: A.CLOSE, payload: { id: w.id } }))
        }
```

Home is `fixed`, so it survives — the operator lands back on it.

- [x] **Step 4: Add the style**

Append to `client/src/window/WindowLayer.css`:

```css
/* Only shown when 2+ closable windows exist — see Taskbar.jsx. Sits at the
   trailing edge so it never moves as windows are added or removed. */
.ops-taskbar__close-all {
  margin-left: auto;
  padding: 2px 10px;
  font-size: 11px;
  border: 1px solid var(--color-slate-200, #e2e8f0);
  background: transparent;
  color: var(--color-slate-500, #64748b);
  cursor: pointer;
}

.ops-taskbar__close-all:hover {
  background: var(--color-slate-100, #f1f5f9);
  color: var(--color-slate-700, #334155);
}
```

- [x] **Step 5: Run the i18n lint test**

Run: `cd client && node --test src/i18n/strings.lint.test.js`
Expected: PASS. This suite enforces that every key has both locales — it is the reason i18n has not rotted the way the design tokens have.

- [x] **Step 6: Run the full client suite**

Run: `cd client && node --test 'src/**/*.test.js'`
Expected: PASS.

- [x] **Step 7: Verify in the running app**

With the dev client running (same temporary proxy edit as Task 2 Step 7): open four screens, confirm **Close all** appears in the taskbar, click it, and confirm every window closes except Home. Then open one screen and confirm the button is hidden again. Revert the proxy edit afterwards.

- [x] **Step 8: Commit**

```bash
git add client/src/window/Taskbar.jsx client/src/window/WindowLayer.jsx client/src/window/WindowLayer.css client/src/i18n/strings.js
git commit -m "$(cat <<'EOF'
feat(apps/client): add "Close all" to the window taskbar

Six windows accumulated during a five-minute walkthrough and none of
them ever closed themselves; the taskbar offered no way to clear them
short of closing each in turn. The control appears only once there are
two or more closable windows, and leaves Home standing because it is
the fixed base layer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage.** The audit's window finding has three measured parts: windows at 62% of viewport (Tasks 1–2), a 3333px table in a 898px frame (Tasks 1–2), and six windows accumulating with no bulk close (Task 3). All covered.

**Placeholder scan.** No TBD, no "handle edge cases", no "similar to Task N". Every code step carries the literal code.

**Type consistency.** `opensMaximized(tabId)` is defined in Task 1 and called in Task 2 with the same signature. Window `state` is only ever `'normal' | 'min' | 'max'`, matching the four occurrences already in the reducer. `onCloseAll` is declared in Task 3 Step 1 and supplied in Step 3.

**Known risk.** Task 2 Step 4 changes the singleton re-focus path from an unconditional `state: 'normal'` to a conditional one. That path is also what un-minimizes a window, so the fourth test in Task 2 Step 1 exists specifically to pin that behaviour. If a pre-existing reducer test asserts `'normal'` after re-focusing a maximized window, that test encodes the old bug — update it and say so in the commit.
