// MES-2.8 — shared fixtures + UI helpers for the kiosk e2e specs.
// Direct-DB seeding via better-sqlite3 (faster than driving the planner
// admin UI to create a WO + op + pairing card on every test). Env-shaped
// values (TEST_DB path, OPS_KIOSK_KEY, …) are written by _globalSetup to a
// single JSON file (TEST_ENV_FILE in playwright.config.js) — process.env
// writes from globalSetup don't propagate to forked test workers.
import { test as base, expect } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const TEST_MACHINE = 'TEST-MACHINE-01';
const TEST_WO_CODE = 'TEST-WO-001';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(__dirname, '..', '..', '..', '..', '.playwright-tmp', '.e2e-env.json');

let _envCache = null;
function requireTestEnv(key) {
  if (!_envCache) {
    try {
      _envCache = JSON.parse(fs.readFileSync(ENV_FILE, 'utf8'));
    } catch {
      throw new Error(`e2e env file missing at ${ENV_FILE} — globalSetup did not run`);
    }
  }
  const v = _envCache[key];
  if (!v) throw new Error(`${key} missing from e2e env file — check _globalSetup resolution`);
  return v;
}

function openTestDb() {
  return new Database(requireTestEnv('OPS_E2E_TEST_DB_PATH'));
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// Seed: 1 WO + 1 op (DISPATCHED on TEST-MACHINE-01). Returns { woId, opId, woCode }.
function seedWorkOrderAndOp(db) {
  // Make WO code stable across runs (test relies on data-testid).
  // Drop any prior test rows so the spec is rerunnable.
  db.exec(
    `DELETE FROM op_status_event;
     DELETE FROM kiosk_pairing;
     DELETE FROM work_order_op;
     DELETE FROM work_order;`
  );
  const wo = db
    .prepare(
      `INSERT INTO work_order (code, ccl_pn, customer, qty_planned, uom, due_date, priority, status, raw_json, created_by)
       VALUES (?, 'PN-TEST', 'Acme Test', 100, 'EA', '2026-12-31', 5, 'RELEASED', '{}', 'tester')`
    )
    .run(TEST_WO_CODE);
  const woId = Number(wo.lastInsertRowid);
  const op = db
    .prepare(
      `INSERT INTO work_order_op (work_order_id, seq, op_type, work_centre_no, status, raw_json)
       VALUES (?, 10, 'FLEXO', ?, 'DISPATCHED', '{}')`
    )
    .run(woId, TEST_MACHINE);
  return { woId, opId: Number(op.lastInsertRowid), woCode: TEST_WO_CODE };
}

// Mint a kiosk pairing row + return the JWT directly (bypasses the
// /redeem flow because Playwright fixtures need the JWT injected into
// localStorage before the first page nav).
function mintKioskJwt(db, machineCode) {
  const jti = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  const exp = Math.floor((now + 12 * 3600 * 1000) / 1000);
  const tokenHash = crypto.randomBytes(16).toString('hex');
  db.prepare(
    `INSERT INTO kiosk_pairing
       (token_hash, machine_code, issued_by_user_id, issued_at_utc,
        expires_at_utc, redeemed_at_utc, session_jti)
     VALUES (?, ?, 1, ?, ?, ?, ?)`
  ).run(
    tokenHash,
    machineCode,
    new Date(now).toISOString(),
    new Date(now + 12 * 3600 * 1000).toISOString(),
    new Date(now).toISOString(),
    jti
  );
  // Sign the JWT with the same OPS_KIOSK_KEY the server resolved at
  // boot. _globalSetup resolves it (shell env > project .env) and writes
  // into the e2e env file.
  const secret = requireTestEnv('OPS_KIOSK_KEY');
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const claims = {
    jti,
    machine_code: machineCode,
    kind: 'kiosk',
    iat: Math.floor(now / 1000),
    exp,
  };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return { jwt: `${head}.${body}.${sig}`, jti, machineCode };
}

function revokePairingByJti(db, jti) {
  db.prepare(`UPDATE kiosk_pairing SET revoked_at_utc = ? WHERE session_jti = ?`).run(
    new Date().toISOString(),
    jti
  );
}

function readAuditEvents(db, opId) {
  return db
    .prepare(
      `SELECT event FROM audit_log
       WHERE event LIKE 'OP_%' AND CAST(json_extract(detail, '$.op_id') AS INTEGER) = ?
       ORDER BY id ASC`
    )
    .all(opId)
    .map((r) => r.event);
}

function readOpStatus(db, opId) {
  const row = db.prepare(`SELECT status FROM work_order_op WHERE id = ?`).get(opId);
  return row?.status;
}

function readIdempotencyLedgerCount(db) {
  return db.prepare(`SELECT COUNT(*) AS n FROM idempotency_ledger`).get().n;
}

// Inject the kiosk JWT into localStorage before the app boots so the
// page lands directly on the dispatch list (no /pair detour). Mirrors
// what PairingScreen would have written.
async function preloadSession(page, machineCode, jwt, jti) {
  await page.goto('/kiosk/');
  await page.evaluate(
    ({ machine, jwt, jti }) => {
      localStorage.setItem(
        'opskiosk.session.v1',
        JSON.stringify({
          session_jwt: jwt,
          machine_code: machine,
          jti,
          expires_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
          paired_at: new Date().toISOString(),
        })
      );
    },
    { machine: machineCode, jwt, jti }
  );
  await page.reload();
}

export const test = base.extend({
  // Per-test seeding so each spec starts on a clean slate.
  seeded: async ({}, use) => {
    const db = openTestDb();
    const seed = seedWorkOrderAndOp(db);
    const session = mintKioskJwt(db, TEST_MACHINE);
    await use({ db, ...seed, ...session });
    db.close();
  },
});

export {
  expect,
  TEST_MACHINE,
  TEST_WO_CODE,
  preloadSession,
  revokePairingByJti,
  readAuditEvents,
  readOpStatus,
  readIdempotencyLedgerCount,
  sha256Hex,
};
