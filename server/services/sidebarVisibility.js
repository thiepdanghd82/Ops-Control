// @ts-check
/**
 * sidebarVisibility — global SYS-controlled show/hide store for the main
 * sidebar (Sprint S-SYSCTRL, "lean mode").
 *
 * HIDE-ONLY: the CLIENT AND-s these hidden sets AFTER the existing minRole +
 * permission-group `access()` gates, so un-hiding a tab NEVER widens access.
 * This module only persists + validates the SYS-chosen hidden ids.
 *
 * Persisted at `<LIB_DIR>/System/sidebar_visibility.json`:
 *   { hiddenTabs: string[], hiddenSections: string[], _updated_at, _updated_by }
 * Missing file → treated as nothing hidden.
 *
 * Valid ids MIRROR the client sidebar catalog
 * (client/src/components/Layout/sidebarSections.js). `sidebarVisibility.drift.test.js`
 * fails if they diverge. The `system` section + its tabs are NOT toggleable —
 * Settings / System Control must always stay reachable.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getLibDir } from './authService.js';
import { atomicWriteFileSync } from './atomicWrite.js';

// Mirror of allToggleableTabs() / toggleableSections() in the client catalog
// (System section excluded). Guarded against drift by sidebarVisibility.drift.test.js.
export const TOGGLEABLE_SECTION_IDS = Object.freeze([
  'calculators',
  'quoting',
  'manufacturing',
  'tracking',
  'reports',
  'libraries',
  'production',
  'scheduling',
  'planning-tracking',
]);

export const TOGGLEABLE_TAB_IDS = Object.freeze([
  'standard',
  'complex',
  'lib-mat',
  'ink-calc',
  'print-area',
  'design-tools',
  'messages',
  'summarize',
  'formal-quote',
  'quote-history',
  'npi-parts-list',
  'rfq-tracking',
  'approvals-inbox',
  'lib-mfg',
  'lib-rop',
  'lib-inventory',
  'rfq-tracker',
  'sample-tracking',
  'dashboard',
  'quote-analysis',
  'lib-rate',
  'lib-ddl',
  'lib-finance',
  'lib-machine-tech',
  'order-entry',
  'bom-explosion',
  'material-check',
  'capacity',
  'work-orders',
  'wip-tracker',
]);

const SECTION_SET = new Set(TOGGLEABLE_SECTION_IDS);
const TAB_SET = new Set(TOGGLEABLE_TAB_IDS);

function filePath() {
  return path.join(getLibDir(), 'System', 'sidebar_visibility.json');
}

/**
 * Read the persisted hidden map. Tolerant of a missing/corrupt file →
 * `{ hiddenTabs: [], hiddenSections: [] }`. Filters to known string ids so a
 * hand-edited file can never inject junk into the client.
 */
export function readSidebarVisibility() {
  try {
    const j = JSON.parse(fs.readFileSync(filePath(), 'utf-8'));
    const clean = (arr, set) =>
      Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && set.has(x)) : [];
    return {
      hiddenTabs: clean(j.hiddenTabs, TAB_SET),
      hiddenSections: clean(j.hiddenSections, SECTION_SET),
    };
  } catch {
    return { hiddenTabs: [], hiddenSections: [] };
  }
}

/**
 * Validate + normalize a PUT payload. Rejects non-arrays and any id that is
 * not a known TOGGLEABLE id (unknown, or an always-on id like `settings` /
 * the `system` section). Returns `{ ok, value }` or `{ ok:false, error }`.
 */
export function validateVisibilityPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'body must be an object' };
  }
  const { hiddenTabs, hiddenSections } = body;
  if (!Array.isArray(hiddenTabs) || !Array.isArray(hiddenSections)) {
    return { ok: false, error: 'hiddenTabs and hiddenSections must be arrays' };
  }
  for (const id of hiddenTabs) {
    if (typeof id !== 'string' || !TAB_SET.has(id)) {
      return { ok: false, error: `unknown or non-toggleable tab id: ${JSON.stringify(id)}` };
    }
  }
  for (const id of hiddenSections) {
    if (typeof id !== 'string' || !SECTION_SET.has(id)) {
      return { ok: false, error: `unknown or non-toggleable section id: ${JSON.stringify(id)}` };
    }
  }
  return {
    ok: true,
    value: {
      hiddenTabs: [...new Set(hiddenTabs)],
      hiddenSections: [...new Set(hiddenSections)],
    },
  };
}

/** Persist a validated map (atomic write). Returns the stored record. */
export function writeSidebarVisibility(value, userId) {
  const fp = filePath();
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const record = {
    hiddenTabs: value.hiddenTabs,
    hiddenSections: value.hiddenSections,
    _updated_at: new Date().toISOString(),
    _updated_by: userId ?? null,
  };
  atomicWriteFileSync(fp, JSON.stringify(record, null, 2));
  return record;
}
