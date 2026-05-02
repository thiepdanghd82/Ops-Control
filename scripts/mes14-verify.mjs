/**
 * MES-1.4 ad-hoc live-route verification.
 *
 * Boots the v2 router behind a real Express listener (test harness +
 * mountPlanning), runs the 5 curl-equivalent checks the sprint plan
 * asked for, prints a curl-shaped report. Removes the temp dir on exit.
 *
 * Why not curl against the production server: production users require
 * TOTP, which the dev shell can't satisfy without operator credentials.
 * This script exercises the same Express pipeline with a stub authMW
 * passthrough — the exact code path AC-1.4.* assertions cover.
 *
 * Usage:
 *   node scripts/mes14-verify.mjs
 */
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as connection from '../server/db/connection.js';
import { initSchema } from '../server/db/init.js';
import { mountPlanning } from '../domains/planning/server/index.js';

const PLANNER = JSON.stringify({
  username: 'planner1',
  role: 'user',
  modules: { planning: true, cost: true },
});

async function bootAt(flagValue) {
  connection._resetForTests();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-mes14-verify-'));
  process.env.DATA_DIR = tmpDir;
  process.env.OPS_DB_PATH = path.join(tmpDir, 'ops.db');
  fs.mkdirSync(path.join(tmpDir, 'Library', 'SystemConfig'), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, 'Library', 'SystemConfig', 'feature-flags.json'),
    JSON.stringify({ 'mes.workOrder.enabled': flagValue })
  );
  initSchema();

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const h = req.headers['x-test-user'];
    if (!h)
      return res
        .status(401)
        .type('application/problem+json')
        .json({ type: 'urn:ops:auth-required', status: 401 });
    const u = JSON.parse(h);
    req.user = { ok: true, user: u, role: u.role, modules: u.modules || {} };
    next();
  });
  const mounted = mountPlanning(app, { authMiddleware: (req, _res, next) => next() });

  const server = await new Promise((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}`, mounted, tmpDir };
}

async function curl(label, baseUrl, opts) {
  const r = await fetch(`${baseUrl}${opts.path}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.user ? { 'x-test-user': opts.user } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await r.text();
  console.log(`\n┌─ ${label}`);
  console.log(`│ ${opts.method || 'GET'} ${opts.path}`);
  console.log(`│ HTTP ${r.status} ${r.statusText}`);
  console.log(`│ Content-Type: ${r.headers.get('content-type') || '(none)'}`);
  if (text) {
    const pretty = (() => {
      try {
        return JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        return text;
      }
    })();
    console.log('│ Body:');
    for (const line of pretty.split('\n')) console.log(`│   ${line}`);
  }
  console.log('└─');
}

async function cleanup({ server, tmpDir }) {
  await new Promise((r) => server.close(r));
  connection._resetForTests();
  if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
}

async function main() {
  console.log('═══ Phase 1 — flag ON ═══════════════════════════════════════');
  let h = await bootAt(true);
  console.log(`mountPlanning() returned: ${h.mounted}`);

  await curl('1. POST /v2/work-orders với valid auth → expect 201', h.baseUrl, {
    method: 'POST',
    path: '/api/planning/v2/work-orders',
    user: PLANNER,
    body: {
      ccl_pn: 'TEST-001',
      customer: 'ACME',
      qty_planned: 1000,
      uom: 'PCS',
      due_date: '2026-12-31',
    },
  });

  await curl('2. POST /v2/work-orders WITHOUT auth → expect 401 RFC-7807', h.baseUrl, {
    method: 'POST',
    path: '/api/planning/v2/work-orders',
    body: { ccl_pn: 'X', customer: 'X', qty_planned: 1, uom: 'EA', due_date: '2026-12-31' },
  });

  await curl('3. PATCH /v2/work-orders/1 {status:"X"} → expect 400 forbidden_fields', h.baseUrl, {
    method: 'PATCH',
    path: '/api/planning/v2/work-orders/1',
    user: PLANNER,
    body: { status: 'RELEASED' },
  });

  await curl(
    '4. GET /api/planning/work-orders (legacy path) → expect 404 in this harness (not hijacked by v2)',
    h.baseUrl,
    { method: 'GET', path: '/api/planning/work-orders', user: PLANNER }
  );

  await cleanup(h);

  console.log('\n═══ Phase 2 — flag OFF ══════════════════════════════════════');
  h = await bootAt(false);
  console.log(`mountPlanning() returned: ${h.mounted}`);

  await curl('5. POST /v2/work-orders với flag OFF → expect 404', h.baseUrl, {
    method: 'POST',
    path: '/api/planning/v2/work-orders',
    user: PLANNER,
    body: { ccl_pn: 'TEST', customer: 'X', qty_planned: 1, uom: 'EA', due_date: '2026-12-31' },
  });

  await cleanup(h);
  console.log('\n═══ Done ════════════════════════════════════════════════════');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
