/**
 * sidebarSections — catalog helpers + applySidebarVisibility (hide-only,
 * SYS-bypass, never-widen, always-on) pure logic.
 *   node --test client/src/components/Layout/sidebarSections.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COST_SECTIONS,
  applySidebarVisibility,
  toggleableSections,
  allToggleableTabs,
  TOGGLEABLE_TAB_IDS,
  TOGGLEABLE_SECTION_IDS,
} from './sidebarSections.js';

// Small fixture mirroring the catalog shape (one always-on section).
const FIX = [
  {
    id: 'quoting',
    tabs: [{ id: 'summarize' }, { id: 'rfq-tracking' }, { id: 'dashboard', minRole: 'user' }],
  },
  {
    id: 'tracking',
    tabs: [{ id: 'rfq-tracker' }, { id: 'sample-tracking' }],
  },
  {
    id: 'system',
    alwaysOn: true,
    tabs: [{ id: 'settings' }, { id: 'help' }],
  },
];
const ids = (secs) => secs.map((s) => ({ id: s.id, tabs: s.tabs.map((t) => t.id) }));

// ── Catalog helpers ───────────────────────────────────────────────
test('toggleableSections excludes the always-on system section', () => {
  const t = toggleableSections();
  assert.equal(
    t.some((s) => s.id === 'system'),
    false,
    'system excluded'
  );
  assert.ok(t.some((s) => s.id === 'quoting'));
});

test('always-on tabs (settings) are NOT in the toggleable tab list', () => {
  assert.equal(TOGGLEABLE_TAB_IDS.includes('settings'), false);
  assert.equal(TOGGLEABLE_TAB_IDS.includes('rfq-tracking'), true);
  assert.equal(TOGGLEABLE_SECTION_IDS.includes('system'), false);
  // Flat helper annotates each tab with its section id.
  assert.equal(allToggleableTabs().find((t) => t.id === 'rfq-tracking').sectionId, 'quoting');
});

// ── applySidebarVisibility ────────────────────────────────────────
test('hides a tab for non-sys', () => {
  const out = applySidebarVisibility(FIX, { hiddenTabs: ['rfq-tracking'], role: 'user' });
  const quoting = out.find((s) => s.id === 'quoting');
  assert.equal(
    quoting.tabs.some((t) => t.id === 'rfq-tracking'),
    false,
    'hidden for user'
  );
  assert.equal(
    quoting.tabs.some((t) => t.id === 'summarize'),
    true,
    'siblings kept'
  );
});

test('SYS bypass keeps a hidden tab, annotated _globallyHidden', () => {
  const out = applySidebarVisibility(FIX, { hiddenTabs: ['rfq-tracking'], role: 'sys' });
  const tab = out.find((s) => s.id === 'quoting').tabs.find((t) => t.id === 'rfq-tracking');
  assert.ok(tab, 'SYS still sees it');
  assert.equal(tab._globallyHidden, true, 'annotated for the muted badge');
  const other = out.find((s) => s.id === 'quoting').tabs.find((t) => t.id === 'summarize');
  assert.equal(other._globallyHidden, false, 'non-hidden tab flag false');
});

test('hidden section removed for non-sys; SYS keeps it flagged', () => {
  const user = applySidebarVisibility(FIX, { hiddenSections: ['tracking'], role: 'user' });
  assert.equal(
    user.some((s) => s.id === 'tracking'),
    false,
    'section gone for user'
  );
  const sys = applySidebarVisibility(FIX, { hiddenSections: ['tracking'], role: 'sys' });
  const trk = sys.find((s) => s.id === 'tracking');
  assert.ok(trk, 'SYS keeps the section');
  assert.equal(trk._globallyHidden, true);
  assert.ok(
    trk.tabs.every((t) => t._globallyHidden),
    'its tabs flagged hidden too'
  );
});

test('NEVER WIDENS — a baseAllows-rejected tab stays gone regardless of hidden state', () => {
  // dashboard rejected by baseAllows (e.g. minRole). Not in hiddenTabs.
  const baseAllows = (tab) => tab.id !== 'dashboard';
  const shown = applySidebarVisibility(FIX, { hiddenTabs: [], role: 'sys', baseAllows });
  assert.equal(
    shown.find((s) => s.id === 'quoting').tabs.some((t) => t.id === 'dashboard'),
    false,
    'even SYS with nothing hidden cannot see a base-denied tab'
  );
  // Un-hiding never brings it back.
  const unhidden = applySidebarVisibility(FIX, {
    hiddenTabs: [],
    hiddenSections: [],
    role: 'user',
    baseAllows,
  });
  assert.equal(
    unhidden.find((s) => s.id === 'quoting').tabs.some((t) => t.id === 'dashboard'),
    false
  );
});

test('ALWAYS-ON — system section + its tabs are never hidden', () => {
  const out = applySidebarVisibility(FIX, {
    hiddenSections: ['system'],
    hiddenTabs: ['settings', 'help'],
    role: 'user',
  });
  const sys = out.find((s) => s.id === 'system');
  assert.ok(sys, 'system section still present for a plain user');
  assert.deepEqual(
    sys.tabs.map((t) => t.id),
    ['settings', 'help'],
    'settings + help never hidden'
  );
  assert.equal(sys._globallyHidden, false);
});

test('section with all tabs hidden collapses away for non-sys', () => {
  const out = applySidebarVisibility(FIX, {
    hiddenTabs: ['rfq-tracker', 'sample-tracking'],
    role: 'user',
  });
  assert.equal(
    out.some((s) => s.id === 'tracking'),
    false,
    'empty section dropped'
  );
});

test('nothing hidden → same section/tab structure (byte-safe passthrough)', () => {
  const out = applySidebarVisibility(FIX, { role: 'user' });
  assert.deepEqual(ids(out), ids(FIX));
});

test('real COST_SECTIONS: hiding quoting removes it for user, kept for sys', () => {
  const user = applySidebarVisibility(COST_SECTIONS, {
    hiddenSections: ['quoting'],
    role: 'user',
    baseAllows: () => true,
  });
  assert.equal(
    user.some((s) => s.id === 'quoting'),
    false
  );
  // system always present
  assert.ok(user.some((s) => s.id === 'system'));
});
