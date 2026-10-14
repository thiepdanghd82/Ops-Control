import test from 'node:test';
import assert from 'node:assert/strict';
import { offsiteLine, fmtAge } from './Settings.offsite.js';

const t = (k) => k; // identity: assert on keys, not on translations

test('fmtAge stays coarse', () => {
  assert.equal(fmtAge(0.5), '<1h');
  assert.equal(fmtAge(3.4), '3h');
  assert.equal(fmtAge(72), '3d');
  assert.equal(fmtAge(NaN), '—');
});

test('never-succeeded surfaces the loudest key and keeps its tone', () => {
  const r = offsiteLine(
    { tone: 'bad', reason: 'never_succeeded', detail: 'share not mounted', dest: '/m' },
    t
  );
  assert.equal(r.tone, 'bad');
  assert.ok(r.text.includes('set.offsite.never'));
  assert.ok(r.title.includes('share not mounted'), 'the reason belongs in the tooltip');
  assert.ok(r.title.includes('/m'), 'so does the destination');
});

test('a healthy mirror reads ok with its age', () => {
  const r = offsiteLine({ tone: 'ok', reason: 'ok', ageHours: 2.2 }, t);
  assert.equal(r.tone, 'ok');
  assert.ok(r.text.includes('2h'));
});

test('null status degrades to not-configured rather than throwing', () => {
  const r = offsiteLine(null, t);
  assert.equal(r.tone, 'none');
  assert.ok(r.text.includes('set.offsite.none'));
});

test('an unknown reason still renders something', () => {
  const r = offsiteLine({ tone: 'warn', reason: 'something_new' }, t);
  assert.ok(r.text.length > 0);
  assert.equal(r.tone, 'warn');
});
