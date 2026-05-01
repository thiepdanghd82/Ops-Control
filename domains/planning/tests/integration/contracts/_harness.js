/**
 * Shared test harness for MES-1.4 contract tests.
 *
 * Builds a bare Express app with:
 *   - in-memory better-sqlite3 (schema.sql exec'd at boot)
 *   - DI'd repo + codeGen + audit + service (per MES-1.3 factory pattern)
 *   - stub auth middleware reading req.user from `x-test-user` header
 *     (RFC-7807 401 when header absent — mirrors what authMiddleware
 *     SHOULD return; the production authMiddleware uses legacy envelope,
 *     pending Sprint SU alignment)
 *   - v2 router mounted at /api/planning/v2
 *
 * Runs the v2 router in isolation — no full server boot. Tests that need
 * the real authMiddleware + legacy router live in workOrderRoutesAuth
 * .integration.test.js.
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { createWorkOrderRepo } from '../../../server/repositories/workOrderRepo.js';
import { createWoCodeGenerator } from '../../../server/services/woCodeGenerator.js';
import { createWorkOrderService } from '../../../server/services/workOrderService.js';
import { createWorkOrderV2Router } from '../../../server/routes/workOrderV2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../../../server/db/schema.sql'),
  'utf-8'
);

export const PLANNER = JSON.stringify({
  username: 'planner1',
  role: 'user',
  modules: { planning: true, cost: true },
});
export const VIEWER = JSON.stringify({
  username: 'viewer1',
  role: 'viewonly',
  modules: { planning: true },
});
export const NO_PLANNING = JSON.stringify({
  username: 'cost-only',
  role: 'user',
  modules: { cost: true },
});

export function buildApp() {
  const db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  const repo = createWorkOrderRepo(db);
  const codeGen = createWoCodeGenerator(db);
  const auditStmt = db.prepare(
    'INSERT INTO audit_log (ts, event, user, ip, detail) VALUES (?, ?, ?, ?, ?)'
  );
  const audit = (row) =>
    auditStmt.run(row.ts, row.event, row.user || '-', row.ip || '-', row.detail || '');
  const service = createWorkOrderService({ db, repo, codeGen, audit });

  const app = express();
  app.use(express.json());

  // Stub authMiddleware: parses x-test-user header into req.user.
  app.use((req, res, next) => {
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
  });

  app.use('/api/planning/v2', createWorkOrderV2Router({ service }));
  return { app, db, service, repo };
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

export async function req(baseUrl, method, path, { user, body, query } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers['x-test-user'] = user;
  const url = query
    ? `${baseUrl}${path}?${new URLSearchParams(query).toString()}`
    : `${baseUrl}${path}`;
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

export const VALID_BODY = {
  ccl_pn: 'PN-1',
  customer: 'Acme',
  qty_planned: 100,
  uom: 'EA',
  due_date: '2026-12-31',
};
