/**
 * Source-level guard that Quote History and Cost Breakdown read "Quoted by"
 * the same way: through quotedBy(), from the quote row.
 *
 * The creator is the one value these tables show that does not live in the
 * quote's state. The server stamps it on the row when the quote is first saved
 * (2026-10-02), so a copy, which carries the state over, does not carry it. A
 * screen that looked for it in the state would show a blank column, and two
 * screens that each read it their own way are free to disagree.
 *
 * No React test infrastructure in this repo, so source inspection is the only
 * way to assert it — same approach as toolLifeUnit.lint.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const code = (p) =>
  readFileSync(path.join(here, p), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');

const READERS = [
  ['Quote History cell', 'QuoteHistory.jsx'],
  ['Quote History sort', 'QuoteHistory.columns.js'],
  ['Cost Breakdown row', 'Summarize.jsx'],
];

test('every reader takes the creator from quotedBy()', () => {
  for (const [name, file] of READERS) {
    assert.match(code(file), /quotedBy\(q\)/, `${name} must read the creator via quotedBy(q)`);
  }
});

test('no reader names the stored field itself', () => {
  for (const [name, file] of READERS) {
    assert.doesNotMatch(code(file), /created_by/, `${name} must leave the field to quotedBy()`);
  }
});
