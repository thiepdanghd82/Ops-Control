import test from 'node:test';
import assert from 'node:assert/strict';
import { withCreator, withoutCreator, fillCreatedBy } from './quoteCreator.js';

test('withCreator sets the session user, over anything the client sent', () => {
  const body = { type: 'standard', state: {}, created_by: 'mallory' };
  assert.equal(withCreator(body, 'Jet').created_by, 'Jet');
  assert.equal(body.created_by, 'mallory', 'the request body is not mutated');
});

test('withoutCreator drops a client-sent creator, so an update keeps the stored one', () => {
  const body = { id: 7, state: { rfq_number: 'RFQ-1' }, created_by: 'mallory' };
  const out = withoutCreator(body);
  assert.equal('created_by' in out, false);
  assert.equal(out.id, 7);
  assert.equal(out.state.rfq_number, 'RFQ-1');
  assert.equal(body.created_by, 'mallory', 'the request body is not mutated');
});

test('fillCreatedBy fills a quote that stores no creator from its creation record', () => {
  const out = fillCreatedBy([{ id: 130, state: {} }], new Map([[130, 'Administrator']]));
  assert.equal(out[0].created_by, 'Administrator');
});

test('fillCreatedBy never replaces a stored creator', () => {
  const out = fillCreatedBy([{ id: 130, created_by: 'Hana' }], new Map([[130, 'Administrator']]));
  assert.equal(out[0].created_by, 'Hana');
});

test('fillCreatedBy leaves a quote with no creation record as it is', () => {
  // Quotes created before 2026-05-26 have no QUOTE_SAVE row marked is_new.
  const q = { id: 27, state: {} };
  const out = fillCreatedBy([q], new Map([[130, 'Administrator']]));
  assert.equal(out[0], q);
  assert.equal(out[0].created_by, undefined);
});

test('fillCreatedBy does not write into the stored rows it is given', () => {
  const q = { id: 130, state: {} };
  fillCreatedBy([q], new Map([[130, 'Jet']]));
  assert.equal('created_by' in q, false);
});
