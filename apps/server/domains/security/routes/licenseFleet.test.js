// @ts-check
/**
 * License Manager fleet router — integration tests.
 * Run: node --test server/domains/security/routes/licenseFleet.test.js
 *
 * Stubs auth via x-test-role header, signs licenses with a runtime-ephemeral
 * keypair (no committed key) and points the verifier at its public half via
 * OPS_LICENSE_PUBKEY.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { generateKeyPairSync, sign } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createLicenseFleetRouter } from './licenseFleet.js';

const SIGNED_FIELDS = [
  'version',
  'installation_id',
  'customer',
  'tier',
  'max_users',
  'issued_at',
  'expires_at',
  'features',
];
const norm = (v) => (Array.isArray(v) ? [...v].sort().join(',') : (v ?? ''));
const canonicalize = (p) => SIGNED_FIELDS.map((k) => `${k}=${norm(p[k])}`).join('|');

const { privateKey: testPriv, publicKey: testPub } = generateKeyPairSync('ed25519');
process.env.OPS_LICENSE_PUBKEY = testPub.export({ format: 'pem', type: 'spki' }).toString();

const ID = 'd'.repeat(64);
const ID2 = 'e'.repeat(64);

function signLicense(overrides = {}) {
  const payload = {
    version: 2,
    installation_id: ID,
    customer: 'CCL Test',
    tier: 'M',
    max_users: 20,
    issued_at: '2026-06-04T00:00:00Z',
    expires_at: '2027-06-09T00:00:00Z',
    features: ['costing'],
    ...overrides,
  };
  return {
    ...payload,
    signature: sign(null, Buffer.from(canonicalize(payload)), testPriv).toString('base64'),
  };
}

let dir;
let auditRows;

function buildApp() {
  const app = express();
  app.use(express.json());
  const stubAuth = (req, res, next) => {
    const role = req.headers['x-test-role'];
    if (!role) return res.status(401).json({ error: 'auth required' });
    // The real authMiddleware attaches the machine the session was opened
    // from; the fleet routes gate on it, so the stub must carry it too.
    const install = req.headers['x-test-install'];
    req.user = {
      user: { role, username: `u-${role}` },
      role,
      installation_id: install || null,
    };
    next();
  };
  const auditSink = (event, user, ip, detail) => auditRows.push({ event, user, detail });
  app.use(
    '/api/license/fleet',
    createLicenseFleetRouter({ dataDir: dir, auth: stubAuth, audit: auditSink })
  );
  return app;
}

async function req(app, method, p, { role, body, install } = {}) {
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${p}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(role ? { 'x-test-role': role } : {}),
        ...(install ? { 'x-test-install': install } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } finally {
    server.close();
  }
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-fleet-int-'));
  auditRows = [];
});

describe('B1 heartbeat', () => {
  test('unauth → 401', async () => {
    const r = await req(buildApp(), 'POST', '/api/license/fleet/heartbeat', {
      body: { installation_id: ID },
    });
    assert.equal(r.status, 401);
  });
  test('any authenticated role records heartbeat', async () => {
    const r = await req(buildApp(), 'POST', '/api/license/fleet/heartbeat', {
      role: 'user',
      install: ID,
      body: { installation_id: ID, hostname: 'op-mac', status: { type: 'trial', isTrial: true } },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.recorded, true);
    assert.equal(r.body.pending_license, null);
  });
  test('malformed installation_id is refused', async () => {
    // Was 400 (fleetStore's own `bad-installation-id` throw). Since the
    // machine-binding gate landed it is 403 and never reaches the store: a
    // session can only ever claim its own id, and that id is HEX64-checked
    // when it is read off the session. fleetStore keeps its validation as
    // defence in depth — see fleetStore.test.js — it is simply no longer the
    // first line for this route.
    const r = await req(buildApp(), 'POST', '/api/license/fleet/heartbeat', {
      role: 'user',
      install: 'nope',
      body: { installation_id: 'nope' },
    });
    assert.equal(r.status, 403);
    assert.equal(r.body.reason, 'session-not-machine-bound');
  });
});

describe('B2 fleet list (sys-only)', () => {
  test('non-sys → 403', async () => {
    const r = await req(buildApp(), 'GET', '/api/license/fleet', { role: 'admin' });
    assert.equal(r.status, 403);
  });
  test('sys sees machines from heartbeats', async () => {
    const app = buildApp();
    await req(app, 'POST', '/api/license/fleet/heartbeat', {
      role: 'user',
      install: ID,
      body: { installation_id: ID, hostname: 'op-mac' },
    });
    const r = await req(app, 'GET', '/api/license/fleet', { role: 'sys' });
    assert.equal(r.status, 200);
    assert.equal(r.body.fleet.length, 1);
    assert.equal(r.body.fleet[0].installation_id, ID);
  });
});

describe('B2 upload (sys-only, verify before queue)', () => {
  test('non-sys → 403', async () => {
    const r = await req(buildApp(), 'POST', '/api/license/fleet/upload', {
      role: 'admin',
      body: { license: signLicense() },
    });
    assert.equal(r.status, 403);
  });
  test('valid signed license → queued + audit ok', async () => {
    const r = await req(buildApp(), 'POST', '/api/license/fleet/upload', {
      role: 'sys',
      body: { license: signLicense(), installation_id: ID },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.queued, true);
    const ev = auditRows.find((a) => a.event === 'LICENSE_UPLOAD');
    assert.ok(ev && JSON.parse(ev.detail).ok === true);
  });
  test('tampered license → 422 bad-signature', async () => {
    const lic = signLicense();
    lic.max_users = 50; // breaks signature
    const r = await req(buildApp(), 'POST', '/api/license/fleet/upload', {
      role: 'sys',
      body: { license: lic },
    });
    assert.equal(r.status, 422);
    assert.equal(r.body.reason, 'tier-mismatch'); // caught before sig (max_users≠tier ceiling)
  });
  test('signature-tampered (valid tier) → 422 bad-signature', async () => {
    const lic = signLicense();
    lic.customer = 'EVIL'; // re-canonicalize differs → sig invalid, tier still M/20
    const r = await req(buildApp(), 'POST', '/api/license/fleet/upload', {
      role: 'sys',
      body: { license: lic },
    });
    assert.equal(r.status, 422);
    assert.equal(r.body.reason, 'bad-signature');
  });
  test('installation-mismatch vs expected target → 422', async () => {
    const r = await req(buildApp(), 'POST', '/api/license/fleet/upload', {
      role: 'sys',
      body: { license: signLicense({ installation_id: ID }), installation_id: ID2 },
    });
    assert.equal(r.status, 422);
    assert.equal(r.body.reason, 'installation-mismatch');
  });
  test('trial license rejected (not distributable)', async () => {
    const r = await req(buildApp(), 'POST', '/api/license/fleet/upload', {
      role: 'sys',
      body: { license: { ...signLicense(), isTrial: true } },
    });
    assert.equal(r.status, 422);
    assert.equal(r.body.reason, 'trial-not-distributable');
  });
});

describe('B3 distribution', () => {
  test('uploaded license is delivered on next heartbeat, then cleared after confirm', async () => {
    const app = buildApp();
    await req(app, 'POST', '/api/license/fleet/upload', {
      role: 'sys',
      body: { license: signLicense(), installation_id: ID },
    });

    // heartbeat from the target machine → pending license delivered
    const hb1 = await req(app, 'POST', '/api/license/fleet/heartbeat', {
      role: 'user',
      install: ID,
      body: { installation_id: ID, hostname: 'op-mac' },
    });
    assert.ok(hb1.body.pending_license, 'pending license should be delivered');
    assert.equal(hb1.body.pending_license.installation_id, ID);

    // client confirms applied
    const dist = await req(app, 'POST', '/api/license/fleet/distributed', {
      role: 'user',
      install: ID,
      body: { installation_id: ID },
    });
    assert.equal(dist.body.distributed, true);
    assert.ok(auditRows.find((a) => a.event === 'LICENSE_DISTRIBUTED'));

    // subsequent heartbeat → no pending
    const hb2 = await req(app, 'POST', '/api/license/fleet/heartbeat', {
      role: 'user',
      install: ID,
      body: { installation_id: ID, hostname: 'op-mac' },
    });
    assert.equal(hb2.body.pending_license, null);
  });
});

/**
 * Audit 2026-09-11. Every route below took `installation_id` from the request
 * body with nothing tying it to the caller's session, so any authenticated
 * user — `viewonly` included — could speak for any machine whose 64-hex id
 * they knew. The desktop app already sends its installation_id at login and
 * authService stores it on the session (authService.js:766), so the binding
 * was available all along; the routes just never consulted it.
 */
