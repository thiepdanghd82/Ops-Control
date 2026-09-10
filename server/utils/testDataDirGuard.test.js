/**
 * testDataDirGuard tests — node --test server/utils/testDataDirGuard.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isProdDataPath, assertNotProdDbUnderTest } from './testDataDirGuard.js';

const MAC_PROD = '/Users/henrydang/Library/Application Support/ops-control-desktop/data/ops.db';
const WIN_PROD = 'C:/Users/x/AppData/Roaming/ops-control-desktop/data/ops.db';

test('isProdDataPath: live macOS userData path → true', () => {
  assert.equal(isProdDataPath(MAC_PROD), true);
  assert.equal(isProdDataPath('/Users/h/Library/Application Support/ops-control-desktop'), true);
});

test('isProdDataPath: Windows AppData userData path → true', () => {
  assert.equal(isProdDataPath(WIN_PROD), true);
});

test('isProdDataPath: repo server/data + temp dirs → false', () => {
  assert.equal(isProdDataPath('/repo/server/data/ops.db'), false);
  assert.equal(isProdDataPath('/tmp/ops-concur-abc/ops.db'), false);
  assert.equal(isProdDataPath('/var/folders/xx/T/whatever/ops.db'), false);
  assert.equal(isProdDataPath(undefined), false);
  assert.equal(isProdDataPath(''), false);
});

test('assertNotProdDbUnderTest: throws under test runner + prod path', () => {
  assert.throws(
    () => assertNotProdDbUnderTest(MAC_PROD, { NODE_TEST_CONTEXT: 'child-v8' }),
    /REFUSING to open the LIVE production database/
  );
});

test('assertNotProdDbUnderTest: no throw when not under test runner (prod runtime)', () => {
  // The real app opens the prod db legitimately — NODE_TEST_CONTEXT is unset.
  assert.doesNotThrow(() => assertNotProdDbUnderTest(MAC_PROD, {}));
});

test('assertNotProdDbUnderTest: no throw for safe path even under test runner', () => {
  assert.doesNotThrow(() =>
    assertNotProdDbUnderTest('/repo/server/data/ops.db', { NODE_TEST_CONTEXT: 'child-v8' })
  );
  assert.doesNotThrow(() =>
    assertNotProdDbUnderTest('/tmp/ops-x/ops.db', { NODE_TEST_CONTEXT: 'child-v8' })
  );
});
