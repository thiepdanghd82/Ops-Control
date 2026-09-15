#!/usr/bin/env node
/**
 * SHA discipline for CLAUDE.md's sprint history (Lesson 0).
 *
 * Lesson 0 asks every "Sprint X shipped" claim to cite the commit that
 * proves it, and documented this one-liner as the check:
 *
 *   grep -nE "shipped|landed [0-9]" CLAUDE.md | grep -v "SHA:" | grep -v "tests pass\b"
 *
 * That command reports 12 failures against a file with **none**, which is
 * the worst thing a check can do: whoever runs it learns to ignore it.
 * Four separate reasons it misfires, all found by reading its output:
 *
 *   1. It greps the WHOLE file, so the word "shipped" in a recovery-playbook
 *      table row, a runbook heading and six backlog-ticket bullets all count
 *      as sprint claims.
 *   2. It excludes the literal "SHA:" — so an entry written `PR #228
 *      (`aa8cbba`)` or even `PR #166 SHA `d939a48`` (no colon) is reported
 *      as missing a SHA it is, in fact, carrying.
 *   3. It is line-based, so a bundle entry whose header line introduces the
 *      sprint and whose child bullets carry the SHAs is reported as missing
 *      them — S-D15-COSTING-CUTOVER has eight, one per PR.
 *   4. It cannot tell the sprint history from the summary block above it,
 *      which predates Lesson 0 and is date-only by design.
 *
 * So this replaces it. Scope is the sprint-history section ONLY — everything
 * above the "Sprint history — newest first" marker is the older summary block
 * that Lesson 0 explicitly exempts ("those keep date-only references"). An
 * entry passes if a commit-ish token appears anywhere in its block, including
 * its child bullets, in whatever prose form the author chose.
 *
 * Runner:  node scripts/sprint-history-sha.js [path/to/CLAUDE.md]
 * Exits 1 and names the offending entries when any claim is unprovable.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The line that opens the SHA-disciplined section. Everything above is exempt. */
export const HISTORY_MARKER = '**Sprint history — newest first**';

/** A commit-ish token: 7–40 hex in backticks. Matches `5d6dabc` and full hashes. */
const SHA_TOKEN = /`[0-9a-f]{7,40}`/;

/** An entry opens with a bolded "Sprint ..." at the start of a blockquote line. */
const ENTRY_OPEN = /^>\s+\*\*Sprint\s+(.+?)(?:\s+—|\s+--|\*\*)/;

/**
 * Split the sprint-history section into one block per entry.
 * A block runs from its opening line to the next entry, so bundle entries
 * keep the child bullets that carry their per-PR SHAs.
 *
 * @param {string} md raw CLAUDE.md contents
 * @returns {{name: string, line: number, text: string}[]}
 */
export function parseSprintEntries(md) {
  const lines = md.split('\n');
  const startIdx = lines.findIndex((l) => l.includes(HISTORY_MARKER));
  if (startIdx === -1) return [];

  const entries = [];
  let cur = null;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const open = ENTRY_OPEN.exec(line);
    if (open) {
      if (cur) entries.push(cur);
      cur = { name: open[1].trim(), line: i + 1, text: line };
      continue;
    }
    if (!cur) continue;
    // The section is one blockquote; the first non-quoted line ends it.
    if (!line.startsWith('>')) break;
    cur.text += '\n' + line;
  }
  if (cur) entries.push(cur);
  return entries;
}

/**
 * @param {string} md raw CLAUDE.md contents
 * @returns {{name: string, line: number}[]} entries citing no commit
 */
export function findEntriesWithoutSha(md) {
  return parseSprintEntries(md)
    .filter((e) => !SHA_TOKEN.test(e.text))
    .map(({ name, line }) => ({ name, line }));
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const file = process.argv[2] || path.join(root, 'CLAUDE.md');
  const md = fs.readFileSync(file, 'utf8');

  const entries = parseSprintEntries(md);
  if (entries.length === 0) {
    console.error(`FAIL: no sprint entries found — is "${HISTORY_MARKER}" still in ${file}?`);
    process.exit(1);
  }

  const bad = findEntriesWithoutSha(md);
  if (bad.length === 0) {
    console.log(`PASS: all ${entries.length} sprint entries cite a commit.`);
    return;
  }
  console.error(`FAIL: ${bad.length} of ${entries.length} sprint entries cite no commit:`);
  for (const e of bad) console.error(`  CLAUDE.md:${e.line}  Sprint ${e.name}`);
  console.error('\nLesson 0: every ship claim needs a SHA a reader can `git show`.');
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
