import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKCENTER_SCRAP_DEFAULTS,
  defaultScrapForWorkcenter,
  resolveScrapOnWorkcenterChange,
  resetProcessesScrap,
} from './scrapDefaults.js';

test('WORKCENTER_SCRAP_DEFAULTS — only FQC carries a non-zero default', () => {
  assert.deepEqual(WORKCENTER_SCRAP_DEFAULTS, { FQC: 0.1 });
});

test('defaultScrapForWorkcenter — FQC is 0.10, case-insensitive', () => {
  assert.equal(defaultScrapForWorkcenter('FQC'), 0.1);
  assert.equal(defaultScrapForWorkcenter('fqc'), 0.1);
  assert.equal(defaultScrapForWorkcenter('Fqc'), 0.1);
  assert.equal(defaultScrapForWorkcenter('  fqc  '), 0.1, 'trims surrounding space');
});

test('defaultScrapForWorkcenter — every other workcenter (and empty) is 0', () => {
  assert.equal(defaultScrapForWorkcenter(''), 0);
  assert.equal(defaultScrapForWorkcenter(null), 0);
  assert.equal(defaultScrapForWorkcenter(undefined), 0);
  assert.equal(defaultScrapForWorkcenter('SS'), 0);
  assert.equal(defaultScrapForWorkcenter('Flexo'), 0);
  assert.equal(defaultScrapForWorkcenter('Indigo6800'), 0);
});

test('resolveScrapOnWorkcenterChange — set FQC from empty default → auto-fill 0.10', () => {
  const r = resolveScrapOnWorkcenterChange('', 'FQC', 0);
  assert.deepEqual(r, { changed: true, value: 0.1 });
});

test('resolveScrapOnWorkcenterChange — set FQC when scrap is null → auto-fill 0.10', () => {
  const r = resolveScrapOnWorkcenterChange('', 'FQC', null);
  assert.deepEqual(r, { changed: true, value: 0.1 });
});

test('resolveScrapOnWorkcenterChange — FQC → other workcenter resets auto 0.10 → 0', () => {
  const r = resolveScrapOnWorkcenterChange('FQC', 'SS', 0.1);
  assert.deepEqual(r, { changed: true, value: 0 });
});

test('resolveScrapOnWorkcenterChange — FQC → empty (process-type clear) resets 0.10 → 0', () => {
  const r = resolveScrapOnWorkcenterChange('FQC', '', 0.1);
  assert.deepEqual(r, { changed: true, value: 0 });
});

test('resolveScrapOnWorkcenterChange — NEVER clobber an operator-typed scrap (FQC away)', () => {
  // Operator typed 0.15 on an FQC row, then switches workcenter — keep 0.15.
  const r = resolveScrapOnWorkcenterChange('FQC', 'SS', 0.15);
  assert.deepEqual(r, { changed: false, value: 0.15 });
});

test('resolveScrapOnWorkcenterChange — NEVER clobber an operator-typed scrap (into FQC)', () => {
  // Operator typed 0.05 on a non-FQC row, then switches to FQC — keep 0.05.
  const r = resolveScrapOnWorkcenterChange('SS', 'FQC', 0.05);
  assert.deepEqual(r, { changed: false, value: 0.05 });
});

test('resolveScrapOnWorkcenterChange — non-FQC → non-FQC with 0 scrap is a no-op', () => {
  const r = resolveScrapOnWorkcenterChange('SS', 'Flexo', 0);
  assert.deepEqual(r, { changed: false, value: 0 });
});

test('resolveScrapOnWorkcenterChange — re-selecting FQC when already auto 0.10 is a no-op', () => {
  const r = resolveScrapOnWorkcenterChange('FQC', 'FQC', 0.1);
  assert.deepEqual(r, { changed: false, value: 0.1 });
});

test('resolveScrapOnWorkcenterChange — case-insensitive FQC on both sides', () => {
  assert.deepEqual(resolveScrapOnWorkcenterChange('', 'fqc', 0), { changed: true, value: 0.1 });
  assert.deepEqual(resolveScrapOnWorkcenterChange('fqc', 'ss', 0.1), { changed: true, value: 0 });
});

test('resetProcessesScrap — full reset by workcenter default, FQC → 0.10 else 0', () => {
  const src = [
    { workcenter: 'SS(Sheet)', scrap_pct: 0.03, speed: 150 },
    { workcenter: 'FQC', scrap_pct: 0.03 },
    { workcenter: 'fqc', scrap_pct: 0.25 }, // case-insensitive, still 0.10
    { workcenter: '', scrap_pct: 0.03 },
  ];
  const out = resetProcessesScrap(src);
  assert.equal(out[0].scrap_pct, 0);
  assert.equal(out[1].scrap_pct, 0.1);
  assert.equal(out[2].scrap_pct, 0.1);
  assert.equal(out[3].scrap_pct, 0);
});

test('resetProcessesScrap — overrides even a manual value (deliberate, unlike wc-change)', () => {
  const out = resetProcessesScrap([{ workcenter: 'SS', scrap_pct: 0.42 }]);
  assert.equal(out[0].scrap_pct, 0);
});

test('resetProcessesScrap — preserves other row fields', () => {
  const out = resetProcessesScrap([
    { workcenter: 'FQC', scrap_pct: 0.03, speed: 588, label: 'Process 9', setup_h: 0.25 },
  ]);
  assert.deepEqual(out[0], {
    workcenter: 'FQC',
    scrap_pct: 0.1,
    speed: 588,
    label: 'Process 9',
    setup_h: 0.25,
  });
});

test('resetProcessesScrap — null/empty-safe, returns a NEW array (immutability)', () => {
  assert.deepEqual(resetProcessesScrap(null), []);
  assert.deepEqual(resetProcessesScrap(undefined), []);
  assert.deepEqual(resetProcessesScrap([]), []);
  const src = [{ workcenter: 'SS', scrap_pct: 0.03 }];
  const out = resetProcessesScrap(src);
  assert.notEqual(out, src, 'new array');
  assert.notEqual(out[0], src[0], 'new row object');
  assert.equal(src[0].scrap_pct, 0.03, 'source unmutated');
});

test('resetProcessesScrap — tolerates a null row in the array', () => {
  const out = resetProcessesScrap([null, { workcenter: 'FQC', scrap_pct: 0 }]);
  assert.equal(out[0], null);
  assert.equal(out[1].scrap_pct, 0.1);
});
