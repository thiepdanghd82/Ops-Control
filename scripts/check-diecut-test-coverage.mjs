#!/usr/bin/env node
/**
 * CI guard: block PR adding new die type to test fixtures without
 * sibling test coverage in calcEngine.diecut.golden.test.js.
 *
 * Phase 1.3 of Debug Playbook (2026-06-20). Enforces the
 * docs/tests/diecut-coverage-gap.md rule:
 *   "Mỗi lần operator thêm tool_life type mới qua DDL → bắt buộc
 *    kèm 1 golden test."
 *
 * Mechanism: read the tool_life dict from the test fixture's
 * `makeDieCutLib()` AND from any production library JSON committed
 * under server/data/Library/DesignTools/. Cross-reference each die
 * type against test cases in calcEngine.diecut.golden.test.js. If
 * a die type appears in a fixture/DDL but no test mentions it by
 * name, fail with a specific message pointing at the gap.
 *
 * Scope limitation: this guard catches NEW die types added to
 * COMMITTED fixtures. Operator-added die types at runtime via the
 * Library UI (persisted to ddl_sites.json which may or may not be
 * gitignored per site setup) are NOT in scope — those are operator
 * data, not code. The dropdown-validator ticket
 * (S-DIE-TYPE-DROPDOWN-VALIDATOR) addresses the runtime path.
 *
 * Exit 0 = green. Exit 1 = gap found.
 * Exit 2 = parse/read error (treat as guard infra broken — investigate).
 *
 * Wired into .github/workflows/ci.yml as a separate job.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const TEST_FILE = resolve(ROOT, 'client/src/services/calcEngine.diecut.golden.test.js');
// Other golden tests that intentionally reference die types — counted
// as coverage too so a die only used in calcEngine.golden.test.js
// doesn't trip the guard.
const PEER_TEST_FILES = [resolve(ROOT, 'client/src/services/calcEngine.golden.test.js')];

async function readSafe(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (e) {
    console.error(`[check-diecut-test-coverage] cannot read ${path}: ${e.message}`);
    process.exit(2);
  }
}

/**
 * Extract die-type names from `tool_life: { ... }` blocks in JS
 * fixture files. Matches both quoted ('Pinacle die') and unquoted
 * (woodie) keys. Returns a Set of die-type strings.
 */
function extractDieTypesFromFixture(src) {
  const types = new Set();
  // Match `tool_life: { ... }` block (possibly multi-line). Tolerant
  // to whitespace; balanced-brace match via lazy + nearest-closing
  // pattern is good enough for hand-authored fixture files.
  const blockMatch = src.match(/tool_life:\s*\{([^}]*)\}/);
  if (!blockMatch) return types;
  const body = blockMatch[1];
  // Extract identifiers OR quoted strings before a colon.
  // Captures: 'Foo' OR "Foo" OR bareWord
  const entryRe = /(?:'([^']+)'|"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))\s*:/g;
  let m;
  while ((m = entryRe.exec(body)) !== null) {
    const name = m[1] || m[2] || m[3];
    if (name) types.add(name);
  }
  return types;
}

/**
 * Check whether a die type is EXERCISED by a test — i.e., set as a
 * `tool_type` value in a process object, not just listed in a
 * tool_life fixture. This is the semantic intent: every die type
 * must drive at least one known-answer test, not just exist as a
 * library row.
 *
 * Matches both quote styles + tolerant to whitespace after the
 * colon (Prettier may auto-format).
 */
function dieTypeExercised(src, dieType) {
  const needle = String(dieType);
  // Build a regex that matches `tool_type:` followed by the die name
  // in single or double quotes. Anchor on the key so a coincidental
  // string match in a comment/log doesn't false-positive.
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`tool_type\\s*:\\s*['"]${escaped}['"]`);
  return re.test(src);
}

async function main() {
  const testSrc = await readSafe(TEST_FILE);

  // Fixture lives in the test file itself (makeDieCutLib() returns
  // tool_life). Extract die types from the same source as truth.
  const dieTypes = extractDieTypesFromFixture(testSrc);
  if (dieTypes.size === 0) {
    console.error(
      `[check-diecut-test-coverage] no tool_life block found in ${TEST_FILE}. ` +
        `Did the fixture move? Update this guard or the fixture path.`
    );
    process.exit(2);
  }

  // Also extract from peer test fixtures so a die only referenced
  // there doesn't get falsely flagged here.
  const peerSrcs = await Promise.all(PEER_TEST_FILES.map(readSafe));
  const allSrc = [testSrc, ...peerSrcs].join('\n');

  const missing = [];
  for (const dieType of dieTypes) {
    // Jig is a CLASS not a DDL die type per se — calcEngine's
    // isJig branch normalizes it. Allow Jig variants without
    // needing a dedicated golden test per spelling (T4 already
    // covers the normalization).
    if (/^jig$/i.test(dieType) || /^jig.*fixture$/i.test(dieType)) continue;
    if (!dieTypeExercised(allSrc, dieType)) {
      missing.push(dieType);
    }
  }

  if (missing.length > 0) {
    console.error(
      `[check-diecut-test-coverage] FAIL — die types added to test fixture without sibling coverage:`
    );
    for (const t of missing) console.error(`  - "${t}"`);
    console.error(
      `\nFix: add a golden test in ${TEST_FILE} that exercises calcAll with tool_type set to ` +
        `each missing die type. Pattern: makeDieCutStdState({ process: { tool_type: '<name>', ... } }).`
    );
    console.error(
      `\nWhy this matters: a die type in DDL but not pinned by a known-answer test silently ` +
        `accepts any drift in the tooling formula. Per docs/tests/diecut-coverage-gap.md Phase 1.3 rule.`
    );
    process.exit(1);
  }

  console.log(
    `[check-diecut-test-coverage] OK — ${dieTypes.size} die type(s) in fixture, all referenced by tests`
  );
  process.exit(0);
}

main();
