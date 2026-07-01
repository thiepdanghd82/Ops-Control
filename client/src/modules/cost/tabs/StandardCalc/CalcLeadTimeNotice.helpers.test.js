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
import * as helpersNs from './CalcLeadTimeNotice.helpers.js';
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
      { name: 'MAT-A', moq: 500, type: 'PET 50um', lt: 30 },
      { name: 'MAT-ZERO-MOQ', moq: 0, type: 'X', lt: 12 },
      { name: 'NPI-ONLY-LT', moq: 100, type: 'Y', lt: 20 },
    ],
    ifs: [
      { part_no: 'MAT-A', leadtime: 45 }, // both match → max(30,45) = 45
      { part_no: 'IFS-ONLY-LT', leadtime: 18 },
      { part_no: 'IFS-ZERO', leadtime: 0 },
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

  // ── Leadtime column (synced from NPI `lt` + IFS `leadtime`) ──
  test('leadtime: BOTH libraries match → max(npi.lt, ifs.leadtime)', () => {
    // MAT-A: npi.lt 30, ifs.leadtime 45 → 45
    assert.equal(buildLeadTimeMaterialsTable([mat('MAT-A')], LIB, ST, 1000)[0].leadtime, 45);
  });

  test('leadtime: NPI only → npi.lt', () => {
    assert.equal(buildLeadTimeMaterialsTable([mat('NPI-ONLY-LT')], LIB, ST, 1000)[0].leadtime, 20);
  });

  test('leadtime: IFS only → ifs.leadtime', () => {
    assert.equal(buildLeadTimeMaterialsTable([mat('IFS-ONLY-LT')], LIB, ST, 1000)[0].leadtime, 18);
  });

  test('leadtime: no match → null; zero/non-finite ignored', () => {
    assert.equal(buildLeadTimeMaterialsTable([mat('NOPE')], LIB, ST, 1000)[0].leadtime, null);
    // IFS-ZERO leadtime 0 (no NPI) → filtered out → null
    assert.equal(buildLeadTimeMaterialsTable([mat('IFS-ZERO')], LIB, ST, 1000)[0].leadtime, null);
  });

  test('leadtime: case-insensitive + trim match on both libraries', () => {
    assert.equal(buildLeadTimeMaterialsTable([mat('  mat-a ')], LIB, ST, 1000)[0].leadtime, 45);
    assert.equal(
      buildLeadTimeMaterialsTable([mat(' ifs-only-lt ')], LIB, ST, 1000)[0].leadtime,
      18
    );
  });

  test('column order: leadtime immediately before qpa_m2; other fields unchanged', () => {
    const r = buildLeadTimeMaterialsTable([mat('MAT-A')], LIB, ST, 1000)[0];
    const keys = Object.keys(r);
    assert.equal(keys.indexOf('qpa_m2') - keys.indexOf('leadtime'), 1, 'leadtime just before qpa');
    // no regression on existing fields
    assert.equal(r.moq_m2, 500);
    assert.equal(r.type, 'PET 50um');
    assert.ok(close(r.clear_pcs, 500 / QPA));
  });
});

