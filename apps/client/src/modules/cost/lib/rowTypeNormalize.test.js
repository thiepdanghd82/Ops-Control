import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeRowType, isMainMat, isProcessMat } from './rowTypeNormalize.js';

describe('normalizeRowType', () => {
  test('canonical pass-through', () => {
    assert.equal(normalizeRowType('Main.Mat'), 'Main.Mat');
    assert.equal(normalizeRowType('Process Mat'), 'Process Mat');
  });

  test('legacy single-digit suffix', () => {
    assert.equal(normalizeRowType('Main.Mat 1'), 'Main.Mat');
    assert.equal(normalizeRowType('Process Mat 5'), 'Process Mat');
  });

  test('legacy multi-digit suffix', () => {
    assert.equal(normalizeRowType('Main.Mat 12'), 'Main.Mat');
    assert.equal(normalizeRowType('Process Mat 100'), 'Process Mat');
  });

  test('outer whitespace stripped', () => {
    assert.equal(normalizeRowType('  Main.Mat  '), 'Main.Mat');
    assert.equal(normalizeRowType('\tMain.Mat\n'), 'Main.Mat');
  });

  test('whitespace + suffix combined', () => {
    assert.equal(normalizeRowType('  Main.Mat 3  '), 'Main.Mat');
  });

  test('null / undefined / non-string → ""', () => {
    assert.equal(normalizeRowType(null), '');
    assert.equal(normalizeRowType(undefined), '');
    assert.equal(normalizeRowType(123), '');
    assert.equal(normalizeRowType({}), '');
  });

  test('unrelated label pass-through', () => {
    // Anything not "Main.Mat" / "Process Mat" stays as-is (minus the
    // suffix + whitespace) so future row_type values don't silently
    // get rewritten to the empty string.
    assert.equal(normalizeRowType('Custom Label'), 'Custom Label');
    assert.equal(normalizeRowType('Custom Label 7'), 'Custom Label');
  });
});

describe('isMainMat', () => {
  test('canonical Main.Mat', () => {
    assert.equal(isMainMat('Main.Mat'), true);
  });

  test('legacy "Main.Mat 1" / "Main.Mat 2"', () => {
    assert.equal(isMainMat('Main.Mat 1'), true);
    assert.equal(isMainMat('Main.Mat 2'), true);
    assert.equal(isMainMat('Main.Mat 12'), true);
  });

  test('Process Mat → false', () => {
    assert.equal(isMainMat('Process Mat'), false);
    assert.equal(isMainMat('Process Mat 3'), false);
  });

  test('null / undefined / empty → false', () => {
    assert.equal(isMainMat(null), false);
    assert.equal(isMainMat(undefined), false);
    assert.equal(isMainMat(''), false);
    assert.equal(isMainMat(0), false);
  });

  test('outer whitespace tolerated', () => {
    assert.equal(isMainMat('  Main.Mat  '), true);
    assert.equal(isMainMat('  Main.Mat 1  '), true);
  });
});

describe('isProcessMat', () => {
  test('canonical', () => {
    assert.equal(isProcessMat('Process Mat'), true);
  });

  test('legacy "Process Mat 5"', () => {
    assert.equal(isProcessMat('Process Mat 5'), true);
    assert.equal(isProcessMat('Process Mat 100'), true);
  });

  test('Main.Mat → false', () => {
    assert.equal(isProcessMat('Main.Mat'), false);
    assert.equal(isProcessMat('Main.Mat 1'), false);
  });

  test('null / undefined → false', () => {
    assert.equal(isProcessMat(null), false);
    assert.equal(isProcessMat(undefined), false);
    assert.equal(isProcessMat(''), false);
  });
});
