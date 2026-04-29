/**
 * safeError redaction tests — lock in the privacy contract so a future
 * change can't accidentally widen what leaks to the client.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { redactErrorMessage, stripAbsolutePaths, asSafeError } from './safeError.js';

test('redactErrorMessage: SQLite no-such-column → database_shape_mismatch', () => {
  const err = new Error("no such column: secret_token");
  assert.equal(redactErrorMessage(err), 'database_shape_mismatch');
});

test('redactErrorMessage: UNIQUE constraint → database_constraint_violation', () => {
  const err = new Error('UNIQUE constraint failed: users.username');
  assert.equal(redactErrorMessage(err), 'database_constraint_violation');
});

test('redactErrorMessage: ENOENT → file_not_found', () => {
  const err = new Error("ENOENT: no such file or directory, open '/srv/ops/secret.json'");
  assert.equal(redactErrorMessage(err), 'file_not_found');
});

test('redactErrorMessage: EACCES → permission_denied', () => {
  const err = new Error("EACCES: permission denied, open '/etc/shadow'");
  assert.equal(redactErrorMessage(err), 'permission_denied');
});

test('redactErrorMessage: multer LIMIT_FILE_SIZE → file_too_large', () => {
  const err = new Error('File too large — LIMIT_FILE_SIZE');
  assert.equal(redactErrorMessage(err), 'file_too_large');
});

test('redactErrorMessage: unmatched → internal_error', () => {
  const err = new Error('some random failure deep inside');
  assert.equal(redactErrorMessage(err), 'internal_error');
});

test('redactErrorMessage: null / undefined → internal_error', () => {
  assert.equal(redactErrorMessage(null), 'internal_error');
  assert.equal(redactErrorMessage(undefined), 'internal_error');
});

test('redactErrorMessage: err.safe=true passes message through but strips paths', () => {
  const err = new Error('Backup failed at /srv/ops/data/quotes.json');
  err.safe = true;
  const out = redactErrorMessage(err);
  assert.match(out, /Backup failed/);
  assert.match(out, /<path>/);
  assert.doesNotMatch(out, /\/srv\/ops/);
});

test('redactErrorMessage: database is locked → database_busy', () => {
  const err = new Error('SQLITE_BUSY: database is locked');
  assert.equal(redactErrorMessage(err), 'database_busy');
});

test('redactErrorMessage: invalid JSON → invalid_json_payload', () => {
  const err = new Error('Unexpected token o in JSON at position 1');
  assert.equal(redactErrorMessage(err), 'invalid_json_payload');
});

test('stripAbsolutePaths: posix path replaced with <path>', () => {
  assert.equal(
    stripAbsolutePaths("open '/srv/ops/data/secret.json'"),
    "open '<path>'"
  );
});

test('stripAbsolutePaths: Windows path replaced with <path>', () => {
  assert.equal(
    stripAbsolutePaths('copy C:\\app\\config.ini done'),
    'copy <path> done'
  );
});

test('stripAbsolutePaths: relative paths + URLs left alone', () => {
  assert.equal(stripAbsolutePaths('./data/config.json'), './data/config.json');
  assert.equal(
    stripAbsolutePaths('fetch https://api.example.com/v1/users'),
    'fetch https://api.example.com/v1/users'
  );
});

test('redactErrorMessage: ETIMEDOUT → remote_unavailable (File Provider stall)', () => {
  const err = new Error('ETIMEDOUT: connection timed out, scandir');
  assert.equal(redactErrorMessage(err), 'remote_unavailable');
});

test('redactErrorMessage: ECONNREFUSED → remote_unreachable', () => {
  const err = new Error('connect ECONNREFUSED 127.0.0.1:5432');
  assert.equal(redactErrorMessage(err), 'remote_unreachable');
});

test('asSafeError: marks err.safe=true and message passes through', () => {
  const err = asSafeError('Skipped 3 of 20 subtrees (design-md, foo, bar)');
  assert.equal(err.safe, true);
  assert.equal(err.message, 'Skipped 3 of 20 subtrees (design-md, foo, bar)');
  assert.equal(redactErrorMessage(err), 'Skipped 3 of 20 subtrees (design-md, foo, bar)');
});

test('asSafeError: path scrubbing still applies on the way out', () => {
  const err = asSafeError('backup failed at /srv/ops/data/x.json — check disk');
  const out = redactErrorMessage(err);
  assert.match(out, /<path>/);
  assert.doesNotMatch(out, /\/srv\/ops/);
});
