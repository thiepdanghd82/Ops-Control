const test = require('node:test');
const assert = require('node:assert/strict');
const { closeAction, quitNeedsConfirm } = require('./serverWindowPolicy');

test('closing the SERVER window hides it, so the server keeps running', () => {
  assert.equal(closeAction({ buildRole: 'server', isQuitting: false }), 'hide');
});

test('a quit in progress closes the SERVER window for real', () => {
  assert.equal(closeAction({ buildRole: 'server', isQuitting: true }), 'close');
});

test('the CLIENT window closes as before', () => {
  assert.equal(closeAction({ buildRole: 'client', isQuitting: false }), 'close');
});

test('quitting the SERVER asks first, because it disconnects every client', () => {
  assert.equal(
    quitNeedsConfirm({ buildRole: 'server', confirmed: false, shuttingDown: false }),
    true
  );
});

test('a confirmed quit, a system shutdown and the CLIENT build do not ask', () => {
  assert.equal(
    quitNeedsConfirm({ buildRole: 'server', confirmed: true, shuttingDown: false }),
    false
  );
  assert.equal(
    quitNeedsConfirm({ buildRole: 'server', confirmed: false, shuttingDown: true }),
    false
  );
  assert.equal(
    quitNeedsConfirm({ buildRole: 'client', confirmed: false, shuttingDown: false }),
    false
  );
});
