/**
 * Both process grids must SHOW a row's stored tool type even when today's tool
 * list no longer offers it, and mark a row whose tool has no life with the
 * validator's own rule.
 *
 * The tool-type cell is a <select> of today's names, and a <select> whose value
 * matches no option shows its first — `--` — so 114 live rows typed `Knife`,
 * `Jig` or `Pinnacle Die` looked untyped (Lesson 55). Most of them price
 * correctly on their own tool life, so only a row that carries a tool with no
 * life anywhere is marked: re-picking the type overwrites the row's life from
 * the list, so a mark on every old name would invite changes to correct quotes.
 * Standard and Complex are twins (Lesson 48): both import ONE `toolLifeMissing`,
 * so the red cell and the WarningBar cannot disagree about which rows it is.
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

  test(`${g.name}: uses the validator's toolLifeMissing, not a copy of it`, () => {
    assert.match(
      src,
      /import\s*\{[^}]*\btoolLifeMissing\b[^}]*\}\s*from\s*'[^']*calcValidation(\.js)?'/
    );
    assert.match(src, new RegExp(`toolLifeMissing\\(\\s*${g.row},`));
  });

  test(`${g.name}: a tool with no life is marked and explains itself`, () => {
    assert.match(src, /toolNoLife \? ' sc-input-warn' : ''/);
    assert.match(src, /t\('cgrid\.proc\.tool_life_missing'/);
  });

  test(`${g.name}: the stored tool type is listed even when today's list lacks it`, () => {
    assert.match(src, new RegExp(`!toolTypeOpts\\.includes\\(${g.row}\\.tool_type\\)`));
  });
}
