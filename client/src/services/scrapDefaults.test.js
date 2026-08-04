import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKCENTER_SCRAP_DEFAULTS,
  defaultScrapForWorkcenter,
  resolveScrapOnWorkcenterChange,
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
