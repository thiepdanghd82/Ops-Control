/**
 * Shared test harness for MES-2.3 kiosk integration + contract tests.
 *
 * Builds a bare Express app with:
 *   - in-memory better-sqlite3 (schema.sql exec'd at boot)
 *   - kioskTokenService wired with a deterministic 64-hex secret
 *   - kiosksV2 router mounted at /api/planning/v2/kiosks
 *   - stub auth middleware reading req.user from `x-test-user` header
 *     (unset → 401 RFC-7807 — same shape as the MES-1.4 contract harness)
 *   - validateMachineCode stub that recognises a fixed set of codes
 *
 * The harness exposes `auditCalls` so tests can assert audit emission
 * without round-tripping through the audit_log table.
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { createKioskTokenService } from '../../server/services/kioskTokenService.js';
import { createKioskV2Router } from '../../server/routes/kiosksV2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../../server/db/schema.sql'),
  'utf-8'
);

export const PLANNER = JSON.stringify({
  id: 7,
  username: 'planner1',
  role: 'user',
  modules: { planning: true },
});
export const SYS = JSON.stringify({
  id: 1,
  username: 'sys1',
  role: 'sys',
  modules: { planning: true },
});
export const VIEWER = JSON.stringify({
  id: 9,
  username: 'viewer1',
  role: 'viewonly',
  modules: { planning: true },
});

export const KNOWN_MACHINES = ['GALLUS-135', 'BROTECH-192', 'BAYRO-200', 'HP-INDIGO'];

export function buildKioskApp(opts = {}) {
  const db = new Database(':memory:');
  db.exec(SCHEMA_SQL);

  const auditCalls = [];
  const audit = (row) => auditCalls.push(row);

  // Persist to audit_log too so tests that read the table see rows.
  const auditStmt = db.prepare(
    'INSERT INTO audit_log (ts, event, user, ip, detail) VALUES (?, ?, ?, ?, ?)'
  );
  const auditBoth = (row) => {
    auditCalls.push(row);
    auditStmt.run(row.ts, row.event, row.user || '-', row.ip || '-', row.detail || '');
  };

  const secret = opts.secret || crypto.randomBytes(32).toString('hex');
  const service = createKioskTokenService({ secret, audit: auditBoth, ...opts.serviceOpts });

  // Stub auth: parse x-test-user header into req.user. Absence → 401.
  const authMiddleware = (req, res, next) => {
    const header = req.headers['x-test-user'];
    if (!header) {
      return res
        .status(401)
        .type('application/problem+json')
        .json({ type: 'urn:ops:auth-required', status: 401 });
    }
    const user = JSON.parse(header);
    req.user = { ok: true, user, role: user.role, modules: user.modules || {} };
    next();
  };

  const validateMachineCode = opts.validateMachineCode || ((code) => KNOWN_MACHINES.includes(code));

  const router = createKioskV2Router({ db, service, validateMachineCode, authMiddleware });

  const app = express();
  app.use(express.json());
  app.use('/api/planning/v2/kiosks', router);

  return {
    app,
    db,
    service,
    audit,
    auditCalls,
    secret,
    auditTable: () => db.prepare('SELECT * FROM audit_log ORDER BY id').all(),
  };
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

export async function req(baseUrl, method, urlPath, { user, body, query } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers['x-test-user'] = user;
  const url = query
    ? `${baseUrl}${urlPath}?${new URLSearchParams(query).toString()}`
    : `${baseUrl}${urlPath}`;
  const r = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
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
