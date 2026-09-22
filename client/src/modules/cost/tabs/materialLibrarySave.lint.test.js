/**
 * Source-level guard for Material Cost's save-on-card flow.
 *
 * Adding a material used to take TWO clicks: Save on the card wrote the row
 * into this tab's own state, and a separate "Save Changes" chip posted the
 * three libraries. Now the card's Save persists on its own — which introduces
 * exactly one way to get it silently wrong.
 *
 * `setData` does not flush before the handler returns, so a save that reads
 * this component's state posts the arrays as they were BEFORE the edit: the
 * request succeeds, the chip clears, the screen shows the new row from local
 * state, and the row is not on the server. It comes back missing on the next
 * load, with nothing anywhere saying a save went wrong. That is why each
 * handler builds `next` and hands THAT to `saveNow`, and why `persist` spreads
 * the patch AFTER its own state so the caller's array wins.
 *
 * None of this is assertable at runtime here — the repo has no React testing
 * infrastructure, so logic inside a component cannot be driven. What CAN be
 * checked is the shape, and the shape is the whole risk.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, 'MaterialLibrary.jsx'), 'utf8');

const HANDLERS = ['handleAdd', 'handleEditSave', 'handleDelete'];

/**
 * Every `function <name>(...) { ... }` body in the file, brace-matched.
 *
 * The parameter list is skipped by matching PARENS first. Scanning for the
 * first `{` after the name finds the one in `persist(patch = {})` — a default
 * value, not the body — and returns an empty string, which reads exactly like
 * the product having lost its try/catch.
 */
function bodies(name) {
  const out = [];
  const needle = `function ${name}(`;
  let at = SRC.indexOf(needle);
  while (at !== -1) {
    let p = SRC.indexOf('(', at);
    let pd = 0;
    let afterParams = p;
    for (let j = p; j < SRC.length; j++) {
      if (SRC[j] === '(') pd++;
      else if (SRC[j] === ')') {
        pd--;
        if (pd === 0) {
          afterParams = j;
          break;
        }
      }
    }
    let i = SRC.indexOf('{', afterParams);
    let depth = 0;
    for (let j = i; j < SRC.length; j++) {
      if (SRC[j] === '{') depth++;
      else if (SRC[j] === '}') {
        depth--;
        if (depth === 0) {
          out.push(SRC.slice(i, j + 1));
          break;
        }
      }
    }
    at = SRC.indexOf(needle, at + needle.length);
  }
  return out;
}

test('all three tabs define the same three handlers', () => {
  for (const h of HANDLERS) {
    assert.equal(bodies(h).length, 3, `${h} should exist once per tab (NPI / IFS / Sourcing)`);
  }
});

for (const h of HANDLERS) {
  test(`${h}: saves the array it just built, not component state`, () => {
    for (const [i, body] of bodies(h).entries()) {
      const set = body.match(/setData\(([^)]*)\)/);
      const save = body.match(/saveNow\(([^)]*)\)/);
      assert.ok(set, `${h}#${i} must call setData`);
      assert.ok(save, `${h}#${i} must call saveNow — otherwise the card's Save does not persist`);
      assert.equal(
        save[1].trim(),
        set[1].trim(),
        `${h}#${i} must hand saveNow the SAME array it gave setData. Passing anything ` +
          'derived from state posts the pre-edit arrays: the request succeeds and the ' +
          'row is silently absent on the next load.'
      );
      assert.doesNotMatch(
        set[1],
        /=>/,
        `${h}#${i} must build the next array in a const so saveNow can be handed it; ` +
          'a functional updater leaves nothing to pass.'
      );
    }
  });
}

test('persist lets the caller patch win over this component state', () => {
  const [body] = bodies('persist');
  assert.ok(body, 'persist must exist');
  assert.match(
    body,
    /saveAll\(\{\s*npiDB,\s*ifsDB,\s*sourcingDB,\s*\.\.\.patch\s*\}\)/,
    'the patch must be spread LAST. Reversed, every handler silently saves ' +
      'the pre-edit arrays again and every other assertion here still passes.'
  );
});

