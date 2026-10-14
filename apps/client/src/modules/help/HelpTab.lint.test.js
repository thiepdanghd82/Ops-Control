/**
 * Source-level guard for the Help tab's bilingual rendering.
 *
 * Help entries live in src/help/content.js as { en, vi } pairs — they
 * can't move into STRINGS because the offline Word export reads the same
 * file. Until 2026-09-14 the renderer stacked BOTH halves of every pair,
 * and `asText()` returned `vi || en`, so English users read Vietnamese
 * formula names. One language renders now; this test fails if either
 * regression returns.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const jsx = fs.readFileSync(path.join(here, 'HelpTab.jsx'), 'utf8');
const css = fs.readFileSync(path.join(here, 'HelpTab.css'), 'utf8');

test('no stacked-twin markup remains', () => {
  const twins = [
    'help-bi-en',
    'help-bi-vi',
    'help-title-en',
    'help-title-vi',
    'help-index-en',
    'help-index-vi',
    'help-index-section-en',
    'help-col-en',
    'help-caption-vi',
    'help-procedure-en',
    'help-procedure-note-vi',
    'help-related-en',
    'help-empty-vi',
  ];
  for (const cls of twins) {
    assert.ok(!jsx.includes(cls), `class "${cls}" still rendered`);
    assert.ok(!css.includes(cls), `class "${cls}" still styled`);
  }
});

test('no "EN · VI" copy is concatenated into a single literal', () => {
  // The old pattern joined both languages into one string: "Path · Đường
  // dẫn", "Note · Lưu ý:". Strip JSX expressions first — a `·` that only
  // separates two `{...}` values (the version pill) is a plain separator,
  // not a translation pair. What's left is literal copy the user reads.
  const stripExpressions = (line) => {
    let out = line;
    for (;;) {
      const next = out.replace(/\{[^{}]*\}/g, ' ');
      if (next === out) return next;
      out = next;
    }
  };
  const offenders = [];
  for (const line of jsx.split('\n')) {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    const text = stripExpressions(line);
    if (/[A-Za-zÀ-ỹ]{3,}[^·\n]*·[^·\n]*[A-Za-zÀ-ỹ]{3,}/.test(text)) offenders.push(line.trim());
  }
  assert.deepEqual(offenders, []);
});

test('asText picks by locale rather than defaulting to Vietnamese', () => {
  assert.ok(!/return v\.vi \|\| v\.en/.test(jsx), 'asText still hard-codes vi-first');
  assert.ok(
    /function asText\(v, locale\)/.test(jsx),
    'asText must take the locale it resolves against'
  );
  assert.ok(
    /pickLang\(locale, v\.en, v\.vi\)/.test(jsx),
    'asText must resolve through pickLang(locale, en, vi)'
  );
  // Every call site must pass the locale through.
  const bare = [...jsx.matchAll(/asText\(([^)]*)\)/g)]
    .map((m) => m[1])
    .filter((args) => args && !args.includes('locale') && !args.startsWith('v,'));
  assert.deepEqual(bare, []);
});

test('search still matches BOTH languages', () => {
  // A Vietnamese operator must still find an English field name, so the
  // haystack keeps both halves even though only one is displayed.
  assert.ok(/v\.en/.test(jsx) && /v\.vi/.test(jsx), 'flatten() must read both halves');
  assert.ok(
    /\$\{g\.term\} \$\{g\.en\} \$\{g\.vi\}/.test(jsx),
    'glossary filter must search both halves'
  );
});
