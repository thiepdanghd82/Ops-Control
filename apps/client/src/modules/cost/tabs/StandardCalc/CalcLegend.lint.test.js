/**
 * Source-level guard for CalcLegend's bilingual content.
 *
 * The Legend keeps its Vietnamese copy INLINE next to the English
 * (nameVi / noteVi / titleVi / bodyVi / vi=) and renders exactly one of
 * the pair per the active locale. Until 2026-09-14 it stacked both, and
 * a Formula without `nameVi` silently showed English in Vietnamese mode.
 * This test fails when either regression comes back.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'CalcLegend.jsx'), 'utf8');

// Walk from `<Tag` to the end of its opening tag, honouring quotes,
// template literals and `{}` nesting so a `/>` inside an expr template
// does not end the tag early.
function openingTags(tag) {
  const out = [];
  const re = new RegExp(`<${tag}\\b`, 'g');
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let depth = 0;
    let quote = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    const text = src.slice(m.index, i + 1);
    const line = src.slice(0, m.index).split('\n').length;
    out.push({ line, text });
  }
  return out;
}
const hasAttr = (tagText, name) => new RegExp(`\\s${name}=`).test(tagText);

test('every <Formula> carries nameVi, and noteVi whenever it has a note', () => {
  const bad = [];
  for (const { line, text } of openingTags('Formula')) {
    if (!hasAttr(text, 'nameVi')) bad.push(`${line}: missing nameVi`);
    if (hasAttr(text, 'note') && !hasAttr(text, 'noteVi')) bad.push(`${line}: note without noteVi`);
  }
  assert.deepEqual(bad, []);
});

test('every <Callout> with a title carries titleVi', () => {
  const bad = openingTags('Callout')
    .filter(({ text }) => hasAttr(text, 'title') && !hasAttr(text, 'titleVi'))
    .map(({ line }) => `${line}: title without titleVi`);
  assert.deepEqual(bad, []);
});

test('every <BiRow> / <BiHead> carries vi', () => {
  const bad = [...openingTags('BiRow'), ...openingTags('BiHead')]
    .filter(({ text }) => !hasAttr(text, 'vi'))
    .map(({ line }) => `${line}: missing vi`);
  assert.deepEqual(bad, []);
});

test('no stacked-twin markup or "EN · VI" concatenations remain', () => {
  const twins = ['cl-bi-vi', 'cl-bi-en', 'cl-toc-vi', 'cl-toc-en'];
  for (const cls of twins) assert.ok(!src.includes(cls), `class "${cls}" still present`);
  const concat = [
    'Ví dụ · Example',
    'Load this example · Nạp',
    'Press · Máy',
    'Net size · Net',
    'Die · Khuôn',
    'Ratio · Tỉ số',
    'Selling · Giá bán',
    'Reference · Hết tài liệu',
    'provenance · Xuất xứ',
    '/ Nguyên nhân',
    '/ Cách sửa',
    '/ Phòng ngừa',
  ];
  for (const s of concat) assert.ok(!src.includes(s), `bilingual literal "${s}" still present`);
});
