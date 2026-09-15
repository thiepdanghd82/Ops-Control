/**
 * Tests for sprint-history-sha.js — the Lesson 0 SHA-discipline check.
 *
 * Each synthetic case below is one of the four ways the `grep` one-liner this
 * replaced produced a FALSE failure. They are the point of the file: the real
 * risk is not a missing SHA (there were none) but a check nobody trusts.
 *
 * Runner: node --test scripts/sprint-history-sha.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSprintEntries, findEntriesWithoutSha, HISTORY_MARKER } from './sprint-history-sha.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAUDE_MD = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');

const HEADER = `> **${HISTORY_MARKER.replace(/\*\*/g, '')}** (SHA-discipline per Lesson 0):\n>\n`;

// ── the real file ───────────────────────────────────────────────────

test('every sprint entry in CLAUDE.md cites a commit', () => {
  const bad = findEntriesWithoutSha(CLAUDE_MD);
  assert.deepEqual(
    bad,
    [],
    'entries citing no commit:\n' +
      bad.map((b) => `  CLAUDE.md:${b.line} Sprint ${b.name}`).join('\n')
  );
});

test('the history section is actually found, so a pass is not vacuous', () => {
  const entries = parseSprintEntries(CLAUDE_MD);
  assert.ok(entries.length > 40, `expected the full history, parsed only ${entries.length}`);
  const names = entries.map((e) => e.name);
  assert.ok(
    names.some((n) => n.startsWith('S-I18N-WAVES')),
    'a known recent entry must parse'
  );
});

// ── the four false-failure classes the grep produced ────────────────

test('class 1: prose above the marker is out of scope', () => {
  const md =
    '> **Sprint 1.5 — provisioning.** date-only, predates Lesson 0.\n\n' +
    '| MVP-3 re-import (when shipped) | refuses pre-loss exports |\n\n' +
    '### "Bad deploy" (P1-2 patch landed 2026-05-27)\n\n' +
    HEADER +
    '> **Sprint S-REAL — a thing shipped 2026-01-01 (SHA: `abc1234`).** body\n';
  assert.deepEqual(findEntriesWithoutSha(md), []);
  assert.equal(parseSprintEntries(md).length, 1, 'only the entry below the marker counts');
});

test('class 2: a SHA cited without the literal "SHA:" still counts', () => {
  const md =
    HEADER +
    '> **Sprint S-A — shipped 2026-01-01.** landed via PR #228 (`aa8cbba`).\n' +
    '>\n' +
    '> **Sprint S-B — Legend (PR #166 SHA `d939a48`) shipped 2026-01-02.** body\n';
  assert.deepEqual(findEntriesWithoutSha(md), []);
});

test('class 3: a bundle entry whose child bullets carry the SHAs passes', () => {
  const md =
    HEADER +
    '> **Sprint S-BUNDLE — 3-PR bundle shipped 2026-01-01.**\n' +
    '>\n' +
    '> * **PR #109 — guardrails shipped 2026-01-01 (SHA: `95be4d9`).**\n' +
    '> * **PR #110 — DRW column shipped 2026-01-01 (SHA: `5d89504`).**\n';
  const entries = parseSprintEntries(md);
  assert.equal(entries.length, 1, 'child bullets belong to their parent, not new entries');
  assert.deepEqual(findEntriesWithoutSha(md), []);
});

test('class 4: the marker line itself is not an entry', () => {
  assert.equal(parseSprintEntries(HEADER).length, 0);
});

// ── the true positive it exists to catch ────────────────────────────

test('an entry citing no commit anywhere in its block is caught', () => {
  const md =
    HEADER +
    '> **Sprint S-GOOD — shipped 2026-01-01 (SHA: `abc1234`).** body\n' +
    '>\n' +
    '> **Sprint S-BAD — shipped 2026-01-02.** no commit, and none in the body either.\n' +
    '>\n' +
    '> more body, still no commit.\n';
  const bad = findEntriesWithoutSha(md);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].name, 'S-BAD');
});

test('a too-short hex run is not mistaken for a commit', () => {
  const md = HEADER + '> **Sprint S-X — shipped 2026-01-01.** the value `abc` is not a SHA.\n';
  assert.equal(findEntriesWithoutSha(md).length, 1);
});

test('no marker means no entries, so the CLI fails loudly instead of passing', () => {
  assert.deepEqual(parseSprintEntries('# A document with no sprint history\n'), []);
});