describe('machine binding — a session may only speak for its own machine', () => {
  test('heartbeat for another machine → 403, and no record is written for it', async () => {
    const app = buildApp();
    const r = await req(app, 'POST', '/api/license/fleet/heartbeat', {
      role: 'viewonly',
      install: ID2, // attacker's own machine
      body: { installation_id: ID, hostname: 'spoofed', status: { type: 'real' } },
    });
    assert.equal(r.status, 403);

    // The victim must not appear in the fleet at all.
    const list = await req(app, 'GET', '/api/license/fleet', { role: 'sys' });
    assert.equal(
      list.body.fleet.find((m) => m.installation_id === ID),
      undefined,
      'a spoofed heartbeat must not create or overwrite the victim row'
    );
  });

  test('heartbeat cannot harvest another machine pending license', async () => {
    const app = buildApp();
    await req(app, 'POST', '/api/license/fleet/upload', {
      role: 'sys',
      body: { license: signLicense(), installation_id: ID },
    });
    const r = await req(app, 'POST', '/api/license/fleet/heartbeat', {
      role: 'viewonly',
      install: ID2,
      body: { installation_id: ID },
    });
    assert.equal(r.status, 403);
    assert.equal(r.body.pending_license, undefined, 'must not leak the signed license');
  });

  test('distributed for another machine → 403, and the license stays queued', async () => {
    const app = buildApp();
    await req(app, 'POST', '/api/license/fleet/upload', {
      role: 'sys',
      body: { license: signLicense(), installation_id: ID },
    });
    const bad = await req(app, 'POST', '/api/license/fleet/distributed', {
      role: 'viewonly',
      install: ID2,
      body: { installation_id: ID },
    });
    assert.equal(bad.status, 403);
    assert.equal(
      auditRows.find((a) => a.event === 'LICENSE_DISTRIBUTED'),
      undefined,
      'a refused call must not write a delivery row'
    );

    // The real machine still receives it.
    const hb = await req(app, 'POST', '/api/license/fleet/heartbeat', {
      role: 'user',
      install: ID,
      body: { installation_id: ID },
    });
    assert.ok(hb.body.pending_license, 'the queued license must survive the refused call');
  });

  test('a session with no bound machine is refused (fails closed)', async () => {
    // Sessions opened before this change carry installation_id 'unknown', and
    // web sessions carry a `web-` id minted per browser by webClientId()
    // (singleSession.js). The `web-` prefix exists precisely so that shape can
    // never be mistaken for a 64-hex desktop fingerprint here — a web id that
    // looked like one would let any browser act as a fleet machine.
    for (const bound of [
      undefined,
      'unknown',
      'web', // pre-2026-09-11 web sessions
      `web-${'a'.repeat(32)}`, // the per-browser id minted since
      `WEB-${'A'.repeat(32)}`, // and it is not case-sensitively sneakable
    ]) {
      const r = await req(buildApp(), 'POST', '/api/license/fleet/heartbeat', {
        role: 'user',
        install: bound,
        body: { installation_id: ID },
      });
      assert.equal(r.status, 403, `bound=${bound} must be refused`);
    }
  });

  test('sys is not exempt — the gate is about identity, not privilege', async () => {
    const r = await req(buildApp(), 'POST', '/api/license/fleet/heartbeat', {
      role: 'sys',
      install: ID2,
      body: { installation_id: ID },
    });
    assert.equal(r.status, 403);
  });
});

