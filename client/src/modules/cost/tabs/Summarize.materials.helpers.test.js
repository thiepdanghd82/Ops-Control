import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  collectDrwMaterials,
  collectQuoteMaterials,
  formatBulletList,
  toBulletFromTextarea,
} from './Summarize.materials.helpers.js';

describe('formatBulletList', () => {
  test('empty array → empty string', () => {
    assert.equal(formatBulletList([]), '');
  });

  test('null / undefined / non-array → empty string', () => {
    assert.equal(formatBulletList(null), '');
    assert.equal(formatBulletList(undefined), '');
    assert.equal(formatBulletList('not an array'), '');
  });

  test('single item → single bullet', () => {
    assert.equal(formatBulletList(['x']), '- x');
  });

  test('multiple items → multi-line bullets', () => {
    assert.equal(formatBulletList(['a', 'b', 'c']), '- a\n- b\n- c');
  });

  test('drops empty / null entries', () => {
    assert.equal(formatBulletList(['a', '', null, undefined, 'b']), '- a\n- b');
  });

  test('drops whitespace-only entries', () => {
    assert.equal(formatBulletList(['  ', '\t', 'real', '\n']), '- real');
  });

  test('trims each surviving entry', () => {
    assert.equal(formatBulletList(['  a  ', '\tb\t']), '- a\n- b');
  });

  test('non-string entries silently dropped', () => {
    assert.equal(formatBulletList(['ok', 123, { obj: true }, 'also']), '- ok\n- also');
  });
});

describe('toBulletFromTextarea', () => {
  test('newline-separated input → bullets', () => {
    assert.equal(toBulletFromTextarea('a\nb\nc'), '- a\n- b\n- c');
  });

  test('trims each line', () => {
    assert.equal(toBulletFromTextarea('  a  \n  b  '), '- a\n- b');
  });

  test('skips blank lines (operator paragraph spacing tolerated)', () => {
    assert.equal(toBulletFromTextarea('a\n\nb\n\n'), '- a\n- b');
  });

  test('single line → single bullet', () => {
    assert.equal(toBulletFromTextarea('only one'), '- only one');
  });

  test('empty / whitespace-only / null → empty string', () => {
    assert.equal(toBulletFromTextarea(''), '');
    assert.equal(toBulletFromTextarea('  \n  \n'), '');
    assert.equal(toBulletFromTextarea(null), '');
    assert.equal(toBulletFromTextarea(undefined), '');
  });

  test('CRLF line endings tolerated (trim drops the \\r)', () => {
    assert.equal(toBulletFromTextarea('a\r\nb\r\nc'), '- a\n- b\n- c');
  });
});