describe('REMARK checkbox-driven auto-sync', () => {
  const {
    buildRemarkFromSelection,
    resolveRemarkDisplay,
    remarkSelectAllState,
    toggleRemarkSelection,
    setAllRemarkSelection,
    isRemarkRowSelected,
    formatThousands,
  } = helpersNs;

  const ROWS = [
    { ifs_code: 'MAT-A', clear_pcs: 269191 },
    { ifs_code: 'MAT-B', clear_pcs: null }, // no clear → "—"
    { ifs_code: '', clear_pcs: 100 }, // blank code → excluded
    { ifs_code: 'MAT-C', clear_pcs: 1899409 },
  ];

  test('formatThousands rounds + separates; non-finite → "—"', () => {
    assert.equal(formatThousands(269191.4), '269,191');
    assert.equal(formatThousands(68.6), '69');
    assert.equal(formatThousands(NaN), '—');
  });

  test('all checked (default {}) → one "- " line per coded row, in order', () => {
    assert.equal(
      buildRemarkFromSelection(ROWS, {}),
      '- MAT-A: 269,191 pcs\n- MAT-B: —\n- MAT-C: 1,899,409 pcs'
    );
  });

  test('uncheck a row → its line disappears', () => {
    assert.equal(
      buildRemarkFromSelection(ROWS, { 'MAT-A': false }),
      '- MAT-B: —\n- MAT-C: 1,899,409 pcs'
    );
  });

  test('clear_pcs null → "- <code>: —"', () => {
    assert.equal(buildRemarkFromSelection([{ ifs_code: 'X', clear_pcs: null }], {}), '- X: —');
  });

  test('blank-code rows excluded even when others checked', () => {
    const only = buildRemarkFromSelection([{ ifs_code: '  ', clear_pcs: 5 }], {});
    assert.equal(only, '');
  });

  test('isRemarkRowSelected: default true; false mask unchecks', () => {
    assert.equal(isRemarkRowSelected({}, 'MAT-A'), true);
    assert.equal(isRemarkRowSelected({ 'MAT-A': false }, 'MAT-A'), false);
    assert.equal(isRemarkRowSelected(null, 'MAT-A'), true);
  });

  test('toggleRemarkSelection: check→uncheck sets false; uncheck→check deletes key', () => {
    assert.deepEqual(toggleRemarkSelection({}, 'MAT-A'), { 'MAT-A': false });
    assert.deepEqual(toggleRemarkSelection({ 'MAT-A': false }, 'MAT-A'), {});
  });

  test('setAllRemarkSelection: checked → {} (all); unchecked → all coded keys false', () => {
    assert.deepEqual(setAllRemarkSelection(ROWS, true), {});
    assert.deepEqual(setAllRemarkSelection(ROWS, false), {
      'MAT-A': false,
      'MAT-B': false,
      'MAT-C': false,
    });
  });

  test('remarkSelectAllState: all / partial / none', () => {
    assert.deepEqual(remarkSelectAllState(ROWS, {}), {
      total: 3,
      selected: 3,
      checked: true,
      indeterminate: false,
    });
    assert.deepEqual(remarkSelectAllState(ROWS, { 'MAT-A': false }), {
      total: 3,
      selected: 2,
      checked: false,
      indeterminate: true,
    });
    assert.deepEqual(remarkSelectAllState(ROWS, setAllRemarkSelection(ROWS, false)), {
      total: 3,
      selected: 0,
      checked: false,
      indeterminate: false,
    });
  });

  test('resolveRemarkDisplay: override wins; empty override → auto', () => {
    assert.deepEqual(resolveRemarkDisplay({ lt_remark_ovr: 'my note' }, 'AUTO'), {
      value: 'my note',
      isOverride: true,
    });
    assert.deepEqual(resolveRemarkDisplay({ lt_remark_ovr: '' }, 'AUTO'), {
      value: 'AUTO',
      isOverride: false,
    });
    assert.deepEqual(resolveRemarkDisplay(null, 'AUTO'), { value: 'AUTO', isOverride: false });
  });

  test('override stops auto-sync: changing selection does not alter displayed remark', () => {
    const lt = { lt_remark_ovr: 'manual' };
    const autoA = buildRemarkFromSelection(ROWS, {});
    const autoB = buildRemarkFromSelection(ROWS, { 'MAT-A': false });
    assert.equal(resolveRemarkDisplay(lt, autoA).value, 'manual');
    assert.equal(resolveRemarkDisplay(lt, autoB).value, 'manual'); // unchanged
  });
});

