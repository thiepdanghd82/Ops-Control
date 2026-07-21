/**
 * drawingFiles — pure list/active/mirror + open-action tests.
 *   node --test client/src/services/drawingFiles.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampActive,
  mirrorActive,
  appendDrawing,
  removeDrawingAt,
  targetFileAt,
  buildDrawingPatch,
  healDrawingKind,
  healDrawings,
  resolveOpenAction,
  stripDataUrl,
  lightenList,
  stripDrawingBytesFromState,
  stripDrawingBytesDeep,
} from './drawingFiles.js';

const F = (n) => ({ name: `${n}.png`, type: 'image/png', dataUrl: `data:image/png;base64,${n}` });
const L = (n) => ({ name: `${n}.png`, type: 'image/png' }); // light (no dataUrl)
const hasBytes = (o) => o && Object.prototype.hasOwnProperty.call(o, 'dataUrl');

// ── clamp / mirror ────────────────────────────────────────────────
test('clampActive keeps index in range; 0 for empty/invalid', () => {
  assert.equal(clampActive([F('a'), F('b')], 1), 1);
  assert.equal(clampActive([F('a'), F('b')], 5), 1, 'past end → last');
  assert.equal(clampActive([F('a'), F('b')], -3), 0, 'negative → 0');
  assert.equal(clampActive([], 2), 0, 'empty → 0');
  assert.equal(clampActive([F('a')], NaN), 0, 'NaN → 0');
});

test('mirrorActive returns the active file or null', () => {
  const list = [F('a'), F('b'), F('c')];
  assert.equal(mirrorActive(list, 2).name, 'c.png');
  assert.equal(mirrorActive(list, 9).name, 'c.png', 'clamped');
  assert.equal(mirrorActive([], 0), null);
  assert.equal(mirrorActive(null, 0), null);
});

// ── append / remove ───────────────────────────────────────────────
test('appendDrawing adds, never replaces; ignores non-objects', () => {
  const one = appendDrawing([], F('a'));
  assert.equal(one.length, 1);
  const two = appendDrawing(one, F('b'));
  assert.deepEqual(
    two.map((f) => f.name),
    ['a.png', 'b.png']
  );
  assert.equal(appendDrawing(two, null), two, 'null ignored (same ref)');
  assert.equal(appendDrawing(undefined, F('x')).length, 1, 'undefined list tolerated');
});

test('removeDrawingAt re-points active correctly', () => {
  const list = [F('a'), F('b'), F('c')];
  // remove the ACTIVE (idx 1) → first remaining (0)
  let r = removeDrawingAt(list, 1, 1);
  assert.deepEqual(
    r.files.map((f) => f.name),
    ['a.png', 'c.png']
  );
  assert.equal(r.active, 0, 'removed active → first remaining');
  // remove BEFORE active → active shifts left
  r = removeDrawingAt(list, 2, 0);
  assert.deepEqual(
    r.files.map((f) => f.name),
    ['b.png', 'c.png']
  );
  assert.equal(r.active, 1, 'active 2 → 1 after earlier removal');
  // remove AFTER active → active unchanged
  r = removeDrawingAt(list, 0, 2);
  assert.equal(r.active, 0);
  // remove last remaining → empty, active 0
  r = removeDrawingAt([F('a')], 0, 0);
  assert.deepEqual(r.files, []);
  assert.equal(r.active, 0);
  // out-of-range idx → no change
  r = removeDrawingAt(list, 1, 9);
  assert.equal(r.files.length, 3);
  assert.equal(r.active, 1);
});

test('targetFileAt returns THAT file, null out of range', () => {
  const list = [F('a'), F('b')];
  assert.equal(targetFileAt(list, 0).name, 'a.png');
  assert.equal(targetFileAt(list, 1).name, 'b.png');
  assert.equal(targetFileAt(list, 2), null);
  assert.equal(targetFileAt(list, -1), null);
  assert.equal(targetFileAt(null, 0), null);
});

// ── buildDrawingPatch (list + active + mirror) ────────────────────
test('buildDrawingPatch sets list, active, and singular mirror (and lightens)', () => {
  const list = [F('a'), F('b')];
  const patch = buildDrawingPatch('layout', list, 1);
  assert.equal(patch.layout_files.length, 2);
  assert.equal(hasBytes(patch.layout_files[0]), false, 'dataUrl stripped from list');
  assert.equal(hasBytes(patch.layout_file), false, 'dataUrl stripped from mirror');
  assert.equal(patch.layout_active, 1);
  assert.equal(patch.layout_file.name, 'b.png', 'singular mirrors active');
  // already-light input keeps the same array ref (no needless clone)
  const light = [L('a'), L('b')];
  assert.equal(buildDrawingPatch('layout', light, 0).layout_files, light);

  const cust = buildDrawingPatch('customer_drw', [F('x')], 0);
  assert.equal(cust.customer_drw_files.length, 1);
  assert.equal(cust.customer_drw_active, 0);
  assert.equal(cust.customer_drw_file.name, 'x.png');

  const empty = buildDrawingPatch('layout', [], 0);
  assert.deepEqual(empty.layout_files, []);
  assert.equal(empty.layout_file, null, 'empty list → null mirror');

  assert.deepEqual(buildDrawingPatch('bogus', [], 0), {}, 'unknown kind → {}');
});

// ── heal-on-read ──────────────────────────────────────────────────
test('healDrawingKind wraps a legacy single file into [file] active 0', () => {
  const legacy = { layout_file: F('old') };
  const healed = healDrawingKind(legacy, 'layout');
  assert.equal(healed.layout_files.length, 1);
  assert.equal(healed.layout_files[0].name, 'old.png');
  assert.equal(healed.layout_active, 0);
  assert.equal(healed.layout_file.name, 'old.png', 'singular preserved as mirror');
});

test('healDrawingKind re-mirrors singular from an existing list', () => {
  const s = { layout_files: [F('a'), F('b')], layout_active: 1, layout_file: F('stale') };
  const healed = healDrawingKind(s, 'layout');
  assert.equal(healed.layout_file.name, 'b.png', 'singular re-mirrored to active');
});

test('healDrawingKind: no file at all → empty list, null singular', () => {
  const healed = healDrawingKind({}, 'layout');
  assert.deepEqual(healed.layout_files, []);
  assert.equal(healed.layout_active, 0);
  assert.equal(healed.layout_file, null);
});

test('healDrawings is idempotent (same ref on second run)', () => {
  const legacy = { layout_file: F('a'), customer_drw_file: F('b') };
  const once = healDrawings(legacy);
  const twice = healDrawings(once);
  assert.equal(twice, once, 'second heal returns the same reference');
  assert.equal(once.layout_files[0].name, 'a.png');
  assert.equal(once.customer_drw_files[0].name, 'b.png');
});

test('healDrawings idempotent for an already-current state', () => {
  const cur = {
    layout_files: [F('a')],
    layout_active: 0,
    layout_file: null, // will be re-mirrored on first heal
    customer_drw_files: [],
    customer_drw_active: 0,
    customer_drw_file: null,
  };
  const h1 = healDrawings(cur);
  const h2 = healDrawings(h1);
  assert.equal(h2, h1);
  assert.equal(h1.layout_file.name, 'a.png');
});

test('healDrawings preserves unrelated fields', () => {
  const s = { moq: 500, layout_file: F('a'), other: { x: 1 } };
  const h = healDrawings(s);
  assert.equal(h.moq, 500);
  assert.equal(h.other.x, 1);
});

test('healDrawings strips inline base64 → {name,type} (legacy inline quote)', () => {
  const legacy = { layout_files: [F('a'), F('b')], layout_active: 0, layout_file: F('a') };
  const h = healDrawings(legacy);
  assert.equal(hasBytes(h.layout_files[0]), false, 'list item lightened');
  assert.equal(hasBytes(h.layout_files[1]), false);
  assert.equal(hasBytes(h.layout_file), false, 'mirror lightened');
  assert.equal(h.layout_files[0].name, 'a.png', 'name kept');
  assert.equal(h.layout_files[0].type, 'image/png', 'type kept');
});

// ── stripDataUrl / lightenList / state strip ──────────────────────
test('stripDataUrl drops dataUrl; ref-stable when already light', () => {
  const stripped = stripDataUrl(F('a'));
  assert.equal(hasBytes(stripped), false);
  assert.equal(stripped.name, 'a.png');
  const light = L('a');
  assert.equal(stripDataUrl(light), light, 'already-light → same ref');
});

test('lightenList strips each; same ref when nothing to strip', () => {
  const heavy = [F('a'), F('b')];
  const out = lightenList(heavy);
  assert.notEqual(out, heavy);
  assert.ok(out.every((f) => !hasBytes(f)));
  const light = [L('a')];
  assert.equal(lightenList(light), light, 'already-light → same ref');
});

test('stripDrawingBytesFromState lightens both kinds; ref-stable when light', () => {
  const state = {
    moq: 500,
    layout_files: [F('a'), F('b')],
    layout_file: F('a'),
    customer_drw_files: [F('c')],
    customer_drw_file: F('c'),
  };
  const out = stripDrawingBytesFromState(state);
  assert.ok(
    out.layout_files.every((f) => !hasBytes(f)),
    'layout lightened'
  );
  assert.ok(
    out.customer_drw_files.every((f) => !hasBytes(f)),
    'customer lightened'
  );
  assert.equal(hasBytes(out.layout_file), false);
  assert.equal(hasBytes(out.customer_drw_file), false);
  assert.equal(out.moq, 500, 'unrelated field preserved');
  // Serialized state carries NO base64 at all.
  assert.equal(/base64/.test(JSON.stringify(out)), false, 'no base64 in persisted JSON');
  // Already-light state → same ref (no needless clone).
  const light = stripDrawingBytesFromState(out);
  assert.equal(light, out);
});

test('stripDrawingBytesDeep lightens per-subproduct (Cpx) + top-level', () => {
  const cpx = {
    layout_files: [F('cover')],
    layout_file: F('cover'),
    subproducts: [
      { code: 'A', layout_files: [F('a1'), F('a2')], layout_file: F('a1') },
      { code: 'B', customer_drw_files: [F('b1')], customer_drw_file: F('b1') },
    ],
  };
  const out = stripDrawingBytesDeep(cpx);
  assert.equal(/base64/.test(JSON.stringify(out)), false, 'no base64 anywhere in Cpx state');
  assert.equal(out.subproducts[0].layout_files[0].name, 'a1.png', 'names preserved');
  assert.equal(out.subproducts[1].customer_drw_files[0].name, 'b1.png');
  // Std-shaped state (no subproducts) still lightens top-level.
  const std = stripDrawingBytesDeep({ layout_files: [F('x')], layout_file: F('x') });
  assert.equal(/base64/.test(JSON.stringify(std)), false);
});

test('5 attachments serialize well under 2 MB with names only', () => {
  // Simulate 5 large drawings (~600 KB base64 each) attached to a quote.
  const big = (n) => ({
    name: `drw_${n}.png`,
    type: 'image/png',
    dataUrl: 'data:image/png;base64,' + 'A'.repeat(600 * 1024),
  });
  const state = {
    layout_files: [big(1), big(2), big(3)],
    layout_file: big(1),
    customer_drw_files: [big(4), big(5)],
    customer_drw_file: big(4),
  };
  const heavyBytes = JSON.stringify(state).length;
  assert.ok(heavyBytes > 2 * 1024 * 1024, `precondition: heavy state is ${heavyBytes}B (> 2MB)`);
  const light = stripDrawingBytesDeep(state);
  const lightBytes = JSON.stringify(light).length;
  assert.ok(lightBytes < 2 * 1024 * 1024, `persisted state ${lightBytes}B well under 2MB`);
  assert.ok(lightBytes < 4096, 'light state is tiny (names only)');
  // Names + active pointer survive for re-fetch by name.
  assert.equal(light.layout_files.length, 3);
  assert.equal(light.layout_files[0].name, 'drw_1.png');
});

// ── resolveOpenAction (both branches) ─────────────────────────────
test('resolveOpenAction: desktop bridge branch', () => {
  const a = resolveOpenAction(F('a'), true);
  assert.equal(a.mode, 'bridge');
  assert.equal(a.b64, 'a'); // base64 payload after the comma
  assert.equal(a.ext, '.png');
  const pdf = resolveOpenAction(
    { name: 'd.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,ZZ' },
    true
  );
  assert.equal(pdf.ext, '.pdf');
});

test('resolveOpenAction: window branch when no bridge', () => {
  assert.deepEqual(resolveOpenAction(F('a'), false), { mode: 'window' });
});

test('resolveOpenAction: none for missing/invalid dataUrl', () => {
  assert.deepEqual(resolveOpenAction(null, true), { mode: 'none' });
  assert.deepEqual(resolveOpenAction({ name: 'x' }, true), { mode: 'none' });
  assert.deepEqual(resolveOpenAction({ dataUrl: 'not-a-data-url' }, false), { mode: 'none' });
});
