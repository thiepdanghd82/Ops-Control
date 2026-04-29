/**
 * Regression guard (Sprint AA) — budget-cap the number of native
 * `<input type="number">` usages per file in cost tab sources.
 *
 * Why: Sprint Y replaced ~50 native number inputs with DecimalInput
 * because `<input type="number"> + parseFloat(e.target.value) || 0`
 * has three well-documented bugs (see DecimalInput.jsx header). If a
 * future PR re-introduces the pattern — either copy-paste from old
 * code or unfamiliarity with DecimalInput — we want CI to catch it,
 * not a customer report of "I can't type 0.1".
 *
 * Strategy: lock the CURRENT per-file count as an upper bound. A file
 * can stay at/below its budget but not exceed. If a dev genuinely needs
 * a new native number input (integer-only field with no decimal concern),
 * they must bump the budget here, which forces a code review of whether
 * DecimalInput would have been the better choice.
 *
 * Budgets reflect legitimate remaining uses:
 *   - Integer-only fields (min=1, min=0 integers): repeat, layout, clicks
 *   - Integer-percent fields that divide by 100 in the handler: area_pct,
 *     efficiency, scrap_pct
 *   - Auto-fill-override fields with computed defaults: pitch_ovr, width,
 *     cavities
 *   - Library tabs (LibRate, LibFinance, etc.) still on legacy pattern —
 *     not user-reported as broken yet.
 *
 * When InkCalculator / library tabs get swept, drop their budgets here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TABS_ROOT = path.join(__dirname, '..', 'modules', 'cost', 'tabs');

// Per-file hard upper bound. Keys are paths relative to tabs/.
// If a file is not listed, its budget is 0 — net-new files can't
// introduce native number inputs without being whitelisted here.
const BUDGETS = {
  'InkCalculator.jsx':               2,  // Sprint AD: swept; 2 readonly `calc_vol`/`vol_recipe` remain
  'ComplexCalc/SubProductRow.jsx':   6,  // Sprint AF: pitch_ovr/width/cavities/offcut_pct swept; area_pct/efficiency/scrap_pct/clicks/repeat/layout remain (int-percent × /100 or min=1 integer)
  'StandardCalc/CalcProcesses.jsx':  4,
  'StandardCalc/CalcMaterials.jsx':  4,
  'LibRate.jsx':                     0,  // Sprint AE: swept
  'StandardCalc/CalcPackingShip.jsx': 3,
  'StandardCalc/CalcInks.jsx':       2,
  'StandardCalc/CalcHeader.jsx':     0,  // Sprint AT: DecimalInput + explicit ⟲ revert button preserves null-vs-0 distinction
  'ComplexCalc/ComplexCalc.jsx':     2,
  'StandardCalc/ProcessBalancing.jsx': 0,  // Sprint AG: swept
  'MaterialLibrary.jsx':             0,  // Sprint AG: Field wrapper delegates to DecimalInput
  'LibFinance.jsx':                  0,  // Sprint AE: swept
  'LibDDL.jsx':                      0,  // Sprint AE: swept
  'FormalQuotation.jsx':             0,  // Sprint AG: swept
  'ComplexCalc/BomTreeView.jsx':     1,  // BOM qty is integer (step=1), no decimal-input bug
  'RFQTracker.jsx':                  1,  // stage.sla_days is integer days (step=1), no decimal-input bug
  'SampleTracking.jsx':              1,  // stage.sla_days is integer days (step=1), no decimal-input bug
  'StandardCalc/MachineProfileModal.jsx': 7,  // admin CRUD form — integer/locale-free fields; no decimal-input bug
  'MachineTechnicalTab.jsx':             1,  // single integer input (FieldInput for *_mm fields) — admin CRUD, not pricing input
};

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith('.jsx')) out.push(p);
  }
  return out;
}

/**
 * Strip comments only (NOT string literals — we need string literals
 * intact so `type="number"` in legit JSX matches). A rationale comment
 * that happens to mention the pattern won't falsely trip the budget.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

function countPattern(src, pattern) {
  const m = stripComments(src).match(pattern);
  return m ? m.length : 0;
}

test('native <input type="number"> stays within per-file budget', () => {
  const files = walk(TABS_ROOT);
  const violations = [];
  for (const file of files) {
    const rel = path.relative(TABS_ROOT, file).replace(/\\/g, '/');
    const src = fs.readFileSync(file, 'utf-8');
    const count = countPattern(src, /<input\s+[^>]*type="number"/g);
    const budget = BUDGETS[rel] ?? 0;
    if (count > budget) {
      violations.push(`${rel}: ${count} (budget ${budget}) — prefer <DecimalInput> for decimals`);
    }
  }
  assert.deepEqual(violations, [],
    `Native number-input budget exceeded. Either replace with <DecimalInput> or raise the budget in decimalInputBudget.lint.test.js:\n  ${violations.join('\n  ')}`);
});

test('budget entries all point to real files', () => {
  // If a file is deleted/renamed, its leftover budget entry rots
  // silently. This test keeps BUDGETS honest so it stays a useful map.
  const stale = [];
  for (const rel of Object.keys(BUDGETS)) {
    const abs = path.join(TABS_ROOT, rel);
    if (!fs.existsSync(abs)) stale.push(rel);
  }
  assert.deepEqual(stale, [],
    `BUDGETS contains paths that no longer exist — remove them:\n  ${stale.join('\n  ')}`);
});