test('the two-step save is gone and cannot grow back', () => {
  assert.doesNotMatch(
    SRC,
    /markDirty/,
    'markDirty marked the tab dirty and left persisting to the Save Changes chip; ' +
      'reintroducing it is how the second click comes back'
  );
  assert.match(SRC, /saveNow=\{\(rows\) => persist\(/, 'each tab must receive a saveNow prop');
});

test('a failed save keeps the Save Changes chip up as a retry', () => {
  const [body] = bodies('persist');
  const cat = body.indexOf('catch');
  assert.ok(cat > -1, 'persist must catch');
  assert.match(
    body.slice(cat),
    /setIsDirty\(true\)/,
    'on failure the edit is still in local state and nowhere else — the chip is ' +
      'the only way back, so it must be raised rather than left cleared'
  );
});

test('the clear-search button is on all three search boxes and restores focus', () => {
  const clears = SRC.match(/className="ml-hb-search-clear"/g) || [];
  assert.equal(clears.length, 3, 'NPI, IFS and Sourcing each need one');
  const focus = SRC.match(/searchRef\.current\?\.focus\(\)/g) || [];
  assert.equal(focus.length, 3, 'clearing means "start over", so the caret goes back in the box');
  assert.equal(
    (SRC.match(/aria-label=\{t\('matlib\.search_clear'\)\}/g) || []).length,
    3,
    'an icon-only button needs a name'
  );
});

// ── row context menu ────────────────────────────────────────────────

test('the row menu is written ONCE and used by all three tabs', () => {
  assert.equal(
    (SRC.match(/^function RowContextMenu\(/gm) || []).length,
    1,
    'the three tabs are already near-duplicates (MES-3-FIX-56); a menu written ' +
      'per tab is three places for Open / Copy / Delete to drift apart'
  );
  assert.equal(
    // The trailing class is load-bearing: without it <RowContextMenuNPI>
    // still matches, so a per-tab fork would pass this very assertion.
    (SRC.match(/<RowContextMenu[\s/>]/g) || []).length,
    3,
    'NPI, IFS and Sourcing each render it'
  );
});

test('Copy pre-fills the Add modal and does NOT save on its own', () => {
  // This is the invariant the save-on-card change created. handleAdd now
  // persists, so a Copy routed through it would put a second row under a
  // near-identical name on the server before anyone had looked at it.
  const copies = SRC.match(/label: t\('matlib\.ctx_copy'\),[\s\S]{0,400}?\n {12}\},/g) || [];
  assert.equal(copies.length, 3, 'each tab copies through copySeed into the Add modal');
  for (const c of copies) {
    assert.match(c, /setAddMode\(/, 'Copy opens the Add modal');
    assert.doesNotMatch(c, /handleAdd|saveNow/, 'Copy must not write to the server');
  }
});

test('Delete goes through the handler that confirms first', () => {
  const dels =
    SRC.match(/label: t\('matlib\.ctx_delete'\),[\s\S]{0,140}?run: \(\) => ([^,\n]+)/g) || [];
  assert.equal(dels.length, 3, 'one Delete item per tab');
  for (const d of dels) {
    assert.match(
      d,
      /handleDelete\(ctx\.idx\)/,
      'Delete must reuse handleDelete — it owns the confirm() and the save, and a ' +
        'second deletion path would be free to skip either'
    );
  }
});

test('a view-only row shows the browser menu, not ours', () => {
  assert.equal(
    (SRC.match(/if \(isViewOnly\) return;\s*\n\s*e\.preventDefault\(\);/g) || []).length,
    3,
    'those rows cannot be opened by left-click either, so the menu must not ' +
      'hand them a capability they do not have'
  );
});
