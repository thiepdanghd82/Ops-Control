import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  sumToolingCostStd,
  sumToolingCostCpx,
  fmtUsd,
  fmtVnd,
  safeLeadTime,
} from './CalcLeadTimeNotice.helpers.js';

describe('sumToolingCostStd', () => {
  test('empty array → 0', () => {
    assert.equal(sumToolingCostStd([]), 0);
  });

  test('undefined/null input → 0 (null-safe)', () => {
    assert.equal(sumToolingCostStd(undefined), 0);
    assert.equal(sumToolingCostStd(null), 0);
  });

  test('happy path: 100 + 200 + 50 → 350', () => {
    const processes = [{ tool_cost: 100 }, { tool_cost: 200 }, { tool_cost: 50 }];
    assert.equal(sumToolingCostStd(processes), 350);
  });

  test('NaN / null / empty-string tool_cost coerce to 0; mixed valid + invalid', () => {
    const processes = [
      { tool_cost: 100 },
      { tool_cost: null },
      { tool_cost: '' },
      { tool_cost: 'abc' },
      { tool_cost: NaN },
      { tool_cost: 50 },
    ];
    assert.equal(sumToolingCostStd(processes), 150);
  });

  test('rows with hidden===true are skipped', () => {
    const processes = [
      { tool_cost: 100 },
      { tool_cost: 200, hidden: true },
      { tool_cost: 50 },
    ];
    assert.equal(sumToolingCostStd(processes), 150);
  });
});

describe('sumToolingCostCpx', () => {
  test('empty subproducts → 0', () => {
    assert.equal(sumToolingCostCpx([]), 0);
  });

  test('undefined input → 0 (null-safe)', () => {
    assert.equal(sumToolingCostCpx(undefined), 0);
    assert.equal(sumToolingCostCpx(null), 0);
  });

  test('2 SPs × 2 processes each → cross-SP sum correct', () => {
    const subproducts = [
      { processes: [{ tool_cost: 100 }, { tool_cost: 50 }] },
      { processes: [{ tool_cost: 200 }, { tool_cost: 25 }] },
    ];
    assert.equal(sumToolingCostCpx(subproducts), 375);
  });

  test('SP with processes=undefined does not crash', () => {
    const subproducts = [
      { processes: [{ tool_cost: 100 }] },
      { processes: undefined },
      {},
      { processes: [{ tool_cost: 50 }] },
    ];
    assert.equal(sumToolingCostCpx(subproducts), 150);
  });
});

describe('fmtUsd', () => {
  test('0 → "—"', () => {
    assert.equal(fmtUsd(0), '—');
  });

  test('NaN → "—"', () => {
    assert.equal(fmtUsd(NaN), '—');
  });

  test('undefined / null → "—"', () => {
    assert.equal(fmtUsd(undefined), '—');
    assert.equal(fmtUsd(null), '—');
  });

  test('350 → "$350.00"', () => {
    assert.equal(fmtUsd(350), '$350.00');
  });

  test('1234.5 → "$1,234.50"', () => {
    assert.equal(fmtUsd(1234.5), '$1,234.50');
  });

  test('1234567.89 → "$1,234,567.89" (thousand separators)', () => {
    assert.equal(fmtUsd(1234567.89), '$1,234,567.89');
  });
});

describe('fmtVnd', () => {
  test('0 → "—"', () => {
    assert.equal(fmtVnd(0), '—');
  });

  test('NaN → "—"', () => {
    assert.equal(fmtVnd(NaN), '—');
  });

  test('undefined / null → "—"', () => {
    assert.equal(fmtVnd(undefined), '—');
    assert.equal(fmtVnd(null), '—');
  });

  test('non-numeric string → "—"', () => {
    assert.equal(fmtVnd('not-a-number'), '—');
  });

  test('10450 → "10,450" (thousand separator, no currency symbol)', () => {
    assert.equal(fmtVnd(10450), '10,450');
  });

  test('123456789 → "123,456,789" (large value)', () => {
    assert.equal(fmtVnd(123456789), '123,456,789');
  });

  test('10450.7 → "10,451" (decimals rounded to integer)', () => {
    // VND is integer-by-convention; partial dong don't exist in
    // operational use. Rounding avoids surfacing fake precision.
    assert.equal(fmtVnd(10450.7), '10,451');
  });

  test('numeric string accepted via Number() coerce', () => {
    assert.equal(fmtVnd('25000'), '25,000');
  });
});

describe('safeLeadTime', () => {
  const EXPECTED_KEYS = [
    'lt_material',
    'lt_sample',
    'lt_po',
    'lt_remark',
    'lt_process',
    'lt_material_type',
  ];

  test('undefined → 6 empty-string keys', () => {
    const out = safeLeadTime(undefined);
    for (const k of EXPECTED_KEYS) {
      assert.equal(out[k], '', `${k} should default to ''`);
    }
  });

  test('null → 6 empty-string keys', () => {
    const out = safeLeadTime(null);
    for (const k of EXPECTED_KEYS) {
      assert.equal(out[k], '');
    }
  });

  test('partial {lt_material:"foo"} → 5 keys "" + lt_material="foo"', () => {
    const out = safeLeadTime({ lt_material: 'foo' });
    assert.equal(out.lt_material, 'foo');
    assert.equal(out.lt_sample, '');
    assert.equal(out.lt_po, '');
    assert.equal(out.lt_remark, '');
    assert.equal(out.lt_process, '');
    assert.equal(out.lt_material_type, '');
  });

  test('full object → returned as-is (no key dropped)', () => {
    const full = {
      lt_material: 'a',
      lt_sample: 'b',
      lt_po: 'c',
      lt_remark: 'd\ne',
      lt_process: 'f',
      lt_material_type: 'g',
    };
    const out = safeLeadTime(full);
    for (const k of EXPECTED_KEYS) {
      assert.equal(out[k], full[k]);
    }
  });
});
