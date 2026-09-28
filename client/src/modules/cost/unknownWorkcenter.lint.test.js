/**
 * Both process grids must SHOW a row's stored workcenter even when today's Rate
 * Table no longer lists it, and mark it with the validator's own rule.
 *
 * The workcenter cell is a <select> of today's names, and a <select> whose value
 * matches no option renders blank — so an obsolete `FB` looked like no workcenter
 * at all while calcProcess costed it as hand labour (2026-09-28: RFQ-2026-S0002
 * went to GM −238% on a save). Standard and Complex are twins (Lesson 48): both
 * import ONE `unknownWorkcenter`, so the red cell and the WarningBar cannot
 * disagree about which rows are unknown.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const code = (rel) =>
  readFileSync(path.join(HERE, rel), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l))
    .join('\n');

const GRIDS = [
  { name: 'Standard grid', file: 'tabs/StandardCalc/CalcProcesses.jsx', row: 'proc' },
  { name: 'Complex grid', file: 'tabs/ComplexCalc/SubProductRow.jsx', row: 'p' },
];

for (const g of GRIDS) {
  const src = code(g.file);

  test(`${g.name}: uses the validator's unknownWorkcenter, not a copy of it`, () => {
    assert.match(
      src,
      /import\s*\{[^}]*\bunknownWorkcenter\b[^}]*\}\s*from\s*'[^']*calcValidation(\.js)?'/
    );
    assert.match(src, new RegExp(`unknownWorkcenter\\(\\s*${g.row}\\.workcenter,`));
  });

  test(`${g.name}: an unknown workcenter's cell is marked and explains itself`, () => {
    assert.match(src, /wcUnknown \? ' sc-input-warn' : ''/);
    assert.match(src, /t\('cgrid\.proc\.wc_unknown'/);
  });

  test(`${g.name}: the stored workcenter is listed even when today's names lack it`, () => {
    assert.match(src, new RegExp(`!wcOpts\\.includes\\(${g.row}\\.workcenter\\)`));
  });
}
