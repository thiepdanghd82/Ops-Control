import test from 'node:test';
import assert from 'node:assert/strict';
import { canSubmitClear, interpretClearResponse } from './ConfirmClearModal.helpers.js';

test('canSubmitClear — blank/whitespace password or busy → cannot submit', () => {
  assert.equal(canSubmitClear({ password: '', busy: false }), false);
  assert.equal(canSubmitClear({ password: '   ', busy: false }), false);
  assert.equal(canSubmitClear({ password: null, busy: false }), false);
  assert.equal(canSubmitClear({ password: undefined, busy: false }), false);
  assert.equal(canSubmitClear({ password: 'secret', busy: true }), false, 'busy blocks submit');
});

test('canSubmitClear — a non-blank password while idle → can submit', () => {
  assert.equal(canSubmitClear({ password: 'secret', busy: false }), true);
  assert.equal(canSubmitClear({ password: ' s ', busy: false }), true);
});

test('interpretClearResponse — 200 { ok:false, code:bad_password } → keep modal open + error', () => {
  assert.equal(interpretClearResponse({ ok: false, code: 'bad_password' }), 'bad_password');
});

test('interpretClearResponse — any success payload → closes + reloads', () => {
  assert.equal(interpretClearResponse({ ok: true, message: 'BOM cleared' }), 'ok');
  assert.equal(interpretClearResponse({ ok: true }), 'ok');
  assert.equal(interpretClearResponse({ message: 'done' }), 'ok'); // no ok field → success
  assert.equal(interpretClearResponse(undefined), 'ok');
});
