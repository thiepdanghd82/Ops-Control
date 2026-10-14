/**
 * uploadGuard tests — node --test server/utils/uploadGuard.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadErrorResponse, uploadSingle } from './uploadGuard.js';

test('uploadErrorResponse: no error → null', () => {
  assert.equal(uploadErrorResponse(null, 50), null);
  assert.equal(uploadErrorResponse(undefined, 50), null);
});

test('uploadErrorResponse: LIMIT_FILE_SIZE → 413 file_too_large with limit', () => {
  const err = Object.assign(new Error('File too large'), { code: 'LIMIT_FILE_SIZE' });
  const r = uploadErrorResponse(err, 50);
  assert.equal(r.status, 413);
  assert.equal(r.body.error, 'file_too_large');
  assert.equal(r.body.limit_mb, 50);
  assert.equal(r.body.ok, false);
});

test('uploadErrorResponse: other multer error → 400 upload_failed (not a 500)', () => {
  const err = Object.assign(new Error('Unexpected field'), { code: 'LIMIT_UNEXPECTED_FILE' });
  const r = uploadErrorResponse(err, 50);
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'upload_failed');
});

test('uploadSingle: over-limit error short-circuits with 413, next() not called', () => {
  // Fake multer whose single() invokes the callback with LIMIT_FILE_SIZE.
  const fakeUpload = {
    single: () => (req, res, cb) =>
      cb(Object.assign(new Error('too big'), { code: 'LIMIT_FILE_SIZE' })),
  };
  let sent = null;
  let nextCalled = false;
  const res = {
    status(s) {
      this._s = s;
      return this;
    },
    json(b) {
      sent = { status: this._s, body: b };
      return this;
    },
  };
  uploadSingle(fakeUpload, 'file', 50)({}, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false, 'next() must not run on error');
  assert.equal(sent.status, 413);
  assert.equal(sent.body.error, 'file_too_large');
});

test('uploadSingle: success calls next() with no response', () => {
  const fakeUpload = { single: () => (req, res, cb) => cb(null) };
  let nextCalled = false;
  uploadSingle(fakeUpload, 'file', 50)({}, {}, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});
