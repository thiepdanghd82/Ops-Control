// @ts-check
/**
 * buildZip must never lose an entry.
 *
 * Found on quote #27 (2026-09-15): the quote carries two MOQ tiers that
 * happen to share the same MOQ value — 250000 and 250000, the second tier
 * created with the same MOQ and no EAU of its own. `build1TierName` puts the
 * MOQ VALUE in the filename (`…_MOQ250000_internal_v2_…xlsx`), not the tier
 * index, so both tiers produced the same name. `zip.file(name, …)` keys a map
 * by path, so the second silently replaced the first: the operator asked for
 * every tier and received a zip holding ONE workbook, with nothing saying a
 * tier had gone missing.
 *
 * The de-duplication lives here rather than in filenames.js because this is
 * the choke point every export passes through — the CSV path reuses the same
 * per-tier name as a prefix, so a fix at the naming layer would have had to be
 * made twice and could be bypassed by any future caller.
 *
 * Runner: node --test server/services/quoteExport/__tests__/zip.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildZip } from '../zip.js';

const buf = (s) => Buffer.from(s, 'utf8');

async function namesIn(entries) {
  const zip = await JSZip.loadAsync(await buildZip(entries));
  return Object.keys(zip.files);
}

test('distinct filenames are kept as given', async () => {
  const names = await namesIn([
    { filename: 'a.xlsx', buffer: buf('A') },
    { filename: 'b.xlsx', buffer: buf('B') },
  ]);
  assert.deepEqual(names.sort(), ['a.xlsx', 'b.xlsx']);
});

test('a repeated filename does not drop the entry — quote #27', async () => {
  const n = 'Quote_80640001_BOSE_MOQ250000_internal_v2_20260915.xlsx';
  const names = await namesIn([
    { filename: n, buffer: buf('tier-1') },
    { filename: n, buffer: buf('tier-2') },
  ]);
  assert.equal(names.length, 2, `expected both tiers, got: ${names.join(' | ')}`);
});

test('the first entry keeps its name; later ones are suffixed before the extension', async () => {
  const n = 'Quote_X_MOQ250000_internal_v2_20260915.xlsx';
  const names = await namesIn([
    { filename: n, buffer: buf('1') },
    { filename: n, buffer: buf('2') },
    { filename: n, buffer: buf('3') },
  ]);
  assert.ok(names.includes(n), 'the first must be untouched so the common case never changes');
  assert.ok(names.includes('Quote_X_MOQ250000_internal_v2_20260915 (2).xlsx'));
  assert.ok(names.includes('Quote_X_MOQ250000_internal_v2_20260915 (3).xlsx'));
});

test('every entry keeps its own bytes — no entry is served another one content', async () => {
  const n = 'dup.xlsx';
  const zip = await JSZip.loadAsync(
    await buildZip([
      { filename: n, buffer: buf('first') },
      { filename: n, buffer: buf('second') },
    ])
  );
  const got = await Promise.all(
    Object.keys(zip.files)
      .sort()
      .map((k) => zip.file(k).async('string'))
  );
  assert.deepEqual(got.sort(), ['first', 'second']);
});

test('a name with no extension still disambiguates', async () => {
  const names = await namesIn([
    { filename: 'README', buffer: buf('1') },
    { filename: 'README', buffer: buf('2') },
  ]);
  assert.deepEqual(names.sort(), ['README', 'README (2)']);
});

test('a multi-dot name suffixes before the LAST extension only', async () => {
  const names = await namesIn([
    { filename: 'a.b.csv', buffer: buf('1') },
    { filename: 'a.b.csv', buffer: buf('2') },
  ]);
  assert.deepEqual(names.sort(), ['a.b (2).csv', 'a.b.csv']);
});