describe('collectDrwMaterials — Main.Mat filter + bullet format', () => {
  test('Std: skips Process Mat rows', () => {
    const state = {
      materials: [
        { row_type: 'Main.Mat', drw_material: 'A' },
        { row_type: 'Process Mat', drw_material: 'X' },
        { row_type: 'Main.Mat', drw_material: 'B' },
      ],
    };
    assert.equal(collectDrwMaterials(state), '- A\n- B');
  });

  test('Std: legacy "Main.Mat 1" / "Main.Mat 2" treated as Main.Mat', () => {
    const state = {
      materials: [
        { row_type: 'Main.Mat 1', drw_material: 'A' },
        { row_type: 'Main.Mat 2', drw_material: 'B' },
        { row_type: 'Main.Mat', drw_material: 'C' },
        { row_type: 'Process Mat 3', drw_material: 'X' },
      ],
    };
    assert.equal(collectDrwMaterials(state), '- A\n- B\n- C');
  });

  test('Cpx: filter across all subproducts, preserve duplicates', () => {
    const state = {
      subproducts: [
        {
          materials: [
            { row_type: 'Main.Mat', drw_material: 'A' },
            { row_type: 'Process Mat', drw_material: 'X' },
          ],
        },
        {
          materials: [
            { row_type: 'Main.Mat', drw_material: 'B' },
            { row_type: 'Process Mat', drw_material: 'Y' },
          ],
        },
      ],
    };
    // Process Mat rows skipped; Main.Mat duplicates kept (no dedupe).
    assert.equal(collectDrwMaterials(state), '- A\n- B');
  });

  test('Cpx: duplicate Main.Mat across SPs preserved', () => {
    const state = {
      subproducts: [
        { materials: [{ row_type: 'Main.Mat', drw_material: 'MAT-A' }] },
        { materials: [{ row_type: 'Main.Mat', drw_material: 'MAT-A' }] },
        { materials: [{ row_type: 'Main.Mat', drw_material: 'MAT-B' }] },
      ],
    };
    assert.equal(collectDrwMaterials(state), '- MAT-A\n- MAT-A\n- MAT-B');
  });

  test('empty drw_material on a Main.Mat row → dropped', () => {
    const state = {
      materials: [
        { row_type: 'Main.Mat', drw_material: 'A' },
        { row_type: 'Main.Mat', drw_material: '' },
        { row_type: 'Main.Mat', drw_material: null },
        { row_type: 'Main.Mat', drw_material: 'C' },
      ],
    };
    assert.equal(collectDrwMaterials(state), '- A\n- C');
  });

  test('all Process Mat → empty string', () => {
    const state = {
      materials: [
        { row_type: 'Process Mat', drw_material: 'X' },
        { row_type: 'Process Mat 5', drw_material: 'Y' },
      ],
    };
    assert.equal(collectDrwMaterials(state), '');
  });

  test('missing row_type defaults to NOT Main.Mat (safe default)', () => {
    // Pre-Sprint S-ALT-MAT quotes may not have row_type at all. Without
    // an explicit row_type, the row should be treated as NOT Main.Mat
    // (operator should heal these by re-saving the quote). Henry's
    // Phase-Q3 spec calls this "defensive normalize".
    const state = {
      materials: [
        { drw_material: 'A' }, // no row_type
        { row_type: 'Main.Mat', drw_material: 'B' },
      ],
    };
    assert.equal(collectDrwMaterials(state), '- B');
  });

  test('empty / null state → empty string', () => {
    assert.equal(collectDrwMaterials({}), '');
    assert.equal(collectDrwMaterials({ materials: [] }), '');
    assert.equal(collectDrwMaterials({ materials: null }), '');
    assert.equal(collectDrwMaterials(null), '');
    assert.equal(collectDrwMaterials(undefined), '');
  });

  test('Cpx with empty subproducts array falls through to Std materials path', () => {
    const state = {
      subproducts: [],
      materials: [{ row_type: 'Main.Mat', drw_material: 'TOP' }],
    };
    assert.equal(collectDrwMaterials(state), '- TOP');
  });
});

describe('collectQuoteMaterials — same filter logic on desc', () => {
  test('Std: bullet desc for Main.Mat only', () => {
    const state = {
      materials: [
        { row_type: 'Main.Mat', desc: 'BOPP 50um' },
        { row_type: 'Process Mat', desc: 'Release liner' },
        { row_type: 'Main.Mat', desc: 'PET 12um' },
      ],
    };
    assert.equal(collectQuoteMaterials(state), '- BOPP 50um\n- PET 12um');
  });

  test('Cpx: cross-SP bullet desc', () => {
    const state = {
      subproducts: [
        {
          materials: [
            { row_type: 'Main.Mat', desc: 'Film' },
            { row_type: 'Process Mat', desc: 'Primer' },
          ],
        },
        { materials: [{ row_type: 'Main.Mat', desc: 'Liner' }] },
      ],
    };
    assert.equal(collectQuoteMaterials(state), '- Film\n- Liner');
  });

  test('drw_material and desc collectors stay independent — no cross-talk', () => {
    const state = {
      materials: [
        { row_type: 'Main.Mat', drw_material: 'CODE-A', desc: 'Display A' },
        { row_type: 'Process Mat', drw_material: 'CODE-X', desc: 'Display X' },
      ],
    };
    assert.equal(collectDrwMaterials(state), '- CODE-A');
    assert.equal(collectQuoteMaterials(state), '- Display A');
  });

  test('legacy Main.Mat N suffix carries through to desc collector', () => {
    const state = {
      materials: [
        { row_type: 'Main.Mat 1', desc: 'one' },
        { row_type: 'Main.Mat 2', desc: 'two' },
      ],
    };
    assert.equal(collectQuoteMaterials(state), '- one\n- two');
  });
});
