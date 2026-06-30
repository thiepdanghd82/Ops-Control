import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  sumToolingCostStd,
  sumToolingCostCpx,
  fmtUsd,
  fmtVnd,
  safeLeadTime,
  deriveMaterialLT,
  resolveMaterialLtDisplay,
  buildLeadTimeMaterialsTable,
} from './CalcLeadTimeNotice.helpers.js';
import { calcMat } from '../../../../services/calcEngine.js';

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
    const processes = [{ tool_cost: 100 }, { tool_cost: 200, hidden: true }, { tool_cost: 50 }];
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

  test('lt_material_ovr structural default → "" when absent', () => {
    assert.equal(safeLeadTime(undefined).lt_material_ovr, '');
    assert.equal(safeLeadTime({ lt_material: 'x' }).lt_material_ovr, '');
  });

  test('lt_material_ovr preserved when present (does NOT re-seed)', () => {
    assert.equal(
      safeLeadTime({ lt_material: 'x', lt_material_ovr: '40 days' }).lt_material_ovr,
      '40 days'
    );
    // empty override stays empty (reset-safe — no re-seed from lt_material)
    assert.equal(safeLeadTime({ lt_material: 'legacy', lt_material_ovr: '' }).lt_material_ovr, '');
  });
});

describe('deriveMaterialLT', () => {
  const LIB = {
    ifs: [
      { part_no: 'MAT-A', leadtime: 30 },
      { part_no: 'MAT-B', leadtime: 10 },
      { part_no: 'MAT-ZERO', leadtime: 0 },
      { part_no: 'MAT-BAD', leadtime: 'n/a' },
    ],
    npi: [
      { name: 'MAT-A', lt: 20 },
      { name: 'NPI-ONLY', lt: 45 },
    ],
  };
  const main = (code, extra = {}) => ({ row_type: 'Main.Mat', code, ...extra });

  test('max + 7 across multiple Main.Mat rows, formatted "<n> days"', () => {
    const rows = [main('MAT-A'), main('MAT-B')]; // IFS 30/10 + NPI 20 → max 30
    assert.equal(deriveMaterialLT(rows, LIB), '37 days');
  });

  test('considers BOTH IFS `leadtime` and NPI `lt`', () => {
    // NPI-ONLY only in NPI (lt 45) → 52 days
    assert.equal(deriveMaterialLT([main('NPI-ONLY')], LIB), '52 days');
    // MAT-A: IFS 30 + NPI 20 → max 30 → 37
    assert.equal(deriveMaterialLT([main('MAT-A')], LIB), '37 days');
  });

  test('Process Mat rows ARE counted (operator decision 2026-06-30)', () => {
    // Process Mat NPI-ONLY (lt 45) → 52; Alt.Mat MAT-A ignored even though 30>...
    const rows = [
      { row_type: 'Alt.Mat', code: 'MAT-A' }, // ignored — alt set
      { row_type: 'Process Mat', code: 'NPI-ONLY' }, // counted → 45
    ];
    assert.equal(deriveMaterialLT(rows, LIB), '52 days');
  });

  test('max spans Main.Mat + Process.Mat together', () => {
    const rows = [
      { row_type: 'Main.Mat', code: 'MAT-B' }, // 10
      { row_type: 'Process Mat', code: 'NPI-ONLY' }, // 45 → wins
    ];
    assert.equal(deriveMaterialLT(rows, LIB), '52 days');
  });

  test('legacy "Process Mat 2" suffix classified via isProcessMat', () => {
    assert.equal(deriveMaterialLT([{ row_type: 'Process Mat 2', code: 'MAT-A' }], LIB), '37 days');
  });

  test('Alt.Mat still ignored on its own', () => {
    assert.equal(deriveMaterialLT([{ row_type: 'Alt.Mat', code: 'NPI-ONLY' }], LIB), null);
  });

  test('legacy "Main.Mat 1" classified via isMainMat', () => {
    assert.equal(deriveMaterialLT([{ row_type: 'Main.Mat 1', code: 'MAT-B' }], LIB), '17 days');
  });

  test('no library match → null (never a bare "7 days")', () => {
    assert.equal(deriveMaterialLT([main('NOPE')], LIB), null);
    assert.equal(deriveMaterialLT([main('')], LIB), null);
  });

  test('non-finite / 0 lead times skipped', () => {
    assert.equal(deriveMaterialLT([main('MAT-ZERO'), main('MAT-BAD')], LIB), null);
    // mix: MAT-ZERO(0, skip) + MAT-B(10) → 17
    assert.equal(deriveMaterialLT([main('MAT-ZERO'), main('MAT-B')], LIB), '17 days');
  });

  test('code falls back to ifs_code; trim + case-insensitive match', () => {
    assert.equal(
      deriveMaterialLT([{ row_type: 'Main.Mat', code: '', ifs_code: ' mat-a ' }], LIB),
      '37 days'
    );
    assert.equal(deriveMaterialLT([main('  MAT-b ')], LIB), '17 days');
  });

  test('null / non-array / missing lib → null', () => {
    assert.equal(deriveMaterialLT(null, LIB), null);
    assert.equal(deriveMaterialLT([main('MAT-A')], null), null);
    assert.equal(deriveMaterialLT([main('MAT-A')], {}), null);
  });
});