describe('buildRemarkBlock — header + bullets + editable Product tolerance footer', () => {
  const { buildRemarkBlock, resolveRemarkDisplay, safeLeadTime, REMARK_MOQ_HEADER } = helpersNs;

  const ROWS = [
    { ifs_code: 'MAT-A', clear_pcs: 269191 },
    { ifs_code: 'MAT-C', clear_pcs: 1899409 },
  ];

  test('header constant is "1. Clear materials MOQ."', () => {
    assert.equal(REMARK_MOQ_HEADER, '1. Clear materials MOQ.');
  });

  test('footer reads the field: "0.2" → "+/- 0.2mm"', () => {
    assert.equal(
      buildRemarkBlock([], {}, '0.2'),
      '1. Clear materials MOQ.\n2. Product tolerance: +/- 0.2mm'
    );
  });

  test('footer reads the field: "0.15" → "+/- 0.15mm"', () => {
    assert.equal(
      buildRemarkBlock([], {}, '0.15'),
      '1. Clear materials MOQ.\n2. Product tolerance: +/- 0.15mm'
    );
  });

  test('empty / null / whitespace tolerance → default "0.2"', () => {
    const expected = '1. Clear materials MOQ.\n2. Product tolerance: +/- 0.2mm';
    assert.equal(buildRemarkBlock([], {}, ''), expected);
    assert.equal(buildRemarkBlock([], {}, null), expected);
    assert.equal(buildRemarkBlock([], {}, undefined), expected);
    assert.equal(buildRemarkBlock([], {}, '   '), expected);
  });

  test('tolerance is trimmed: "  0.25  " → "+/- 0.25mm"', () => {
    assert.equal(
      buildRemarkBlock([], {}, '  0.25  '),
      '1. Clear materials MOQ.\n2. Product tolerance: +/- 0.25mm'
    );
  });

  test('full block: header + "- " bullets (ceil, thousands) + tolerance footer', () => {
    assert.equal(
      buildRemarkBlock(ROWS, {}, '0.2'),
      '1. Clear materials MOQ.\n' +
        '- MAT-A: 269,191 pcs\n' +
        '- MAT-C: 1,899,409 pcs\n' +
        '2. Product tolerance: +/- 0.2mm'
    );
  });

  test('unchecking a row drops its bullet but keeps header + footer', () => {
    assert.equal(
      buildRemarkBlock(ROWS, { 'MAT-A': false }, '0.2'),
      '1. Clear materials MOQ.\n- MAT-C: 1,899,409 pcs\n2. Product tolerance: +/- 0.2mm'
    );
  });

  test('changing tolerance regenerates auto block WITHOUT setting override', () => {
    const lt = safeLeadTime({ product_tolerance: '0.2' }); // no lt_remark_ovr
    const autoA = buildRemarkBlock(ROWS, {}, lt.product_tolerance);
    const dispA = resolveRemarkDisplay(lt, autoA);
    assert.equal(dispA.isOverride, false, 'still AUTO');
    // Operator edits tolerance → new field value, still no override.
    const lt2 = safeLeadTime({ ...lt, product_tolerance: '0.35' });
    const autoB = buildRemarkBlock(ROWS, {}, lt2.product_tolerance);
    const dispB = resolveRemarkDisplay(lt2, autoB);
    assert.equal(dispB.isOverride, false, 'tolerance edit does not override');
    assert.match(dispB.value, /\+\/- 0\.35mm$/);
    assert.notEqual(dispA.value, dispB.value, 'footer regenerated in place');
  });

  test('manual override precedence: tolerance edits do NOT override typed REMARK', () => {
    const lt = safeLeadTime({ lt_remark_ovr: 'hand-typed note', product_tolerance: '0.15' });
    const auto = buildRemarkBlock(ROWS, {}, lt.product_tolerance);
    const disp = resolveRemarkDisplay(lt, auto);
    assert.equal(disp.isOverride, true);
    assert.equal(disp.value, 'hand-typed note', 'override text wins over the auto block');
  });

  test('heal-on-read: legacy state without product_tolerance → "0.2"', () => {
    const healed = safeLeadTime({ lt_material: '', lt_remark: '' });
    assert.equal(healed.product_tolerance, '0.2');
  });

  test('heal-on-read: present tolerance preserved; operator-cleared "" preserved', () => {
    assert.equal(safeLeadTime({ product_tolerance: '0.15' }).product_tolerance, '0.15');
    assert.equal(safeLeadTime({ product_tolerance: '' }).product_tolerance, '');
  });
});

