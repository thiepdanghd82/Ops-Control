/**
 * CONTEXT.md and .agents/rules/context.md must carry the same glossary.
 *
 * The second file is the first one plus a frontmatter block, so agents that
 * read rules from `.agents/` get the same shared language. Nothing enforced
 * that, and on 2026-09-21 two sections were added to CONTEXT.md -- the screen
 * names and the settled site name -- and neither reached the mirror. Thirty
 * lines of drift, all of it from one day, and nothing anywhere went red.
 *
 * That is Lesson 48 exactly: when the same content lives in two places and
 * only one is the one people edit, they drift, and you find out by accident.
 * The lesson was written that morning and missed that afternoon, which is the
 * argument for a guard rather than a habit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'CONTEXT.md';
const MIRROR = '.agents/rules/context.md';

const read = (p) => readFileSync(path.join(root, p), 'utf8');

/** Strip the mirror's leading `--- ... ---` frontmatter and the blank line after it. */
function body(text) {
  if (!text.startsWith('---\n')) return text;
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return text;
  return text.slice(end + '\n---\n'.length).replace(/^\n/, '');
}

test('the agent glossary mirror matches CONTEXT.md exactly', () => {
  const source = read(SOURCE);
  const mirror = body(read(MIRROR));
  if (mirror === source) return;

  // A bare "not equal" would send someone diffing 100 lines by hand, so name
  // the first line that differs and which side is ahead.
  const a = source.split('\n');
  const b = mirror.split('\n');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  assert.fail(
    `${MIRROR} has drifted from ${SOURCE} at line ${i + 1}.\n` +
      `  ${SOURCE}: ${JSON.stringify(a[i] ?? '<end of file>')}\n` +
      `  ${MIRROR}: ${JSON.stringify(b[i] ?? '<end of file>')}\n` +
      `  Edit ${SOURCE}, then copy its body under the mirror's frontmatter.`
  );
});

test('the mirror keeps the frontmatter that makes it a rules file', () => {
  // Without it the file is just a second copy of the glossary and the agent
  // tooling stops loading it, which would be a silent loss rather than an error.
  const raw = read(MIRROR);
  assert.match(raw, /^---\n/, 'mirror must open with frontmatter');
  assert.match(raw, /\ntrigger:\s*always_on\b/, 'mirror must keep trigger: always_on');
});