describe('resolveMaterialLtDisplay', () => {
  test('non-empty override → override value + isOverride true', () => {
    const r = resolveMaterialLtDisplay({ lt_material_ovr: '40 days' }, '37 days');
    assert.deepEqual(r, { value: '40 days', isOverride: true });
  });

  test('empty / whitespace override → auto value, isOverride false', () => {
    assert.deepEqual(resolveMaterialLtDisplay({ lt_material_ovr: '' }, '37 days'), {
      value: '37 days',
      isOverride: false,
    });
    assert.deepEqual(resolveMaterialLtDisplay({ lt_material_ovr: '   ' }, '37 days'), {
      value: '37 days',
      isOverride: false,
    });
  });

  test('null auto → empty string in auto mode', () => {
    assert.deepEqual(resolveMaterialLtDisplay({}, null), { value: '', isOverride: false });
    assert.deepEqual(resolveMaterialLtDisplay(null, null), { value: '', isOverride: false });
  });
});

describe('buildLeadTimeMaterialsTable', () => {
  // st with layout so calcMat returns a deterministic qpa_m2:
  //   effWidth=100, pitch=10, cavities=1, webs=1, usage=1
  //   qpa_m2 = (10*100/1e6/1/1)*1 = 0.001
  const ST = { num_webs: 1, processes: [], web_width_td: 100, sheet_length: 10, min_gap_md: 0 };
  const mat = (code, extra = {}) => ({
    row_type: 'Main.Mat',
    code,
    desc: `desc-${code}`,
    width: 100,
    cavities: 1,
    pitch_ovr: 10,
    usage: 1,
    ...extra,
  });
  const LIB = {
    npi: [
      { name: 'MAT-A', moq: 500, type: 'PET 50um' },
      { name: 'MAT-ZERO-MOQ', moq: 0, type: 'X' },
    ],
  };
  const QPA = calcMat(mat('MAT-A'), ST, 1000, null, null).qpa_m2; // 0.001
  const close = (a, b) => Math.abs(a - b) < 1e-9;

  test('code matches NPI name → moq_m2 = NPI moq, clear_pcs = moq/qpa_m2', () => {
    const rows = buildLeadTimeMaterialsTable([mat('MAT-A')], LIB, ST, 1000);
    assert.equal(rows.length, 1);
    const r = rows[0];
    assert.equal(r.ifs_code, 'MAT-A');
    assert.equal(r.quote_mat, 'desc-MAT-A');
    assert.equal(r.type, 'PET 50um');
    assert.ok(close(r.qpa_m2, QPA), 'qpa_m2 == calcMat qpa_m2');
    assert.equal(r.moq_m2, 500);
    assert.ok(close(r.clear_pcs, 500 / QPA), 'clear_pcs = moq/qpa');
  });

  test('qpa_m2 equals calcMat(mat,...).qpa_m2 exactly', () => {
    const rows = buildLeadTimeMaterialsTable([mat('MAT-A')], LIB, ST, 1000);
    assert.equal(rows[0].qpa_m2, calcMat(mat('MAT-A'), ST, 1000, null, null).qpa_m2);
  });

  test('no NPI match → moq_m2 + clear_pcs null (never fabricated)', () => {
    const rows = buildLeadTimeMaterialsTable([mat('NOPE')], LIB, ST, 1000);
    assert.equal(rows[0].moq_m2, null);
    assert.equal(rows[0].clear_pcs, null);
    assert.equal(rows[0].type, '');
  });

  test('qpa_m2 = 0 → clear_pcs null (no divide-by-zero)', () => {
    // width 0 + no layout width → effWidth 0 → qpa_m2 0
    const rows = buildLeadTimeMaterialsTable(
      [mat('MAT-A', { width: 0 })],
      LIB,
      { ...ST, web_width_td: 0 },
      1000
    );
    assert.equal(rows[0].qpa_m2, 0);
    assert.equal(rows[0].clear_pcs, null);
    assert.equal(rows[0].moq_m2, 500, 'moq_m2 still from NPI');
  });

  test('NPI moq = 0 → moq_m2 null (no fake MOQ)', () => {
    const rows = buildLeadTimeMaterialsTable([mat('MAT-ZERO-MOQ')], LIB, ST, 1000);
    assert.equal(rows[0].moq_m2, null);
    assert.equal(rows[0].clear_pcs, null);
  });

  test('blank-code rows skipped', () => {
    const rows = buildLeadTimeMaterialsTable(
      [mat(''), mat('   '), { row_type: 'Main.Mat' }, mat('MAT-A')],
      LIB,
      ST,
      1000
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].ifs_code, 'MAT-A');
  });

  test('case-insensitive + trim match on NPI name', () => {
    const rows = buildLeadTimeMaterialsTable([mat('  mat-a ')], LIB, ST, 1000);
    assert.equal(rows[0].moq_m2, 500);
  });

  test('Cpx flatten across subproducts (parent concatenates per-SP)', () => {
    const sp1 = buildLeadTimeMaterialsTable([mat('MAT-A')], LIB, ST, 1000, { spCode: 'SP1' });
    const sp2 = buildLeadTimeMaterialsTable([mat('NOPE')], LIB, ST, 1000, { spCode: 'SP2' });
    const all = [...sp1, ...sp2];
    assert.equal(all.length, 2);
    assert.equal(all[0].row_label, 'SP1 · Main.Mat');
    assert.equal(all[1].row_label, 'SP2 · Main.Mat');
  });

  test('purity: does not mutate inputs', () => {
    const rows = [mat('MAT-A')];
    const snap = JSON.parse(JSON.stringify(rows));
    const libSnap = JSON.parse(JSON.stringify(LIB));
    buildLeadTimeMaterialsTable(rows, LIB, ST, 1000);
    assert.deepEqual(rows, snap, 'materials untouched');
    assert.deepEqual(LIB, libSnap, 'lib untouched');
  });

  test('non-array materials / missing lib → []', () => {
    assert.deepEqual(buildLeadTimeMaterialsTable(null, LIB, ST, 1000), []);
    assert.deepEqual(buildLeadTimeMaterialsTable([mat('MAT-A')], null, ST, 1000)[0].moq_m2, null);
  });
});
