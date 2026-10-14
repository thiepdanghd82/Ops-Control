// @ts-check
/**
 * Every stylesheet under src/ must be imported by some module.
 *
 * Found 2026-10-14: RfqInfoCard.css held the required-field asterisk and the
 * field-error styling for the RFQ card, and nothing imported it, so neither
 * ever showed (since PR 282). Dashboard.css, the opposite case, sat unused.
 * Vite bundles only what is imported; a stylesheet nobody imports is either
 * a bug or dead weight, and neither raises an error anywhere else.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

test('every .css file under src/ is imported somewhere', () => {
  const files = walk(SRC);
  const imported = new Set();
  for (const f of files) {
    if (!/\.(jsx?|css)$/.test(f)) continue;
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:import\s+|@import\s+(?:url\()?)['"]([^'"]+\.css)['"]/g)) {
      imported.add(path.resolve(path.dirname(f), m[1]));
    }
  }
  const orphans = files
    .filter((f) => f.endsWith('.css') && !imported.has(f))
    .map((f) => path.relative(SRC, f));
  assert.deepEqual(orphans, [], `stylesheets nothing imports: ${orphans.join(', ')}`);
});
