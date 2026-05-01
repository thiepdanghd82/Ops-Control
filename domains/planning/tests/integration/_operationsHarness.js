/**
 * Shared test harness for MES-2.5 operations contract tests.
 *
 * Builds an in-memory better-sqlite3 + the real chain:
 *   workOrderRepo → operationService → operationV2 router
 *   kioskTokenService → requireKioskSession middleware
 *   idempotencyStore → idempotency middleware
 *
 * No HTTP-level stubbing; the only mocking surface is the auditCalls
 * spy so tests can assert audit_log writes without round-tripping the
 * table. Helpers seed a WO + op, mint a kiosk session JWT, and expose
 * a thin `req` for HTTP probes.
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { createWorkOrderRepo } from '../../server/repositories/workOrderRepo.js';
import { createOperationService } from '../../server/services/operationService.js';
import { createKioskTokenService } from '../../server/services/kioskTokenService.js';
import { createIdempotencyStore } from '../../server/services/idempotencyStore.js';
import { createRequireKioskSession } from '../../server/middleware/requireKioskSession.js';
import { createIdempotencyMiddleware } from '../../server/middleware/idempotency.js';
import { createOperationV2Router } from '../../server/routes/operationV2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../../server/db/schema.sql'),
  'utf-8'
);

export const MACHINE = 'GALLUS-135';

export function buildOpsApp(opts = {}) {
  const db = new Database(':memory:');
  db.exec(SCHEMA_SQL);

  const auditCalls = [];
  const auditStmt = db.prepare(
    'INSERT INTO audit_log (ts, event, user, ip, detail) VALUES (?, ?, ?, ?, ?)'
  );
  const audit = (row) => {
    auditCalls.push(row);
    auditStmt.run(row.ts, row.event, row.user || '-', row.ip || '-', row.detail || '');
  };

  const repo = createWorkOrderRepo(db);
  const opService = createOperationService({ db, repo, audit });
  const secret = opts.secret || crypto.randomBytes(32).toString('hex');
  const kioskService = createKioskTokenService({ secret, audit, ...(opts.kioskOpts || {}) });
  const idempotencyStore = createIdempotencyStore({ db });
  const requireKioskSession = createRequireKioskSession({
    kioskService,
    db,
    revocationCacheMs: 0, // disable cache in tests so revocation is immediate
  });
  const idempotencyMiddleware = createIdempotencyMiddleware({ store: idempotencyStore });

  const router = createOperationV2Router({
    db,
    repo,
    service: opService,
    requireKioskSession,
    idempotencyMiddleware,
  });

  const app = express();
  app.use(express.json());
  app.use('/api/planning/v2/operations', router);

  return {
    app,
    db,
    repo,
    service: opService,
    kioskService,
    idempotencyStore,
    audit,
    auditCalls,
    secret,
  };
}

// Insert a kiosk_pairing row + return a fresh session JWT bound to the
// machine. The pairing is marked redeemed so requireKioskSession's
// revocation check passes.
export function mintKioskSession(harness, { machineCode = MACHINE, revoked = false } = {}) {
  const jti = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  harness.db
    .prepare(
      `INSERT INTO kiosk_pairing
         (token_hash, machine_code, issued_by_user_id, issued_at_utc,
          expires_at_utc, redeemed_at_utc, session_jti, revoked_at_utc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      crypto.randomBytes(16).toString('hex'),
      machineCode,
      1,
      new Date(now).toISOString(),
      new Date(now + 12 * 3600 * 1000).toISOString(),
      new Date(now).toISOString(),
      jti,
      revoked ? new Date(now).toISOString() : null
    );
  // Mint a JWT carrying the same jti/machine_code via the test secret.
  // Reuse the kioskTokenService internals by signing a JWT directly:
  // test-only path that mirrors what redeem() would have produced.
  const exp = Math.floor((now + 12 * 3600 * 1000) / 1000);
  const claims = {
    jti,
    machine_code: machineCode,
    kind: 'kiosk',
    iat: Math.floor(now / 1000),
    exp,
  };
  // Use the kioskService's own sign path indirectly: refreshSession
  // can't help (it requires near-expiry). Mint via the harness's secret.
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', harness.secret)
    .update(`${head}.${body}`)
    .digest('base64url');
  return { jwt: `${head}.${body}.${sig}`, jti, machineCode, exp };
}

// Seed a WO + one op. Returns { woId, woCode, opId }.
export function seedOp(
  db,
  {
    status = 'DISPATCHED',
    workCentre = MACHINE,
    code = 'WO-2026-05-00001',
    priority = 5,
    dueDate = '2026-12-31',
  } = {}
) {
  const wo = db
    .prepare(
      `INSERT INTO work_order (code, ccl_pn, customer, qty_planned, uom, due_date, priority, status, raw_json, created_by)
       VALUES (?, 'PN-1', 'Acme', 100, 'EA', ?, ?, 'RELEASED', '{}', 'tester')`
    )
    .run(code, dueDate, priority);
  const woId = Number(wo.lastInsertRowid);
  const op = db
    .prepare(
      `INSERT INTO work_order_op (work_order_id, seq, op_type, work_centre_no, status, raw_json)
       VALUES (?, 10, 'FLEXO', ?, ?, '{}')`
    )
    .run(woId, workCentre, status);
  return { woId, woCode: code, opId: Number(op.lastInsertRowid) };
}

export async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

export const close = (server) => new Promise((r) => server.close(r));

export async function req(baseUrl, method, urlPath, { jwt, body, idemKey, query } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  if (idemKey) headers['Idempotency-Key'] = idemKey;
  const url = query
    ? `${baseUrl}${urlPath}?${new URLSearchParams(query).toString()}`
    : `${baseUrl}${urlPath}`;
  const r = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: r.status, headers: r.headers, json, text };
}

// Helper: random UUID-ish key for idempotency.
export const uuid = () => crypto.randomUUID();