describe('buildLeadTimeMaterialsTable — tolerant code↔library matcher (Lesson 32)', () => {
  const { normCode, resolveLibRow } = helpersNs;
  const ST = { num_webs: 1, processes: [], web_width_td: 100, sheet_length: 10, min_gap_md: 0 };
  const mat = (code) => ({
    row_type: 'Main.Mat',
    code,
    desc: `d-${code}`,
    width: 100,
    cavities: 1,
    pitch_ovr: 10,
    usage: 1,
  });
  const LIB = {
    npi: [
      { name: 'JKD PSC 701-10B-NT', moq: 1568, type: 'Matte black PET', lt: 30 }, // internal space
      { name: 'NITTO No 56301', moq: 100, type: 'Tape', lt: 12 }, // exact-only sibling
      { name: 'STAR50*', moq: 30, type: 'Star', lt: 5 }, // trailing *
      // Two spacing variants that both normalize to 'ambx1' — a code matching a
      // THIRD spacing ('AMB X 1') exact-matches neither → ambiguous.
      { name: 'AMB X1', moq: 10, type: 'a', lt: 3 },
      { name: 'AMBX 1', moq: 20, type: 'b', lt: 4 },
    ],
    // Same code as the NPI 'JKD PSC 701-10B-NT' but only a spacing difference
    // from the row code (normCode collapses it); leadtime 40 > NPI 30.
    ifs: [{ part_no: 'JKD PSC 701-10B-NT', leadtime: 40 }],
  };

  test('normCode: collapses spacing / dash / case / trailing *', () => {
    assert.equal(normCode('JKD PSC701-10B-NT'), 'jkdpsc701-10b-nt');
    assert.equal(normCode('JKD PSC 701-10B-NT'), 'jkdpsc701-10b-nt'); // internal space gone
    assert.equal(normCode('STAR50*'), 'star50');
    assert.equal(normCode('A–B'), 'a-b'); // en-dash → hyphen
    assert.equal(normCode('  Mixed Case  '), 'mixedcase');
  });

  test('JKD PSC701-10B-NT (no space) resolves NPI "JKD PSC 701-10B-NT" via fallback', () => {
    const r = buildLeadTimeMaterialsTable([mat('JKD PSC701-10B-NT')], LIB, ST, 1000)[0];
    assert.equal(r.moq_m2, 1568, 'MOQ from NPI');
    assert.equal(r.leadtime, 40, 'max(NPI 30, IFS 40) = 40');
    assert.equal(r.type, 'Matte black PET');
    assert.equal(r.resolved, true);
    assert.equal(r.fuzzy, true, 'flagged fuzzy (normalized fallback)');
    assert.equal(r.ambiguous, false);
    assert.ok(r.clear_pcs > 0);
  });

  test('exact matches still win and are NOT flagged fuzzy', () => {
    const r = buildLeadTimeMaterialsTable([mat('NITTO No 56301')], LIB, ST, 1000)[0];
    assert.equal(r.moq_m2, 100);
    assert.equal(r.fuzzy, false, 'exact → not fuzzy');
    assert.equal(r.resolved, true);
  });

  test('trailing "*" library name matches a plain code', () => {
    const r = buildLeadTimeMaterialsTable([mat('STAR50')], LIB, ST, 1000)[0];
    assert.equal(r.moq_m2, 30);
    assert.equal(r.leadtime, 5);
    assert.equal(r.fuzzy, true);
  });

  test('dash variant (hyphen vs en-dash) matches via normCode', () => {
    // resolveLibRow directly: code with en-dash vs part_no with hyphen
    const res = resolveLibRow([{ part_no: 'JKD-PSC701-10B-NT' }], 'part_no', 'JKD–PSC701-10B-NT');
    assert.equal(res.fuzzy, true);
    assert.ok(res.row);
  });

  test('AMBIGUITY: code normalizing to >1 distinct library rows → unresolved + flagged', () => {
    // 'AMB X 1' → normCode 'ambx1'; exact-matches neither 'AMB X1' nor 'AMBX 1'.
    const r = buildLeadTimeMaterialsTable([mat('AMB X 1')], LIB, ST, 1000)[0];
    assert.equal(r.ambiguous, true);
    assert.equal(r.resolved, false, 'not silently joined');
    assert.equal(r.moq_m2, null);
    assert.equal(r.leadtime, null);
    assert.equal(r.type, '');
  });

  test('no library match anywhere → unresolved, not fuzzy/ambiguous', () => {
    const r = buildLeadTimeMaterialsTable([mat('TOTALLY-UNKNOWN')], LIB, ST, 1000)[0];
    assert.equal(r.resolved, false);
    assert.equal(r.fuzzy, false);
    assert.equal(r.ambiguous, false);
    assert.equal(r.moq_m2, null);
  });

  test('resolveLibRow: exact wins over a would-be fuzzy sibling', () => {
    const rows = [
      { name: 'A B', moq: 1 },
      { name: 'AB', moq: 2 },
    ];
    // key "AB" exact-matches row 2 → not fuzzy, not ambiguous
    const res = resolveLibRow(rows, 'name', 'AB');
    assert.equal(res.row.moq, 2);
    assert.equal(res.fuzzy, false);
    assert.equal(res.ambiguous, false);
  });
});
