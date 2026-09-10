import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { normCode, resolveLibRow } from './codeMatch.js';

describe('normCode', () => {
  test('removes ALL whitespace (internal + ends)', () => {
    assert.equal(normCode('JKD PSC 701-10B-NT'), 'jkdpsc701-10b-nt');
    assert.equal(normCode('  JKD PSC701-10B-NT '), 'jkdpsc701-10b-nt');
  });

  test('non-breaking space is folded (NFKC)', () => {
    assert.equal(normCode('JKD PSC701-10B-NT'), 'jkdpsc701-10b-nt');
  });

  test('folds en/em/figure dashes + minus to hyphen', () => {
    assert.equal(normCode('AB–CD'), normCode('AB-CD'));
    assert.equal(normCode('AB−CD'), normCode('AB-CD'));
  });

  test('strips trailing * markers', () => {
    assert.equal(normCode('PET SB50(A)PA-T111LLY*'), 'petsb50(a)pa-t111lly');
    assert.equal(normCode('PET SB50(A)PA-T111LLY'), 'petsb50(a)pa-t111lly');
  });

  test('null / undefined / number tolerated', () => {
    assert.equal(normCode(null), '');
    assert.equal(normCode(undefined), '');
    assert.equal(normCode(9183), '9183');
  });
});

describe('resolveLibRow — material auto-fill fuzzy codes (live-confirmed)', () => {
  const mat = [
    { code: '3m9183', description: '3M 9183 desc', price: 1.23, width: 300 },
    { code: 'pet sb50(a)pa-t111lly', description: 'PET SB50 desc', price: 4.56, width: 250 },
    { code: 'pc 1151 t0.4', description: 'PC 1151 desc', price: 7.89, width: 200 },
  ];

  test('"3M 9183" (internal space) resolves to the "3m9183" price row', () => {
    const res = resolveLibRow(mat, 'code', '3M 9183');
    assert.equal(res.row?.code, '3m9183');
    assert.equal(res.fuzzy, true);
    assert.equal(res.ambiguous, false);
  });

  test('"PET SB50(A)PA-T111LLY*" resolves to the non-"*" row', () => {
    const res = resolveLibRow(mat, 'code', 'PET SB50(A)PA-T111LLY*');
    assert.equal(res.row?.code, 'pet sb50(a)pa-t111lly');
    assert.equal(res.fuzzy, true);
  });

  test('exact code wins with fuzzy=false (no false-positive risk)', () => {
    const res = resolveLibRow(mat, 'code', 'pc 1151 t0.4');
    assert.equal(res.row?.code, 'pc 1151 t0.4');
    assert.equal(res.fuzzy, false);
    assert.equal(res.ambiguous, false);
  });

  test('exact match is case/whitespace-insensitive at the ends only', () => {
    const res = resolveLibRow(mat, 'code', '  3M9183 ');
    assert.equal(res.row?.code, '3m9183');
    assert.equal(res.fuzzy, false);
  });

  test('ambiguity guard: >1 distinct normalized hit → null, never guess', () => {
    const dup = [
      { code: 'AB 12', description: 'a' },
      { code: 'AB12', description: 'b' },
    ];
    const res = resolveLibRow(dup, 'code', 'a b 12');
    assert.equal(res.row, null);
    assert.equal(res.ambiguous, true);
    assert.equal(res.fuzzy, false);
  });

  test('true duplicate rows (same original) are NOT ambiguous', () => {
    const dup = [
      { code: 'AB12', description: 'a' },
      { code: 'AB12', description: 'a' },
    ];
    const res = resolveLibRow(dup, 'code', 'ab 12');
    assert.equal(res.row?.code, 'AB12');
    assert.equal(res.fuzzy, true);
    assert.equal(res.ambiguous, false);
  });

  test('genuine no-match → null, not fuzzy, not ambiguous', () => {
    const res = resolveLibRow(mat, 'code', 'NOPE-999');
    assert.equal(res.row, null);
    assert.equal(res.fuzzy, false);
    assert.equal(res.ambiguous, false);
  });

  test('non-array rows / empty key are tolerated', () => {
    assert.deepEqual(resolveLibRow(null, 'code', 'x'), {
      row: null,
      fuzzy: false,
      ambiguous: false,
    });
    assert.deepEqual(resolveLibRow(mat, 'code', '   '), {
      row: null,
      fuzzy: false,
      ambiguous: false,
    });
  });
});
