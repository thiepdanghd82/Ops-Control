/**
 * Preload bridge contract tests.
 *
 * Phase 0.2 of CI Green Sprint (2026-06-20). Pin the contract that
 * `desktop/preload.js` exposes EXACTLY one `license:` object bridge
 * with the 4 documented IPC channels. ESLint caught a `no-dupe-keys`
 * error: two `license:` literals (line 54 partial 2-method stub from
 * feat/license-manager-tab WIP + line 149 complete 4-method bridge
 * from S-DIAG-FIX 2026-05-05). JS object-literal semantics = later
 * key wins, so 4-method WAS reaching renderer at runtime by luck —
 * but reordering the file would silently break License Manager.
 *
 * Test approach is text-based, not runtime-based, BECAUSE:
 * (a) preload.js uses `require('electron')` which throws outside
 *     the Electron renderer context — can't `require()` in node:test.
 * (b) The duplicate-key bug is INVISIBLE at the runtime-object layer
 *     (later-wins masks it). Only static analysis (ESLint OR text
 *     parsing) catches it. ESLint at lint job + this test at unit
 *     job = two-layer defense.
 *
 * Doesn't import desktop/preload.js — mirrors license.test.js pattern.
 * Run with: node --test desktop/preload.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const PRELOAD_SRC = readFileSync(join(__dirname, 'preload.js'), 'utf8');

test('preload.js declares EXACTLY ONE license: object literal (no duplicate-key fragility)', () => {
  // Match `  license: {` at the start of a line — the indentation pins
  // it to module-level object property, not nested inside another key.
  // Trailing space tolerated; the colon + brace anchors the structure.
  const matches = PRELOAD_SRC.match(/^ {2}license:\s*\{/gm);
  const count = matches ? matches.length : 0;
  assert.equal(
    count,
    1,
    `desktop/preload.js must declare exactly one \`license:\` object literal, found ${count}.\n` +
      `JS object-literal duplicate keys silently overwrite (later wins). Even if runtime ` +
      `currently works, reordering the file would silently drop License Manager methods.\n` +
      `Fix: keep the complete 4-method block, delete any earlier partial stub.`
  );
});

test('preload.js license bridge exposes exactly the 4 documented methods', () => {
  // The block from S-DIAG-FIX 2026-05-05 (preload.js:142-154) is the
  // intentional surface — 4 explicit handles (no generic invoke
  // passthrough) keeps the attack surface bounded. If any of these
  // 4 channels disappears, License Manager + About / Diagnostics
  // break (`window.ops.license.<x> is not a function`).
  const channels = [
    "status: () => ipcRenderer.invoke('ops:license.status')",
    "fingerprint: () => ipcRenderer.invoke('ops:license.fingerprint')",
    "apply: (lic) => ipcRenderer.invoke('ops:license.apply', lic)",
    "tiers: () => ipcRenderer.invoke('ops:license.tiers')",
  ];
  for (const ch of channels) {
    assert.ok(
      PRELOAD_SRC.includes(ch),
      `preload.js missing license bridge method: \`${ch}\`.\n` +
        `Renderer call \`window.ops.license.<name>()\` will throw at runtime.`
    );
  }
});

test('preload.js license bridge does NOT silently regress to the old 2-method stub', () => {
  // The OLDER partial block (pre-S-DIAG-FIX) used the local invoke()
  // helper and only exposed status + fingerprint. If a future commit
  // reintroduces that shape (via merge, copy-paste, or stale extraction),
  // this test catches it before runtime breaks the License Manager tab.
  const stalePattern = "status: () => invoke('ops:license.status')";
  assert.ok(
    !PRELOAD_SRC.includes(stalePattern),
    `preload.js contains the deprecated 2-method license stub using local invoke() helper.\n` +
      `The canonical 4-method bridge uses ipcRenderer.invoke directly (S-DIAG-FIX 2026-05-05).`
  );
});
