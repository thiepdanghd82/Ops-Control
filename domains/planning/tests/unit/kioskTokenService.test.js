/**
 * MES-2.3 — Kiosk token service unit tests.
 *
 * Coverage:
 *   - JWT mint/verify happy path (1)
 *   - Expired session rejection (1)
 *   - Bad signature rejection (1)
 *   - Wrong-kind / malformed rejection (1)
 *   - Refresh window: just over 2h → null; just under 2h → new JWT;
 *     exactly 2h boundary → null (1 test, 3 asserts)
 *   - sha256 hash storage parity (raw token never persisted) (1)
 *   - revoke unknown id returns reason='not-found' (1)
 *   - issue → redeem happy path with audit (1)
 *   - second redeem returns 'already-redeemed' (1)
 *   - revoked pairing rejects redeem (1)
 *
 * Total: 10 tests.
 *
 * Runner: node --test domains/planning/tests/unit/kioskTokenService.test.js
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import {
  createKioskTokenService,
  __test as kioskInternals,
} from '../../server/services/kioskTokenService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../../server/db/schema.sql'),
  'utf-8'
);

const KEY = crypto.randomBytes(32).toString('hex'); // 64 chars

function buildHarness(opts = {}) {
  const db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  const auditCalls = [];
  const audit = (row) => auditCalls.push(row);
  const service = createKioskTokenService({ secret: KEY, audit, ...opts });
  return { db, service, audit, auditCalls };
}

describe('kioskTokenService — JWT mint/verify', () => {
  test('issue → redeem mints a JWT that verifies cleanly', () => {
    const { db, service, auditCalls } = buildHarness();
    const issued = service.issuePairing('GALLUS-135', 7, db);
    assert.match(issued.token, /^[A-Za-z0-9_-]+$/, 'token is base64url');
    assert.equal(typeof issued.id, 'number');

    const redeemed = service.redeem(issued.token, db);
    assert.equal(redeemed.ok, true);
    assert.equal(redeemed.machine_code, 'GALLUS-135');
    assert.equal(typeof redeemed.session_jwt, 'string');
    assert.match(redeemed.jti, /^[0-9a-f]{32}$/);

    const verified = service.verifySession(redeemed.session_jwt);
    assert.equal(verified.ok, true);
    assert.equal(verified.claims.machine_code, 'GALLUS-135');
    assert.equal(verified.claims.kind, 'kiosk');
    assert.equal(verified.claims.jti, redeemed.jti);

    // Audit emitted for issue + redeem (NEVER the raw token).
    assert.equal(auditCalls.length, 2);
    assert.equal(auditCalls[0].event, 'KIOSK_PAIR_ISSUE');
    assert.equal(auditCalls[1].event, 'KIOSK_PAIR_REDEEM');
    for (const row of auditCalls) {
      assert.ok(!row.detail.includes(issued.token), 'raw token must never appear in audit');
    }
  });
});

describe('kioskTokenService — JWT failure modes', () => {
  test('expired JWT → reason=expired', () => {
    const { db, service } = buildHarness({ sessionTtlMs: 1 }); // 1ms TTL
    const issued = service.issuePairing('M', 1, db);
    const redeemed = service.redeem(issued.token, db);
    // Sleep is unreliable; cheaper to mint a stale JWT directly.
    const stale = kioskInternals.signJwt(
      { jti: 'x', machine_code: 'M', kind: 'kiosk', exp: Math.floor(Date.now() / 1000) - 1 },
      KEY
    );
    assert.deepEqual(service.verifySession(stale), { ok: false, reason: 'expired' });
    // Sanity: the just-redeemed token is also (probably) expired since TTL=1ms
    const r = service.verifySession(redeemed.session_jwt);
    assert.equal(r.ok, false);
  });

  test('JWT signed with a different secret → reason=bad-signature', () => {
    const { service } = buildHarness();
    const otherKey = crypto.randomBytes(32).toString('hex');
    const forged = kioskInternals.signJwt(
      { jti: 'x', machine_code: 'M', kind: 'kiosk', exp: Math.floor(Date.now() / 1000) + 60 },
      otherKey
    );
    assert.deepEqual(service.verifySession(forged), { ok: false, reason: 'bad-signature' });
  });

  test('JWT with wrong kind / malformed shape → reason=wrong-kind / malformed / bad-alg', () => {
    const { service } = buildHarness();
    const wrongKind = kioskInternals.signJwt(
      { jti: 'x', machine_code: 'M', kind: 'planner', exp: Math.floor(Date.now() / 1000) + 60 },
      KEY
    );
    assert.deepEqual(service.verifySession(wrongKind), { ok: false, reason: 'wrong-kind' });

    // alg=none header → bad-alg (defense against the classic JWT footgun).
    const noneAlgHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url'
    );
    const noneAlgBody = Buffer.from(
      JSON.stringify({ kind: 'kiosk', exp: Math.floor(Date.now() / 1000) + 60 })
    ).toString('base64url');
    assert.deepEqual(service.verifySession(`${noneAlgHeader}.${noneAlgBody}.x`), {
      ok: false,
      reason: 'bad-alg',
    });

    // 3-part-but-garbage → malformed (header decodes as non-JSON).
    assert.deepEqual(service.verifySession('not.a.jwt'), { ok: false, reason: 'malformed' });
    assert.deepEqual(service.verifySession('only-one-part'), { ok: false, reason: 'malformed' });
    assert.deepEqual(service.verifySession(null), { ok: false, reason: 'malformed' });
  });
});

describe('kioskTokenService — refresh window (2h cliff)', () => {
  test('claims with >2h remaining → null; <2h → new JWT; exactly 2h boundary → null', () => {
    const FIXED_NOW = 1_700_000_000_000; // pinned clock so the boundary check is deterministic
    const { service } = buildHarness({ now: () => FIXED_NOW });
    const baseExpSec = Math.floor(FIXED_NOW / 1000);

    // 2.5h remaining → no refresh.
    const farClaims = { jti: 'a', machine_code: 'M', kind: 'kiosk', exp: baseExpSec + 2.5 * 3600 };
    assert.equal(service.refreshSession(farClaims), null);

    // exactly 2h remaining → no refresh (boundary is inclusive: remainingMs >= REFRESH_WINDOW → null).
    const exactClaims = { jti: 'b', machine_code: 'M', kind: 'kiosk', exp: baseExpSec + 2 * 3600 };
    assert.equal(service.refreshSession(exactClaims), null);

    // 1.5h remaining → refresh.
    const nearClaims = { jti: 'c', machine_code: 'M', kind: 'kiosk', exp: baseExpSec + 1.5 * 3600 };
    const fresh = service.refreshSession(nearClaims);
    assert.equal(typeof fresh, 'string');
    // The fresh JWT uses the pinned clock to compute exp, so it'd verify
    // as "expired" against real Date.now(); decode the body manually to
    // confirm jti carries forward and the new exp is bumped from the
    // pinned clock.
    const body = JSON.parse(Buffer.from(fresh.split('.')[1], 'base64url').toString('utf-8'));
    assert.equal(body.jti, 'c', 'jti carries forward');
    assert.ok(body.exp > baseExpSec + 1.5 * 3600, 'new exp is later than the old');

    // Bad input → null (no throw).
    assert.equal(service.refreshSession(null), null);
    assert.equal(service.refreshSession({}), null);
  });
});

describe('kioskTokenService — constructor input validation', () => {
  test('missing or too-short secret throws on construction', () => {
    assert.throws(() => createKioskTokenService({ secret: '', audit: () => {} }));
    assert.throws(() => createKioskTokenService({ secret: 'short', audit: () => {} }));
    assert.throws(() => createKioskTokenService({ audit: () => {} }));
  });

  test('JWT with a short signature → bad-signature (length mismatch branch)', () => {
    const { service } = buildHarness();
    const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ kind: 'kiosk', exp: Math.floor(Date.now() / 1000) + 60 })
    ).toString('base64url');
    const truncated = `${head}.${body}.shortsig`;
    assert.deepEqual(service.verifySession(truncated), { ok: false, reason: 'bad-signature' });
  });

  test('JWT with valid sig but non-JSON body → malformed (catch branch)', () => {
    const { service, secret: _ignored } = buildHarness();
    // Re-derive the secret used inside the harness so we sign with the right key.
    // (buildHarness uses module-level KEY.)
    const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const garbageBody = Buffer.from('not-json').toString('base64url');
    const sig = crypto
      .createHmac('sha256', KEY)
      .update(`${head}.${garbageBody}`)
      .digest('base64url');
    assert.deepEqual(service.verifySession(`${head}.${garbageBody}.${sig}`), {
      ok: false,
      reason: 'malformed',
    });
  });
});

describe('kioskTokenService — token storage hygiene', () => {
  test('raw token is never persisted; only sha256 hash lives in kiosk_pairing.token_hash', () => {
    const { db, service } = buildHarness();
    const issued = service.issuePairing('M', 1, db);
    const row = db.prepare('SELECT token_hash FROM kiosk_pairing WHERE id = ?').get(issued.id);
    assert.equal(row.token_hash, kioskInternals.sha256Hex(issued.token));
    assert.notEqual(row.token_hash, issued.token, 'hash must not equal raw token');
    // Belt + braces: scan all rows for any column that contains the raw token.
    const all = db.prepare('SELECT * FROM kiosk_pairing').all();
    for (const r of all) {
      for (const v of Object.values(r)) {
        if (typeof v === 'string') {
          assert.ok(!v.includes(issued.token), `raw token leaked into column value`);
        }
      }
    }
  });
});

describe('kioskTokenService — revoke', () => {
  test('revoke unknown id returns ok=false reason=not-found, no audit row', () => {
    const { db, service, auditCalls } = buildHarness();
    const r = service.revoke(999, db, 1);
    assert.deepEqual(r, { ok: false, reason: 'not-found' });
    assert.equal(auditCalls.length, 0);
  });
});

describe('kioskTokenService — redeem failure modes', () => {
  test('second redeem of a redeemed token → already-redeemed', () => {
    const { db, service } = buildHarness();
    const issued = service.issuePairing('M', 1, db);
    const first = service.redeem(issued.token, db);
    assert.equal(first.ok, true);
    const second = service.redeem(issued.token, db);
    assert.deepEqual(second, { ok: false, reason: 'already-redeemed' });
  });

  test('redeem after revoke → revoked', () => {
    const { db, service } = buildHarness();
    const issued = service.issuePairing('M', 1, db);
    const rev = service.revoke(issued.id, db, 99);
    assert.equal(rev.ok, true);
    const r = service.redeem(issued.token, db);
    assert.deepEqual(r, { ok: false, reason: 'revoked' });
  });

  test('redeem with malformed / unknown / expired token returns the right reason', () => {
    const { db, service } = buildHarness({ pairingTtlMs: 1 }); // 1ms
    assert.deepEqual(service.redeem('', db), { ok: false, reason: 'malformed' });
    assert.deepEqual(service.redeem('short', db), { ok: false, reason: 'malformed' });
    assert.deepEqual(service.redeem(crypto.randomBytes(32).toString('base64url'), db), {
      ok: false,
      reason: 'unknown',
    });
    // Expire path: issue with TTL=1ms then sleep-equivalent via clock injection.
    let clock = Date.now();
    const { db: db2, service: service2 } = buildHarness({
      pairingTtlMs: 1000,
      now: () => clock,
    });
    const issued = service2.issuePairing('M', 1, db2);
    clock += 5000; // 5s later — past the 1s TTL
    const r = service2.redeem(issued.token, db2);
    assert.deepEqual(r, { ok: false, reason: 'expired' });
  });
});