/**
 * DELETE /:installation_id — remove a machine from the fleet table.
 *
 * Added 2026-09-11. The table only ever grew: a decommissioned or re-imaged
 * machine stayed forever, and the screenshot that prompted this carried a
 * nameless trial row last seen three months earlier. Every dead row dilutes
 * the one question the table exists to answer.
 *
 * sys-only, unlike /heartbeat: this is administration of OTHER machines, which
 * is the same boundary /upload already sits behind. requireOwnMachine would be
 * exactly wrong here — you are never deleting your own row.
 */
describe('B2 forget machine (sys-only)', () => {
  test('non-sys → 403, machine survives', async () => {
    const app = buildApp();
    await req(app, 'POST', '/api/license/fleet/heartbeat', {
      role: 'user',
      install: ID,
      body: { installation_id: ID, hostname: 'keep-me' },
    });
    const r = await req(app, 'DELETE', `/api/license/fleet/${ID}`, { role: 'admin' });
    assert.equal(r.status, 403);

    const list = await req(app, 'GET', '/api/license/fleet', { role: 'sys' });
    assert.equal(list.body.fleet.length, 1, 'a refused delete must not remove anything');
  });

  test('sys removes it, and it is audited', async () => {
    const app = buildApp();
    await req(app, 'POST', '/api/license/fleet/heartbeat', {
      role: 'user',
      install: ID,
      body: { installation_id: ID, hostname: 'retired' },
    });
    const r = await req(app, 'DELETE', `/api/license/fleet/${ID}`, { role: 'sys' });
    assert.equal(r.status, 200);
    assert.equal(r.body.removed, true);
    assert.equal(r.body.had_pending, false);

    const list = await req(app, 'GET', '/api/license/fleet', { role: 'sys' });
    assert.equal(list.body.fleet.length, 0);
    assert.ok(auditRows.find((a) => a.event === 'LICENSE_FLEET_FORGET'));
  });

  test('a queued licence goes with it, and the response says so', async () => {
    const app = buildApp();
    await req(app, 'POST', '/api/license/fleet/heartbeat', {
      role: 'user',
      install: ID,
      body: { installation_id: ID, hostname: 'retired' },
    });
    await req(app, 'POST', '/api/license/fleet/upload', {
      role: 'sys',
      body: { license: signLicense(), installation_id: ID },
    });

    const r = await req(app, 'DELETE', `/api/license/fleet/${ID}`, { role: 'sys' });
    assert.equal(r.body.had_pending, true, 'the operator has to be told a signed licence was lost');

    const audit = auditRows.find((a) => a.event === 'LICENSE_FLEET_FORGET');
    assert.match(audit.detail, /had_pending/, 'the audit row must record it too');
  });

  test('a malformed id → 400, not a silent no-op', async () => {
    const r = await req(buildApp(), 'DELETE', '/api/license/fleet/not-a-real-id', { role: 'sys' });
    assert.equal(r.status, 400);
  });

  test('deleting an unknown machine → removed:false, and no audit row', async () => {
    const app = buildApp();
    const r = await req(app, 'DELETE', `/api/license/fleet/${ID2}`, { role: 'sys' });
    assert.equal(r.status, 200);
    assert.equal(r.body.removed, false);
    assert.equal(
      auditRows.find((a) => a.event === 'LICENSE_FLEET_FORGET'),
      undefined,
      'nothing happened, so nothing to record'
    );
  });

  test('unauth → 401', async () => {
    const r = await req(buildApp(), 'DELETE', `/api/license/fleet/${ID}`, {});
    assert.equal(r.status, 401);
  });
});
