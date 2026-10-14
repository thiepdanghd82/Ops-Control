// @ts-check
/**
 * DDL editor: which card draws each section (2026-10-08).
 *
 * `core_od` is an object on every site and the editor drew nothing for it:
 * the key/value card took only objects named in a hand-kept allowlist, and
 * anything else fell through to `return null`. ddlCardKind is now the one
 * decision, so a section the data carries cannot vanish. Runner:
 *   node --test src/modules/cost/tabs/ddlCardKind.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ddlCardKind } from './ddlEntryHelpers.js';

// The VN site's sections as the live ddl_sites.json stores them (2026-10-08),
// values shortened — copied from the data, not written from the reader
// (Lesson 56). `print`, `npi_design_owner` and `_custom_names` are skipped
// before any card is chosen, so they are left out. The `"1.5"""` keys are in
// the data as shown.
const VN = {
  _custom_sections: ['custom_print_plate_cost', 'custom_cutter_cost'],
  trade_mode: ['RMB', 'USD(Normal)'],
  semi_product_code: ['SP A', 'SP B'],
  pre_cut: ['Slit', 'Laminate(Roll)'],
  die_cut: ['PP cut part', 'PP Emboss'],
  print_type_list: ['SS(Sheet)', 'SS(Sheet Glue)'],
  assembly: ['Manual ASY (laminate)'],
  special_cut: ['Laser', 'Forming'],
  inspection: ['AOI (AVT)', 'AOI(Pulisi)'],
  manual_work: ['Manual folding', 'Removal waste tape'],
  others: ['DieCut(Subcon)', 'Other(Subcon)'],
  print_type: ['SS', 'SS(Glue)'],
  packing_method: ['Roll India', 'Sheet'],
  tool_type: ['Knife/ Wood', 'Etching/ Pinnacle Die'],
  site: ['41 RDC', '41 Flexo'],
  core_size: ['"1.5"""', '"3"""'],
  npi_owner: ['Lee', 'Kaka (Nam)'],
  quoted_status: ['Blocked', 'Pending'],
  row: ['Main.Mat', 'Process Mat'],
  process_design: ['Flexo', 'Indigo'],
  coverage: [
    { pt: 'SS', cov: 30 },
    { pt: 'SS(Glue)', cov: 20 },
  ],
  tool_life: { 'Knife/ Wood': 20000, 'Etching/ Pinnacle Die': 20000 },
  click_charges: { 1: 0.030036, 2: 0.0074 },
  core_od: { '"1.5"""': 40, '"3"""': 80, '"6"""': 160 },
  custom_print_plate_cost: [
    { k: 'Letter press', v: '80' },
    { k: 'Flexo', v: '340' },
  ],
  custom_cutter_cost: [],
  cutter_cost: { 'Knife/ Wood': '70', 'Etching/ Pinnacle Die': '120' },
  plate_base_cost: { 'Letter Press': 80, Flexo: 340 },
  cutter_addon: { 'Knife/ Wood': '', 'Etching/ Pinnacle Die': 40 },
  cutter_min: { 'Knife/ Wood': 25, 'Etching/ Pinnacle Die': 100 },
};

test('core_od, an object on every site, is drawn by the key/value card', () => {
  assert.equal(ddlCardKind('core_od', VN.core_od, VN), 'object');
});

test('every section the site carries gets a card', () => {
  const sections = Object.keys(VN).filter((k) => !k.startsWith('_'));
  const undrawn = sections.filter((k) => ddlCardKind(k, VN[k], VN) === null);
  assert.deepEqual(undrawn, []);
});

test('the sections with a card of their own keep it', () => {
  assert.equal(ddlCardKind('coverage', VN.coverage, VN), 'coverage');
  assert.equal(ddlCardKind('custom_print_plate_cost', VN.custom_print_plate_cost, VN), 'custom');
  assert.equal(ddlCardKind('custom_cutter_cost', VN.custom_cutter_cost, VN), 'custom');
  for (const key of ['tool_life', 'cutter_cost', 'cutter_addon', 'cutter_min']) {
    assert.equal(ddlCardKind(key, VN[key], VN), key, key);
  }
  assert.equal(ddlCardKind('click_charges', VN.click_charges, VN), 'object');
  assert.equal(ddlCardKind('plate_base_cost', VN.plate_base_cost, VN), 'object');
  assert.equal(ddlCardKind('trade_mode', VN.trade_mode, VN), 'list');
});

test('a value no card can draw gets none', () => {
  for (const v of [null, undefined, 3, 'text']) {
    assert.equal(ddlCardKind('x', v, VN), null, String(v));
  }
});

// The editor must decide through ddlCardKind: a tested helper the JSX never
// calls proves nothing (Lesson 45). There is no React test infrastructure
// here, so the source is checked, code lines only (Lesson 46).
test('LibDDL picks every card through ddlCardKind, with no allowlist of object sections', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const code = readFileSync(path.join(here, 'LibDDL.jsx'), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
  assert.ok(/ddlCardKind\(key, value, sections\)/.test(code), 'LibDDL must call ddlCardKind');
  assert.ok(!/OBJECT_KEYS/.test(code), 'a hand-kept allowlist is what dropped core_od');
});
