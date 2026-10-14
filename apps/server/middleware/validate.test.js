/**
 * validateBody — schema validation middleware tests.
 *
 * Node.js native test runner. validateBody is a pure middleware: it
 * returns 400 with {ok:false, error:'validation_failed', details:[...]}
 * on failure, or calls next() on success.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBody } from './validate.js';

// ── Test harness — capture res.status + res.json without Express ──
function runMw(mw, body) {
  const req = { body };
  let status = 200,
    payload = null,
    nextCalled = false;
  const res = {
    status(s) {
      status = s;
      return res;
    },
    json(p) {
      payload = p;
      return res;
    },
  };
  mw(req, res, () => {
    nextCalled = true;
  });
  return { status, payload, nextCalled };
}

// ── required ──
test('required field missing → 400', () => {
  const mw = validateBody({ x: { type: 'string', required: true } });
  const r = runMw(mw, {});
  assert.equal(r.status, 400);
  assert.equal(r.payload.error, 'validation_failed');
  assert.ok(r.payload.details.some((d) => d.includes('x')));
  assert.equal(r.nextCalled, false);
});

test('required field present → next()', () => {
  const mw = validateBody({ x: { type: 'string', required: true } });
  const r = runMw(mw, { x: 'hi' });
  assert.equal(r.nextCalled, true);
});

test('optional field missing → next() (no error)', () => {
  const mw = validateBody({ x: { type: 'string' } });
  const r = runMw(mw, {});
  assert.equal(r.nextCalled, true);
});

// ── string type ──
test('string: wrong type → 400', () => {
  const mw = validateBody({ x: { type: 'string' } });
  const r = runMw(mw, { x: 42 });
  assert.equal(r.status, 400);
  assert.ok(r.payload.details[0].includes('must be string'));
});

test('string: min length enforced', () => {
  const mw = validateBody({ x: { type: 'string', min: 3 } });
  assert.equal(runMw(mw, { x: 'ab' }).status, 400);
  assert.equal(runMw(mw, { x: 'abc' }).nextCalled, true);
});

test('string: max length enforced', () => {
  const mw = validateBody({ x: { type: 'string', max: 3 } });
  assert.equal(runMw(mw, { x: 'abcd' }).status, 400);
  assert.equal(runMw(mw, { x: 'abc' }).nextCalled, true);
});

test('string: pattern enforced', () => {
  const mw = validateBody({ x: { type: 'string', pattern: /^\d+$/ } });
  assert.equal(runMw(mw, { x: 'abc' }).status, 400);
  assert.equal(runMw(mw, { x: '123' }).nextCalled, true);
});

// ── number type ──
test('number: non-finite → 400', () => {
  const mw = validateBody({ x: { type: 'number' } });
  assert.equal(runMw(mw, { x: 'hi' }).status, 400);
  assert.equal(runMw(mw, { x: Infinity }).status, 400);
  assert.equal(runMw(mw, { x: NaN }).status, 400);
});

test('number: accepts numeric string', () => {
  const mw = validateBody({ x: { type: 'number' } });
  assert.equal(runMw(mw, { x: '42' }).nextCalled, true);
});

test('number: min/max bounds', () => {
  const mw = validateBody({ x: { type: 'number', min: 0, max: 100 } });
  assert.equal(runMw(mw, { x: -1 }).status, 400);
  assert.equal(runMw(mw, { x: 101 }).status, 400);
  assert.equal(runMw(mw, { x: 50 }).nextCalled, true);
});

// ── boolean / object / array ──
test('boolean: wrong type → 400', () => {
  const mw = validateBody({ x: { type: 'boolean' } });
  assert.equal(runMw(mw, { x: 'true' }).status, 400);
  assert.equal(runMw(mw, { x: true }).nextCalled, true);
});

test('object: arrays rejected (arrays must use type:array)', () => {
  const mw = validateBody({ x: { type: 'object' } });
  assert.equal(runMw(mw, { x: [] }).status, 400);
  assert.equal(runMw(mw, { x: {} }).nextCalled, true);
});

test('array: wrong type → 400', () => {
  const mw = validateBody({ x: { type: 'array' } });
  assert.equal(runMw(mw, { x: 'not' }).status, 400);
  assert.equal(runMw(mw, { x: [1, 2] }).nextCalled, true);
});

test('array: max length enforced', () => {
  const mw = validateBody({ x: { type: 'array', max: 2 } });
  assert.equal(runMw(mw, { x: [1, 2, 3] }).status, 400);
  assert.equal(runMw(mw, { x: [1] }).nextCalled, true);
});

// ── enum type (Phase 9C.1 addition) ──
test('enum: value in list → next()', () => {
  const mw = validateBody({ action: { type: 'enum', values: ['APPROVE', 'REJECT'] } });
  assert.equal(runMw(mw, { action: 'APPROVE' }).nextCalled, true);
});

test('enum: value not in list → 400 lists valid values', () => {
  const mw = validateBody({ action: { type: 'enum', values: ['APPROVE', 'REJECT'] } });
  const r = runMw(mw, { action: 'DESTROY' });
  assert.equal(r.status, 400);
  assert.ok(r.payload.details[0].includes('APPROVE'));
  assert.ok(r.payload.details[0].includes('REJECT'));
});

test('enum: required + missing → 400 on required, not enum', () => {
  const mw = validateBody({
    action: { type: 'enum', required: true, values: ['A', 'B'] },
  });
  const r = runMw(mw, {});
  assert.equal(r.status, 400);
  assert.ok(r.payload.details[0].includes('required'));
});

test('enum: optional + missing → next()', () => {
  const mw = validateBody({ action: { type: 'enum', values: ['A', 'B'] } });
  assert.equal(runMw(mw, {}).nextCalled, true);
});

// ── body shape edge cases ──
test('null body → behaves like empty object', () => {
  const mw = validateBody({ x: { type: 'string', required: true } });
  const r = runMw(mw, null);
  assert.equal(r.status, 400);
});

test('multiple errors aggregated in one response', () => {
  const mw = validateBody({
    a: { type: 'string', required: true },
    b: { type: 'number', required: true },
  });
  const r = runMw(mw, {});
  assert.equal(r.status, 400);
  assert.equal(r.payload.details.length, 2);
});

test('unknown keys in body are ignored', () => {
  const mw = validateBody({ x: { type: 'string' } });
  const r = runMw(mw, { x: 'ok', surprise: 'ignored' });
  assert.equal(r.nextCalled, true);
});
