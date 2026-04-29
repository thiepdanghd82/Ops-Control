/**
 * importParse — CSV/Excel parser tests.
 *   node --test server/services/importParse.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSVContent } from './importParse.js';

test('CSV: comma-delimited basic', () => {
  const r = parseCSVContent('a,b,c\n1,2,3\n4,5,6');
  assert.deepEqual(r.headers, ['a', 'b', 'c']);
  assert.deepEqual(r.rows, [['1', '2', '3'], ['4', '5', '6']]);
  assert.equal(r.delimiter, ',');
});

test('CSV: CRLF line endings', () => {
  const r = parseCSVContent('a,b\r\n1,2\r\n3,4\r\n');
  assert.deepEqual(r.headers, ['a', 'b']);
  assert.deepEqual(r.rows, [['1', '2'], ['3', '4']]);
});

test('CSV: quoted fields with embedded delimiter', () => {
  const r = parseCSVContent('name,desc\n"Smith, John","hello"');
  assert.deepEqual(r.headers, ['name', 'desc']);
  assert.deepEqual(r.rows, [['Smith, John', 'hello']]);
});

test('CSV: doubled quotes inside quoted field', () => {
  const r = parseCSVContent('a\n"she said ""hi"""');
  assert.deepEqual(r.rows, [['she said "hi"']]);
});

test('CSV: multi-line quoted field', () => {
  const r = parseCSVContent('a,b\n"line1\nline2",end');
  assert.deepEqual(r.rows, [['line1\nline2', 'end']]);
});

test('CSV: semicolon delimiter detected from header', () => {
  const r = parseCSVContent('a;b;c\n1;2;3');
  assert.equal(r.delimiter, ';');
  assert.deepEqual(r.rows, [['1', '2', '3']]);
});

test('CSV: tab delimiter', () => {
  const r = parseCSVContent('a\tb\tc\n1\t2\t3');
  assert.equal(r.delimiter, '\t');
  assert.deepEqual(r.headers, ['a', 'b', 'c']);
});

test('CSV: pipe delimiter', () => {
  const r = parseCSVContent('a|b|c\n1|2|3');
  assert.equal(r.delimiter, '|');
});

test('CSV: UTF-8 BOM stripped', () => {
  const bom = '﻿';
  const r = parseCSVContent(bom + 'a,b\n1,2');
  assert.deepEqual(r.headers, ['a', 'b']);
});

test('CSV: empty rows filtered', () => {
  const r = parseCSVContent('a,b\n1,2\n\n\n3,4');
  assert.equal(r.rows.length, 2);
});

test('CSV: trailing whitespace in header trimmed', () => {
  const r = parseCSVContent('  Part No  ,Qty\nA,1');
  assert.deepEqual(r.headers, ['Part No', 'Qty']);
});

test('CSV: single column', () => {
  const r = parseCSVContent('header\n1\n2\n3');
  assert.deepEqual(r.headers, ['header']);
  assert.equal(r.rows.length, 3);
});

test('CSV: empty content', () => {
  const r = parseCSVContent('');
  assert.deepEqual(r.headers, []);
  assert.deepEqual(r.rows, []);
});
