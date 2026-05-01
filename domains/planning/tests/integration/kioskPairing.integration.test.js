/**
 * MES-2.3 — Kiosk pairing integration tests (12).
 *
 * End-to-end through the HTTP boundary using the shared kiosk harness:
 *   1. Issue happy path (201 + DB row + audit row)
 *   2. Redeem happy path (200 + JWT verifies + DB row updated + audit)
 *   3. Revoke happy path (204 + DB row marked + audit)
 *   4. Redeem unknown token → 410 urn:ops:kiosk-token-invalid (reason=unknown)
 *   5. Redeem expired token → 410 (reason=expired)
 *   6. Redeem already-redeemed token → 410 (reason=already-redeemed)
 *   7. Redeem revoked pairing → 410 (reason=revoked)
 *   8. Revoke unknown id → 404 urn:ops:kiosk-pairing-not-found
 *   9. Issue with unknown machine_code → 422 urn:ops:kiosk-machine-unknown
 *  10. Issue without machine_code → 400 urn:ops:validation
 *  11. JWT refresh-window: claims with >2h remaining → no refresh; <2h → fresh JWT
 *  12. audit_log table contains KIOSK_PAIR_ISSUE + KIOSK_PAIR_REDEEM + KIOSK_REVOKE rows
 *
 * Runner: node --test domains/planning/tests/integration/kioskPairing.integration.test.js
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { buildKioskApp, listen, close, req, PLANNER, SYS } from './_kioskHarness.js';

let app, baseUrl, server, db, service, auditCalls, auditTable;

before(async () => {
  ({ app, db, service, auditCalls, auditTable } = buildKioskApp());
  ({ baseUrl, server } = await listen(app));
});
after(() => close(server));

describe('POST /kiosks/pairings — issue', () => {
  test('1. issue happy path: 201 + DB row + audit row', async () => {
    const before = auditCalls.length;
    const r = await req(baseUrl, 'POST', '/api/planning/v2/kiosks/pairings', {
      user: PLANNER,
      body: { machine_code: 'GALLUS-135' },
    });
    assert.equal(r.status, 201);
    assert.equal(typeof r.json.token, 'string');
    assert.match(r.json.pairing_url, /^\/kiosk\/pair\?t=/);
    assert.equal(typeof r.json.id, 'number');

    const row = db.prepare('SELECT * FROM kiosk_pairing WHERE id = ?').get(r.json.id);
    assert.equal(row.machine_code, 'GALLUS-135');
    assert.equal(row.issued_by_user_id, 7);
    assert.equal(row.redeemed_at_utc, null);

    const issueCalls = auditCalls.slice(before).filter((c) => c.event === 'KIOSK_PAIR_ISSUE');
    assert.equal(issueCalls.length, 1);
    const detail = JSON.parse(issueCalls[0].detail);
    assert.equal(detail.machine_code, 'GALLUS-135');
    assert.equal(detail.pairing_id, r.json.id);
    // Raw token must NEVER appear in audit detail.
    assert.ok(!issueCalls[0].detail.includes(r.json.token));
  });

  test('9. issue with unknown machine_code → 422', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/kiosks/pairings', {
      user: PLANNER,
      body: { machine_code: 'GHOST-MACHINE' },
    });
    assert.equal(r.status, 422);
    assert.equal(r.json.type, 'urn:ops:kiosk-machine-unknown');
    assert.equal(r.json.machine_code, 'GHOST-MACHINE');
  });

  test('10. issue without machine_code → 400 validation', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/kiosks/pairings', {
      user: PLANNER,
      body: {},
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.type, 'urn:ops:validation');
    assert.deepEqual(r.json.errors, [{ field: 'machine_code', code: 'required' }]);
  });
});

describe('POST /kiosks/redeem — redeem', () => {
  test('2. redeem happy path: 200 + JWT verifies + DB updated + audit', async () => {
    // Mint a fresh pairing for this test.
    const issued = service.issuePairing('BROTECH-192', 7, db);
    const beforeAuditLen = auditCalls.length;

    const r = await req(baseUrl, 'POST', '/api/planning/v2/kiosks/redeem', {
      body: { token: issued.token },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.machine_code, 'BROTECH-192');
    assert.equal(typeof r.json.session_jwt, 'string');
    assert.equal(typeof r.json.jti, 'string');

    // JWT verifies cleanly via the same service instance.
    const verified = service.verifySession(r.json.session_jwt);
    assert.equal(verified.ok, true);
    assert.equal(verified.claims.machine_code, 'BROTECH-192');
    assert.equal(verified.claims.jti, r.json.jti);

    // DB row marked redeemed.
    const row = db.prepare('SELECT * FROM kiosk_pairing WHERE id = ?').get(issued.id);
    assert.notEqual(row.redeemed_at_utc, null);
    assert.equal(row.session_jti, r.json.jti);

    // Audit emitted (raw token NOT in detail, JWT NOT in detail — only jti).
    const newCalls = auditCalls.slice(beforeAuditLen);
    const redeemCall = newCalls.find((c) => c.event === 'KIOSK_PAIR_REDEEM');
    assert.ok(redeemCall);
    assert.ok(!redeemCall.detail.includes(issued.token));
    assert.ok(!redeemCall.detail.includes(r.json.session_jwt));
    const detail = JSON.parse(redeemCall.detail);
    assert.equal(detail.jti, r.json.jti);
  });

  test('4. redeem unknown token → 410 reason=unknown', async () => {
    const r = await req(baseUrl, 'POST', '/api/planning/v2/kiosks/redeem', {
      body: { token: crypto.randomBytes(32).toString('base64url') },
    });
    assert.equal(r.status, 410);
    assert.equal(r.json.type, 'urn:ops:kiosk-token-invalid');
    assert.equal(r.json.reason, 'unknown');
  });

  test('5. redeem expired token → 410 reason=expired', async () => {
    // Stand up a separate harness with a 1ms pairing TTL + clock injection.
    const {
      app: app2,
      db: db2,
      service: svc2,
    } = buildKioskApp({
      serviceOpts: { pairingTtlMs: 1000, now: () => fixedClock },
    });
    let fixedClock = Date.now();
    const issued = svc2.issuePairing('GALLUS-135', 7, db2);
    fixedClock += 5000;
    const { baseUrl: u2, server: s2 } = await listen(app2);
    const r = await req(u2, 'POST', '/api/planning/v2/kiosks/redeem', {
      body: { token: issued.token },
    });
    assert.equal(r.status, 410);
    assert.equal(r.json.reason, 'expired');
    await close(s2);
  });

  test('6. redeem already-redeemed token → 410 reason=already-redeemed', async () => {
    const issued = service.issuePairing('HP-INDIGO', 7, db);
    const ok = await req(baseUrl, 'POST', '/api/planning/v2/kiosks/redeem', {
      body: { token: issued.token },
    });
    assert.equal(ok.status, 200);
    const repeat = await req(baseUrl, 'POST', '/api/planning/v2/kiosks/redeem', {
      body: { token: issued.token },
    });
    assert.equal(repeat.status, 410);
    assert.equal(repeat.json.reason, 'already-redeemed');
  });

  test('7. redeem revoked pairing → 410 reason=revoked', async () => {
    const issued = service.issuePairing('BAYRO-200', 7, db);
    service.revoke(issued.id, db, 1);
    const r = await req(baseUrl, 'POST', '/api/planning/v2/kiosks/redeem', {
      body: { token: issued.token },
    });
    assert.equal(r.status, 410);
    assert.equal(r.json.reason, 'revoked');
  });
});

describe('DELETE /kiosks/pairings/:id — revoke', () => {
  test('3. revoke happy path: 204 + DB marked + audit', async () => {
    const issued = service.issuePairing('GALLUS-135', 7, db);
    const before = auditCalls.length;
    const r = await req(baseUrl, 'DELETE', `/api/planning/v2/kiosks/pairings/${issued.id}`, {
      user: SYS,
    });
    assert.equal(r.status, 204);
    const row = db.prepare('SELECT * FROM kiosk_pairing WHERE id = ?').get(issued.id);
    assert.notEqual(row.revoked_at_utc, null);
    const revokeCall = auditCalls.slice(before).find((c) => c.event === 'KIOSK_REVOKE');
    assert.ok(revokeCall);
    assert.equal(revokeCall.user, '1');
  });

  test('8. revoke unknown id → 404', async () => {
    const r = await req(baseUrl, 'DELETE', '/api/planning/v2/kiosks/pairings/99999', {
      user: SYS,
    });
    assert.equal(r.status, 404);
    assert.equal(r.json.type, 'urn:ops:kiosk-pairing-not-found');
  });
});

describe('JWT refresh window', () => {
  test('11. >2h remaining → no refresh; <2h → fresh JWT', () => {
    const baseExpSec = Math.floor(Date.now() / 1000);
    const far = { jti: 'x', machine_code: 'M', kind: 'kiosk', exp: baseExpSec + 5 * 3600 };
    assert.equal(service.refreshSession(far), null);
    const near = { jti: 'y', machine_code: 'M', kind: 'kiosk', exp: baseExpSec + 30 * 60 };
    const fresh = service.refreshSession(near);
    assert.equal(typeof fresh, 'string');
    const v = service.verifySession(fresh);
    assert.equal(v.ok, true);
    assert.equal(v.claims.jti, 'y');
  });
});

describe('audit_log table — DB-side audit trail', () => {
  test('12. audit_log contains KIOSK_PAIR_ISSUE + KIOSK_PAIR_REDEEM + KIOSK_REVOKE rows', () => {
    const events = auditTable().map((r) => r.event);
    assert.ok(events.includes('KIOSK_PAIR_ISSUE'));
    assert.ok(events.includes('KIOSK_PAIR_REDEEM'));
    assert.ok(events.includes('KIOSK_REVOKE'));
    // No raw-token leak in any audit detail.
    for (const row of auditTable()) {
      assert.ok(
        !/^[A-Za-z0-9_-]{40,}$/.test(row.detail || ''),
        `audit row ${row.id} detail looks like a raw token: ${row.detail}`
      );
    }
  });
});
