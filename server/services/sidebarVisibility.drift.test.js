/**
 * Drift guard — the server's TOGGLEABLE_* id sets MUST mirror the client
 * sidebar catalog (client/src/components/Layout/sidebarSections.js). If a tab
 * or section is added/removed/renamed in the sidebar, this fails until the
 * server allowlist is updated — so the PUT validation can never silently
 * reject a real id or accept a stale one.
 *
 *   node --test server/services/sidebarVisibility.drift.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOGGLEABLE_TAB_IDS, TOGGLEABLE_SECTION_IDS } from './sidebarVisibility.js';
import {
  allToggleableTabs,
  toggleableSections,
} from '../../client/src/components/Layout/sidebarSections.js';

const sorted = (a) => [...a].sort();

test('server TOGGLEABLE_TAB_IDS matches the client catalog', () => {
  const client = allToggleableTabs().map((t) => t.id);
  assert.deepEqual(sorted(TOGGLEABLE_TAB_IDS), sorted(client), 'tab id sets must match');
  // No duplicates on the server side.
  assert.equal(new Set(TOGGLEABLE_TAB_IDS).size, TOGGLEABLE_TAB_IDS.length, 'no dup tab ids');
});

test('server TOGGLEABLE_SECTION_IDS matches the client catalog', () => {
  const client = toggleableSections().map((s) => s.id);
  assert.deepEqual(sorted(TOGGLEABLE_SECTION_IDS), sorted(client), 'section id sets must match');
  assert.equal(new Set(TOGGLEABLE_SECTION_IDS).size, TOGGLEABLE_SECTION_IDS.length, 'no dup');
});

test("always-on 'system' + 'settings' are NOT toggleable server-side", () => {
  assert.equal(TOGGLEABLE_SECTION_IDS.includes('system'), false);
  assert.equal(TOGGLEABLE_TAB_IDS.includes('settings'), false);
});
