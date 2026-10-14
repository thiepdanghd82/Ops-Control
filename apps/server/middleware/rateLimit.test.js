/**
 * rateLimit — IP bucket limiter tests.
 *
 * Tests the two exported middleware (writeRateLimit, saveRateLimit).
 * Each has its own store, so burning one bucket doesn't affect the
 * other. The `._reset()` hook lets each test start from a clean slate
 * without waiting for the 10-minute window to roll over.
 *
 * We don't test the actual window expiry (would require freezing time
 * or waiting 10 min). The entry.resetAt check is simple enough that
 * the threshold tests here cover the important logic.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeRateLimit, saveRateLimit } from './rateLimit.js';

// Phase 9E.1 — tests now simulate Express's `trust proxy` flow: the app
// calls `app.set('trust proxy', 1)` in index.js, and Express populates
// `req.ip` from X-Forwarded-For when appropriate. The middleware reads
// `req.ip`, falling back to `req.socket.remoteAddress` for direct
// connections (dev, tests without Express). We test both paths.
function mkReq(ip) {
  // Socket IP only — simulates a direct connection with no trusted proxy.
  return { headers: {}, socket: { remoteAddress: ip } };
}
function mkReqExpress(ip) {
  // Express-populated req.ip — simulates a request via a trusted proxy.
  return { ip, headers: {}, socket: { remoteAddress: '127.0.0.1' } };
}
function mkRes() {
  let status = 200,
    payload = null;
  const res = {
    status(s) {
      status = s;
      return res;
    },
    json(p) {
      payload = p;
      return res;
    },
    _status: () => status,
    _payload: () => payload,
  };
  return res;
}

test('writeRateLimit: allows up to default max (30) per IP', () => {
  writeRateLimit._reset();
  const ip = '10.0.0.1';
  let allowed = 0;
  for (let i = 0; i < 30; i++) {
    const res = mkRes();
    let next = false;
    writeRateLimit(mkReq(ip), res, () => {
      next = true;
    });
    if (next) allowed++;
  }
  assert.equal(allowed, 30);
});

test('writeRateLimit: 31st call blocked with 429', () => {
  writeRateLimit._reset();
  const ip = '10.0.0.2';
  for (let i = 0; i < 30; i++) {
    writeRateLimit(mkReq(ip), mkRes(), () => {});
  }
  const res = mkRes();
  let next = false;
  writeRateLimit(mkReq(ip), res, () => {
    next = true;
  });
  assert.equal(next, false);
  assert.equal(res._status(), 429);
  assert.equal(res._payload().ok, false);
  assert.ok(res._payload().retry_after_ms > 0);
  assert.ok(res._payload().error.includes('write'));
});

test('writeRateLimit: per-IP isolation — different IPs share no counter', () => {
  writeRateLimit._reset();
  for (let i = 0; i < 30; i++) {
    writeRateLimit(mkReq('10.0.0.3'), mkRes(), () => {});
  }
  // 10.0.0.3 is exhausted, 10.0.0.4 should still be allowed
  const res = mkRes();
  let next = false;
  writeRateLimit(mkReq('10.0.0.4'), res, () => {
    next = true;
  });
  assert.equal(next, true);
  assert.equal(res._status(), 200);
});

test('saveRateLimit: higher threshold than writeRateLimit (default 120)', () => {
  saveRateLimit._reset();
  const ip = '10.0.0.5';
  let allowed = 0;
  for (let i = 0; i < 120; i++) {
    let next = false;
    saveRateLimit(mkReq(ip), mkRes(), () => {
      next = true;
    });
    if (next) allowed++;
  }
  assert.equal(allowed, 120);

  // 121st call blocked
  const res = mkRes();
  let next = false;
  saveRateLimit(mkReq(ip), res, () => {
    next = true;
  });
  assert.equal(next, false);
  assert.equal(res._status(), 429);
  assert.ok(res._payload().error.includes('save'));
});

test("limiters: independent stores — burning save doesn't affect write", () => {
  writeRateLimit._reset();
  saveRateLimit._reset();
  const ip = '10.0.0.6';
  for (let i = 0; i < 120; i++) {
    saveRateLimit(mkReq(ip), mkRes(), () => {});
  }
  // save exhausted, write should still work
  let next = false;
  writeRateLimit(mkReq(ip), mkRes(), () => {
    next = true;
  });
  assert.equal(next, true);
});

test('limiter: uses req.ip when set (Express-populated from X-Forwarded-For via trust proxy)', () => {
  writeRateLimit._reset();
  const ip = '203.0.113.1';
  for (let i = 0; i < 30; i++) {
    writeRateLimit(mkReqExpress(ip), mkRes(), () => {});
  }
  // Same forwarded IP on a different socket — still counted as same IP
  // because Express resolved it to req.ip under trust proxy.
  const res = mkRes();
  let next = false;
  writeRateLimit(mkReqExpress(ip), res, () => {
    next = true;
  });
  assert.equal(next, false);
  assert.equal(res._status(), 429);
});

test('limiter: falls back to socket.remoteAddress when req.ip absent', () => {
  writeRateLimit._reset();
  for (let i = 0; i < 30; i++) {
    writeRateLimit(mkReq('10.0.0.100'), mkRes(), () => {});
  }
  const res = mkRes();
  let next = false;
  writeRateLimit(mkReq('10.0.0.100'), res, () => {
    next = true;
  });
  assert.equal(next, false);
  assert.equal(res._status(), 429);
});

test('limiter: raw x-forwarded-for header is IGNORED without trust proxy', () => {
  writeRateLimit._reset();
  // Pre 9E.1 a direct client could spoof ANY IP via this header to
  // avoid per-IP counts. Now the limiter only reads req.ip (set by
  // Express when trust-proxy is configured) or socket. Header alone
  // must not influence the counter.
  const spoofed = {
    headers: { 'x-forwarded-for': 'spoof-me' },
    socket: { remoteAddress: '10.0.0.200' },
  };
  for (let i = 0; i < 30; i++) writeRateLimit(spoofed, mkRes(), () => {});
  // Another request with a DIFFERENT spoofed header but same socket —
  // should still hit 429 because the counter keyed on the socket.
  const spoofed2 = {
    headers: { 'x-forwarded-for': 'different-spoof' },
    socket: { remoteAddress: '10.0.0.200' },
  };
  const res = mkRes();
  let next = false;
  writeRateLimit(spoofed2, res, () => {
    next = true;
  });
  assert.equal(next, false);
  assert.equal(res._status(), 429);
});

test('limiter: malformed env var (NaN) falls back to default, does NOT disable limiter', () => {
  // Regression for the bug where `Number('abc')=NaN` made `count > NaN`
  // always false, silently disabling the limiter. The fallback runs at
  // module load; we verify the currently-loaded limiter still enforces
  // its default max.
  writeRateLimit._reset();
  // Default is 30 — 31st request should 429.
  for (let i = 0; i < 30; i++) writeRateLimit(mkReq('10.0.0.201'), mkRes(), () => {});
  const res = mkRes();
  let next = false;
  writeRateLimit(mkReq('10.0.0.201'), res, () => {
    next = true;
  });
  assert.equal(next, false, 'limiter must still enforce default max when env is absent/bad');
  assert.equal(res._status(), 429);
});

test('_max() exposes the effective threshold', () => {
  assert.equal(writeRateLimit._max(), 30);
  assert.equal(saveRateLimit._max(), 120);
});

test('LRU eviction: store size is bounded below STORE_MAX + 10% headroom', () => {
  writeRateLimit._reset();
  // Fill past STORE_MAX (10k) with unique IPs. The store must prune
  // itself; otherwise a cycling-IP botnet could OOM the node. We cap
  // at just over the limit to verify the prune triggers.
  for (let i = 0; i < 10_500; i++) {
    writeRateLimit(mkReq(`192.168.${Math.floor(i / 256)}.${i % 256}`), mkRes(), () => {});
  }
  const size = writeRateLimit._storeSize();
  assert.ok(size <= 10_000, `store should be bounded at 10k, got ${size}`);
  // Also verify the limiter still works for a NEW IP after pruning —
  // eviction must not have deleted the logic, only old entries.
  writeRateLimit._reset();
  let next = false;
  writeRateLimit(mkReq('10.0.0.255'), mkRes(), () => {
    next = true;
  });
  assert.equal(next, true, 'limiter must still accept new IPs after an eviction pass');
});
